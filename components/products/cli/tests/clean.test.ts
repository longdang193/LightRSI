import assert from "node:assert/strict";
import test from "node:test";

import { handleCleanCommand } from "../src/clean.js";
import { createCodexCleanRecommendationProvider } from "../src/hosts/cleaner.js";
import type { JsonModelApiConfig, JsonModelClient } from "@lightrsi/runtime-core";

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

test("clean CLI canonicalizes session aliases before analysis", async () => {
  let analyzedSessionId = "";
  const backend = {
    async analyze(sessionId: string) { analyzedSessionId = sessionId; return plan; },
    async readPlan() { return plan; },
    async approve() { return receipt; },
    async readReceipt() { return receipt; },
    async cancel() { return { ...receipt, status: "cancelled" }; },
  };

  await handleCleanCommand({
    args: ["--session", "codex-host-session-1"],
    backend,
    resolveSessionId: async () => "codex-synth-session-1",
  });

  assert.equal(analyzedSessionId, "codex-synth-session-1");
});

test("Codex Cleaner uses ready estimator config for recommendations", async () => {
  let clientConfig: JsonModelApiConfig | undefined;
  const client: JsonModelClient = {
    async request() {
      return {
        text: JSON.stringify({
          tasks: [{
            taskId: "task-1",
            label: "done",
            description: "completed",
            summary: "completed task",
            recommendation: "clean",
            reasonCodes: ["completed"],
            confidence: 0.9,
          }],
        }),
      };
    },
  };
  const provider = createCodexCleanRecommendationProvider({
    enabled: true,
    baseUrl: "http://127.0.0.1:20128/v1",
    apiKey: "test-key",
    model: "combo-high",
  }, (config) => {
    clientConfig = config;
    return client;
  });

  assert.ok(provider);
  const result = await provider.recommend({
    tasks: [{
      taskId: "task-1",
      digest: "digest",
      label: "done",
      description: "completed",
      summary: "completed task",
      lifecycleState: "completed",
      tokenCount: 10,
      charCount: 40,
      tokenPercent: 100,
      selectable: true,
      evidence: {},
    }],
  });

  assert.equal(JSON.parse(String(result.output)).tasks[0].taskId, "task-1");
  assert.deepEqual(clientConfig, {
    baseUrl: "http://127.0.0.1:20128/v1",
    apiKey: "test-key",
    model: "combo-high",
    requestTimeoutMs: 60_000,
  });
});
