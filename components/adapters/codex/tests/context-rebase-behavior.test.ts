import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCodexContextRewrite,
  buildCodexRebaseRequest,
  executeCodexRebaseWithFallback,
  type CodexEffectiveHistory,
  type JsonObject,
} from "../src/context-rewrite/index.js";

const EVICTED_SENTINEL = "EVICT_ME_cdr02_behavior";
const RETAINED_SENTINEL = "KEEP_ME_cdr02_behavior";
const CURRENT_SENTINEL = "CURRENT_INPUT_cdr02_behavior";

type ResponsesPayload = JsonObject & {
  model?: string;
  stream?: boolean;
  previous_response_id?: string;
  prompt_cache_key?: string;
  instructions?: string;
  tools?: unknown[];
  input?: unknown[];
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function textFromResponsesInput(input: unknown): string {
  if (!Array.isArray(input)) return "";
  const parts: string[] = [];
  for (const item of input) {
    const entry = asObject(item);
    if (typeof entry.content === "string") parts.push(entry.content);
    if (typeof entry.output === "string") parts.push(entry.output);
    if (typeof entry.arguments === "string") parts.push(entry.arguments);
    if (Array.isArray(entry.content)) {
      for (const block of entry.content) {
        if (!block || typeof block !== "object") continue;
        if (typeof block.text === "string") parts.push(block.text);
        if (typeof block.content === "string") parts.push(block.content);
      }
    }
  }
  return parts.join("\n");
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

function baseResponsesPayload(): ResponsesPayload {
  return {
    model: "gpt-5.4-mini",
    stream: true,
    previous_response_id: "resp-old-chain",
    prompt_cache_key: "pk-stable-codex-session",
    instructions: "Follow the repo instructions.",
    tools: [
      {
        type: "function",
        function: {
          name: "run_tests",
          parameters: { type: "object", properties: { command: { type: "string" } } },
        },
      },
    ],
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: `${CURRENT_SENTINEL}: continue the migration` }],
      },
    ],
  };
}

function effectiveHistoryFixture(): CodexEffectiveHistory {
  return {
    revision: "history-rev-1",
    replayableItems: [
      {
        stableItemId: "developer-1",
        nativeId: "msg-dev-1",
        item: { role: "developer", content: "Shared stable instructions" },
      },
      {
        stableItemId: "evicted-user-1",
        nativeId: "msg-user-evict",
        item: { role: "user", content: `obsolete details ${EVICTED_SENTINEL}` },
      },
      {
        stableItemId: "retained-user-1",
        nativeId: "msg-user-keep",
        item: { role: "user", content: `important details ${RETAINED_SENTINEL}` },
      },
      {
        stableItemId: "call-1",
        nativeId: "fc-1",
        item: { type: "function_call", call_id: "call-1", name: "run_tests", arguments: "{\"command\":\"npm test\"}" },
      },
      {
        stableItemId: "result-1",
        nativeId: "fco-1",
        item: { type: "function_call_output", call_id: "call-1", output: "{\"ok\":true}" },
      },
    ],
    observationOnlyItems: [
      {
        stableItemId: "web-search-1",
        nativeId: "ws-1",
        item: { type: "web_search_call", query: "not replayable by default" },
      },
    ],
    unresolvedCallIds: [],
    source: "proxy_journal",
    incomplete: false,
  };
}

test("CDR-02 builds a rebase request that removes previous_response_id and evicted history", async () => {
  const originalPayload = baseResponsesPayload();

  const result = buildCodexRebaseRequest({
    sessionId: "codex-session-1",
    planId: "plan-evict-obsolete-details",
    baseRevision: "history-rev-1",
    originalPayload,
    effectiveHistory: effectiveHistoryFixture(),
    currentInput: originalPayload.input,
    mutationPlan: {
      operations: [{ type: "evict", stableItemId: "evicted-user-1" }],
    },
  });

  const payload = result.payload as ResponsesPayload;
  assert.equal("previous_response_id" in payload, false);
  assert.equal(payload.model, originalPayload.model);
  assert.equal(payload.stream, originalPayload.stream);
  assert.equal(payload.instructions, originalPayload.instructions);
  assert.deepEqual(payload.tools, originalPayload.tools);
  assert.equal(payload.prompt_cache_key, originalPayload.prompt_cache_key);

  const forwardedText = textFromResponsesInput(payload.input);
  assert.equal(forwardedText.includes(EVICTED_SENTINEL), false);
  assert.equal(forwardedText.includes(RETAINED_SENTINEL), true);
  assert.equal(occurrences(forwardedText, CURRENT_SENTINEL), 1);
  const inputItems = Array.isArray(payload.input) ? payload.input : [];
  assert.equal(
    inputItems.some((item) => asObject(item).type === "web_search_call"),
    false,
  );
});

test("CDR-01 rejects stale revisions before constructing a rebase request", () => {
  const originalPayload = baseResponsesPayload();
  assert.throws(() => buildCodexRebaseRequest({
    sessionId: "codex-session-1",
    planId: "plan-stale",
    baseRevision: "history-rev-stale",
    originalPayload,
    effectiveHistory: effectiveHistoryFixture(),
    currentInput: originalPayload.input,
    mutationPlan: { operations: [] },
  }), /revision_mismatch/);
});

test("CDR-01 rejects mutations that break function call closure", () => {
  const originalPayload = baseResponsesPayload();
  assert.throws(() => buildCodexRebaseRequest({
    sessionId: "codex-session-1",
    planId: "plan-orphan-output",
    baseRevision: "history-rev-1",
    originalPayload,
    effectiveHistory: effectiveHistoryFixture(),
    currentInput: originalPayload.input,
    mutationPlan: { operations: [{ type: "evict", stableItemId: "call-1" }] },
  }), /tool_closure_incomplete:call-1/);
});

test("CDR-01 allows a function call and its output to be evicted together", () => {
  const originalPayload = baseResponsesPayload();
  const result = buildCodexRebaseRequest({
    sessionId: "codex-session-1",
    planId: "plan-closed-tool-eviction",
    baseRevision: "history-rev-1",
    originalPayload,
    effectiveHistory: effectiveHistoryFixture(),
    currentInput: originalPayload.input,
    mutationPlan: {
      operations: [
        { type: "evict", stableItemId: "call-1" },
        { type: "evict", stableItemId: "result-1" },
      ],
    },
  });
  assert.doesNotMatch(JSON.stringify(result.payload.input), /call-1/);
});

test("CDR-04 retries the original request once when rebase replay is rejected upstream", async () => {
  const originalPayload = baseResponsesPayload();
  const rebasedPayload: ResponsesPayload = {
    ...originalPayload,
    input: [{ role: "user", content: `rebased ${RETAINED_SENTINEL} ${CURRENT_SENTINEL}` }],
  };
  delete rebasedPayload.previous_response_id;
  const sentPayloads: JsonObject[] = [];

  const result = await executeCodexRebaseWithFallback({
    sessionId: "codex-session-1",
    planId: "plan-evict-obsolete-details",
    epochId: "epoch-1",
    originalPayload,
    rebasedPayload,
    async sendUpstream(payload: JsonObject) {
      sentPayloads.push(payload);
      if (sentPayloads.length === 1) {
        return {
          status: 400,
          headers: { "content-type": "application/json" },
          text: JSON.stringify({ error: { message: "unsupported replay item", code: "invalid_request_error" } }),
        };
      }
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        text: JSON.stringify({ id: "resp-original-fallback", output: [] }),
      };
    },
  });

  assert.equal(sentPayloads.length, 2);
  assert.equal("previous_response_id" in (sentPayloads[0] ?? {}), false);
  assert.equal(sentPayloads[1]?.previous_response_id, "resp-old-chain");
  assert.equal(result.response.status, 200);
  assert.match(result.response.text, /resp-original-fallback/);
  assert.equal(result.outcome, "bypassed");
  assert.equal(result.cooldown?.planId, "plan-evict-obsolete-details");
});

test("CDR-07 leaves the Codex payload equivalent when context rewrite is disabled", async () => {
  const originalPayload = baseResponsesPayload();
  const before = JSON.parse(JSON.stringify(originalPayload));

  const result = await applyCodexContextRewrite({
    config: {
      enabled: false,
      mode: "response_chain_rebase",
      failureMode: "bypass",
      retryOriginalRequest: true,
      cooldownMs: 300_000,
    },
    sessionId: "codex-session-1",
    payload: originalPayload,
    effectiveHistory: effectiveHistoryFixture(),
    mutationPlan: {
      operations: [{ type: "evict", stableItemId: "evicted-user-1" }],
    },
  });

  assert.deepEqual(result.payload, before);
  assert.equal(result.outcome, "disabled");
  assert.equal(result.rebaseAttempted, false);
});
