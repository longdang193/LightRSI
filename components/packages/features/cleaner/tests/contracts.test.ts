import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTEXT_CLEAN_SCHEMA_VERSION,
  type ContextCleanerHostBridge,
  type ContextCleanReceipt,
  type ContextCleanSnapshot,
} from "../src/index.js";
import { samplePlan, sampleSnapshot } from "./fixtures.js";

function receipt(status: ContextCleanReceipt["status"]): ContextCleanReceipt {
  return {
    schemaVersion: CONTEXT_CLEAN_SCHEMA_VERSION,
    planId: "clean-plan-1",
    hostId: "fake-host",
    sessionId: "session-1",
    status,
    selectedTaskIds: ["task-a"],
    estimatedSavedTokens: 50,
    estimatedSavedChars: 200,
    tokenCountMode: "estimated",
    deferredTaskIds: [],
    fallbackUsed: false,
    reasons: [],
    updatedAt: "2026-08-20T00:00:00.000Z",
  };
}

function snapshot(): ContextCleanSnapshot {
  return {
    ...sampleSnapshot(),
    capturedAt: "2026-08-20T00:00:00.000Z",
    tokenCountMode: "chars_only",
    tokenCountMethod: "utf16_chars",
  };
}

test("fake Host backend satisfies the shared contract without production behavior", async () => {
  const calls: string[] = [];
  const bridge: ContextCleanerHostBridge = {
    hostId: "fake-host",
    rewriteMode: "request_overlay",
    async listSessions() {
      return [{ sessionId: "session-1", updatedAt: "2026-08-20T00:00:00.000Z" }];
    },
    async readCleanSnapshot() {
      return snapshot();
    },
    async executeApprovedClean() {
      calls.push("execute");
      return receipt("scheduled");
    },
    async readCleanReceipt() {
      calls.push("read");
      return receipt("scheduled");
    },
    async cancelCleanPlan() {
      calls.push("cancel");
      return receipt("cancelled");
    },
  };

  assert.equal((await bridge.listSessions())[0]?.sessionId, "session-1");
  assert.equal((await bridge.readCleanSnapshot("session-1")).tokenCountMode, "chars_only");
  assert.equal((await bridge.executeApprovedClean({
    cleanPlanId: "clean-plan-1",
    sessionId: "session-1",
    baseRevision: "rev-1",
    selectedTaskIds: ["task-a"],
  })).status, "scheduled");
  assert.equal((await bridge.readCleanReceipt("clean-plan-1"))?.status, "scheduled");
  assert.equal((await bridge.cancelCleanPlan("clean-plan-1")).status, "cancelled");
  assert.deepEqual(calls, ["execute", "read", "cancel"]);
});

test("shared plan fixture is data-only and contains no raw Host payload", () => {
  const plan = samplePlan();
  assert.equal(plan.schemaVersion, CONTEXT_CLEAN_SCHEMA_VERSION);
  assert.equal(plan.tasks[0]?.recommendation, "clean");
  assert.equal("adapterMetadata" in plan, false);
});
