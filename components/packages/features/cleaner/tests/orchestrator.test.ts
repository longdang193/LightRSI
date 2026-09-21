import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { analyzeContextCleanSession, approveContextCleanSelection } from "../src/orchestrator.js";
import { createContextCleanerControlService } from "../src/control-service.js";
import { readContextCleanReceipt } from "../src/clean-receipt-store.js";
import { sampleSnapshot } from "./fixtures.js";

test("clean analysis keeps explicit pruning available when registry load errors", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-cleaner-orchestrator-"));
  try {
    const result = await analyzeContextCleanSession({
      stateDir,
      sessionId: "session-1",
      bridge: {
        hostId: "codex",
        rewriteMode: "response_chain_rebase",
        async listSessions() { return []; },
        async readCleanSnapshot() {
          return {
            ...sampleSnapshot(),
            capturedAt: "2026-09-20T10:00:00.000Z",
            tokenCountMode: "chars_only" as const,
            tokenCountMethod: "fixture",
          };
        },
        async readAttributionStatus() { return "failing"; },
        async executeApprovedClean() { throw new Error("not used"); },
        async readCleanReceipt() { return undefined; },
        async cancelCleanPlan() { throw new Error("not used"); },
      },
      loadRegistry: async () => { throw new Error("corrupt registry"); },
    });

    assert.equal(result.plan.attributionStatus, "failing");
    assert.equal(result.fallbackUsed, true);
    assert.deepEqual(result.reasons, ["recommendation_provider_unavailable"]);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("occurrence approval persists frozen evidence, including explicit nothingReusable", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-cleaner-occurrence-approval-"));
  try {
    const bridge = {
      hostId: "codex" as const,
      rewriteMode: "response_chain_rebase" as const,
      async listSessions() { return []; },
      async readCleanSnapshot() {
        return {
          ...sampleSnapshot(),
          capturedAt: "2026-09-20T10:00:00.000Z",
          tokenCountMode: "chars_only" as const,
          tokenCountMethod: "fixture",
        };
      },
      async executeApprovedClean() { throw new Error("not used"); },
      async readCleanReceipt() { return undefined; },
      async cancelCleanPlan() { throw new Error("not used"); },
    };
    const analyzed = await analyzeContextCleanSession({ stateDir, sessionId: "session-1", bridge });
    const receipt = await approveContextCleanSelection({
      stateDir,
      request: {
        schemaVersion: 1,
        cleanPlanId: analyzed.plan.planId,
        hostId: "codex",
        sessionId: "session-1",
        baseRevision: "rev-1",
        approvedAt: "2026-09-20T10:01:00.000Z",
        selectedTaskIds: [],
        occurrenceSelections: [{
          stableId: "item-a",
          fingerprint: "digest-a",
          completionEvidence: ["completed"],
          continuingUseful: false,
          releaseIntent: "release",
          retainedFindings: [],
          nothingReusable: true,
          dependencyDirection: "none",
        }],
      },
    });
    assert.equal(receipt.status, "approved");
    assert.deepEqual(receipt.selectedTaskIds, ["item-a"]);
    assert.equal(receipt.estimatedSavedChars, 120);
    const stored = await readContextCleanReceipt({ stateDir, planId: analyzed.plan.planId });
    assert.deepEqual(stored.value?.evidence?.occurrenceSelections, receipt.evidence?.occurrenceSelections);
    await assert.rejects(
      () => approveContextCleanSelection({
        stateDir,
        request: {
          schemaVersion: 1,
          cleanPlanId: analyzed.plan.planId,
          hostId: "codex",
          sessionId: "session-1",
          baseRevision: "rev-1",
          approvedAt: "2026-09-20T10:02:00.000Z",
          selectedTaskIds: [],
          occurrenceSelections: [{
            stableId: "item-a",
            fingerprint: "digest-a",
            completionEvidence: ["changed"],
            continuingUseful: false,
            releaseIntent: "release",
            retainedFindings: [],
            nothingReusable: true,
            dependencyDirection: "none",
          }],
        },
      }),
      /clean_approval_facts_conflict/,
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("direct occurrence release creates internal evidence without task analysis", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-cleaner-direct-release-"));
  try {
    let executionRequest: { cleanPlanId: string; selectedTaskIds: string[] } | undefined;
    const bridge = {
      hostId: "codex" as const,
      rewriteMode: "response_chain_rebase" as const,
      async listSessions() { return []; },
      async readCleanSnapshot() {
        return {
          ...sampleSnapshot(),
          taskIds: undefined,
          capturedAt: "2026-09-20T10:00:00.000Z",
          tokenCountMode: "chars_only" as const,
          tokenCountMethod: "fixture",
        };
      },
      async executeApprovedClean(request: { cleanPlanId: string; selectedTaskIds: string[] }) {
        executionRequest = request;
        return {
          ...({
            schemaVersion: 1, hostId: "codex", sessionId: "session-1",
            planId: request.cleanPlanId, selectedTaskIds: request.selectedTaskIds,
            estimatedSavedTokens: null, estimatedSavedChars: 120, tokenCountMode: "chars_only",
            deferredTaskIds: [] as string[], reasons: [] as string[], updatedAt: "2026-09-20T10:00:00.000Z",
            status: "approved", fallbackUsed: false,
          } as const),
        };
      },
      async readCleanReceipt() { return undefined; },
      async cancelCleanPlan() { throw new Error("not used"); },
    };
    const service = createContextCleanerControlService({
      stateDir,
      bridge,
    });
    const receipt = await service.releaseOccurrences("session-1", [{
      stableId: "item-a", fingerprint: "digest-a", completionEvidence: ["completed"],
      continuingUseful: false, releaseIntent: "release", retainedFindings: [],
      nothingReusable: true, dependencyDirection: "none",
    }]);
    assert.equal(receipt.status, "approved");
    assert.ok(executionRequest?.cleanPlanId);
    assert.deepEqual(executionRequest?.selectedTaskIds, ["occurrence:item-a"]);
    const plan = await service.readPlan(executionRequest!.cleanPlanId);
    assert.deepEqual(plan?.tasks, []);
    assert.equal(plan?.occurrenceDigests?.["item-a"], "digest-a");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
