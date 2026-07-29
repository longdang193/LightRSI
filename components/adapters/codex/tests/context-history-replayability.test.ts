import assert from "node:assert/strict";
import test from "node:test";

import {
  codexReplayabilityForItem,
  isCodexDeferredItem,
  isCodexObservationOnlyItem,
  type CodexReplayabilityMode,
  type CodexReplayabilityReason,
  type JsonObject,
} from "../src/context-history/index.js";

function assertReplayability(
  item: JsonObject,
  mode: CodexReplayabilityMode,
  reason: CodexReplayabilityReason,
): void {
  assert.deepEqual(codexReplayabilityForItem(item), { mode, reason });
}

test("CDH-05 Replayability classifies messages and tool call pairs as replayable by default", () => {
  assertReplayability({ role: "user", content: "user input" }, "replayable", "default_replayable");
  assertReplayability({ role: "developer", content: "stable instruction" }, "replayable", "default_replayable");
  assertReplayability({
    type: "message",
    role: "assistant",
    content: [{ type: "output_text", text: "assistant output" }],
  }, "replayable", "default_replayable");
  assertReplayability({
    type: "function_call",
    call_id: "call-1",
    name: "run_tests",
    arguments: "{}",
  }, "replayable", "tool_closure_required");
  assertReplayability({
    type: "function_call_output",
    call_id: "call-1",
    output: "{\"ok\":true}",
  }, "replayable", "tool_closure_required");
  assertReplayability({
    type: "custom_tool_call",
    call_id: "custom-1",
    name: "edit",
    input: "payload",
  }, "replayable", "tool_closure_required");
  assertReplayability({
    type: "custom_tool_call_output",
    call_id: "custom-1",
    output: "{\"edited\":true}",
  }, "replayable", "tool_closure_required");
});

test("CDH-05 Replayability keeps exact encrypted reasoning payloads replayable", () => {
  const reasoning = {
    id: "rs-1",
    type: "reasoning",
    encrypted_content: "opaque-provider-payload",
  };

  assertReplayability(reasoning, "replayable", "exact_payload_required");
  assert.equal(isCodexObservationOnlyItem(reasoning), false);
});

test("CDH-05 Replayability defers reasoning without its exact encrypted payload", () => {
  const reasoning = {
    id: "rs-summary-only",
    type: "reasoning",
    summary: [{ type: "summary_text", text: "partial" }],
  };

  assertReplayability(reasoning, "deferred", "exact_payload_missing");
  assert.equal(isCodexDeferredItem(reasoning), true);
});

test("CDH-05 Replayability defers unknown provider item types", () => {
  const item = { type: "future_provider_item", payload: "opaque" };

  assertReplayability(item, "deferred", "unsupported_item_type");
  assert.equal(isCodexDeferredItem(item), true);
});

test("CDH-05 Replayability classifies provider observations as observation-only by default", () => {
  for (const item of [
    { type: "web_search_call", query: "provider-owned observation" },
    { type: "event_msg", message: "runtime event" },
  ]) {
    assertReplayability(item, "observation_only", "provider_observation");
    assert.equal(isCodexObservationOnlyItem(item), true);
  }
  const turnContext = { type: "turn_context", content: "current turn metadata" };
  assertReplayability(turnContext, "observation_only", "turn_context_instruction");
  assert.equal(isCodexObservationOnlyItem(turnContext), true);
});
