import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { analyzeContextCleanSession } from "../src/orchestrator.js";
import { sampleSnapshot } from "./fixtures.js";

test("clean analysis fails closed with failing attribution status when registry load errors", async () => {
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
    assert.deepEqual(result.reasons, [
      "recommendation_provider_unavailable",
      "task_registry_unavailable",
    ]);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
