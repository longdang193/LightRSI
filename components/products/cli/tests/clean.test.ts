import assert from "node:assert/strict";
import test from "node:test";

import { handleCleanCommand } from "../src/clean.js";

const plan = {
  planId: "plan-1",
  hostId: "codex",
  sessionId: "session-1",
  usedTokens: 10,
  usedChars: 40,
  protectedTokens: 0,
  protectedChars: 0,
  unassignedTokens: 0,
  unassignedChars: 0,
  tokenCountMode: "estimated",
  tasks: [{ taskId: "task-1", label: "done", description: "", lifecycleState: "completed", tokenCount: 10, charCount: 40, tokenPercent: 100, recommendation: "clean", reasonCodes: [], selectable: true }],
};

const receipt = {
  planId: "plan-1",
  status: "scheduled",
  selectedTaskIds: ["task-1"],
  estimatedSavedTokens: 10,
  estimatedSavedChars: 40,
  fallbackUsed: false,
  deferredTaskIds: [],
  reasons: [],
};

test("clean CLI analyzes and approves only selected task IDs", async () => {
  const calls: string[] = [];
  const backend = {
    async analyze() { calls.push("analyze"); return plan; },
    async readPlan() { calls.push("read-plan"); return plan; },
    async approve(_planId: string, selectedTaskIds: string[]) { calls.push(selectedTaskIds.join(",")); return receipt; },
    async readReceipt() { return receipt; },
    async cancel() { return { ...receipt, status: "cancelled" }; },
  };
  assert.match((await handleCleanCommand({ args: ["--session", "session-1"], backend })).text, /plan-1/);
  assert.match((await handleCleanCommand({ args: ["--plan", "plan-1", "--select", "task-1"], backend })).text, /scheduled/);
  assert.deepEqual(calls, ["analyze", "read-plan", "task-1"]);
});
