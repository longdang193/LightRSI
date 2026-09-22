import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createContextCleanerControlService } from "../src/control-service.js";
import { sampleSnapshot } from "./fixtures.js";

test("direct occurrence release creates internal evidence without task analysis", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-cleaner-direct-release-"));
  try {
    let executionRequest: { cleanPlanId: string; selectedTaskIds: string[]; occurrenceSelections?: unknown[] } | undefined;
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
      async executeApprovedClean(request: { cleanPlanId: string; selectedTaskIds: string[]; occurrenceSelections?: unknown[] }) {
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
    assert.deepEqual(executionRequest?.selectedTaskIds, []);
    assert.deepEqual(executionRequest?.occurrenceSelections, [{
      stableId: "item-a", fingerprint: "digest-a", completionEvidence: ["completed"],
      continuingUseful: false, releaseIntent: "release", retainedFindings: [],
      nothingReusable: true, dependencyDirection: "none",
    }]);
    const plan = await service.readPlan(executionRequest!.cleanPlanId);
    assert.deepEqual(plan?.tasks, []);
    assert.equal(plan?.occurrenceDigests?.["item-a"], "digest-a");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
