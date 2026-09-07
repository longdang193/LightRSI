import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import { applyBeforeCallReductionToPayload } from "../src/reduction.js";
import { computeEncodedProviderWirePrefixDiagnostics } from "../src/proxy-runtime.js";
import { createCodexResponsesPayloadCodec } from "../src/responses-codec.js";

const replayConfig = normalizeTokenPilotCodexConfig({
  reduction: {
    triggerMinChars: 256,
    maxToolChars: 400,
    passes: {
      readStateCompaction: false,
      toolPayloadTrim: true,
      htmlSlimming: false,
      execOutputTruncation: false,
      agentsStartupOptimization: false,
    },
  },
});

const responsesCodec = createCodexResponsesPayloadCodec();

function encodeProviderInput(payload: any): any[] {
  const envelope = responsesCodec.decodeRequest(structuredClone(payload));
  return (responsesCodec.encodeRequest(envelope) as any).input;
}

function encodedItemsByStableId(payload: any, stableIds: string[]): string {
  const encodedInput = encodeProviderInput(payload);
  return JSON.stringify(stableIds.map((stableId) => {
    const items = encodedInput.filter((candidate: any) => candidate?.call_id === stableId || candidate?.id === stableId);
    assert.ok(items.length > 0, `missing encoded provider item ${stableId}`);
    return { stableId, items };
  }));
}

function repeatedToolOutput(label: string): string {
  return `${label}\n${Array.from({ length: 160 }, (_, index) => `${label} line ${index}`).join("\n")}`;
}

test("provider wire prefix diagnostics isolate volatile item fields without values", () => {
  const first = computeEncodedProviderWirePrefixDiagnostics({
    instructions: "stable instructions",
    tools: [{ type: "function", name: "read_file" }],
    input: [
      {
        type: "message",
        role: "system",
        metadata: { session_id: "session-a" },
        content: "stable policy",
      },
      { type: "message", role: "user", content: "task" },
    ],
  });
  const second = computeEncodedProviderWirePrefixDiagnostics({
    instructions: "stable instructions",
    tools: [{ type: "function", name: "read_file" }],
    input: [
      {
        type: "message",
        role: "system",
        metadata: { session_id: "session-b" },
        content: "stable policy",
      },
      { type: "message", role: "user", content: "task" },
    ],
  });

  assert.equal(first.instructionsHash, second.instructionsHash);
  assert.equal(first.toolsHash, second.toolsHash);
  assert.notEqual(first.inputHash, second.inputHash);
  assert.notEqual(
    first.inputItems[0]?.fieldFingerprints.metadata,
    second.inputItems[0]?.fieldFingerprints.metadata,
  );
  assert.doesNotMatch(JSON.stringify(first), /session-a|stable policy/);
});

test("provider wire prefix identity ignores generated message ids", () => {
  const first = computeEncodedProviderWirePrefixDiagnostics({
    instructions: "stable instructions",
    tools: [{ type: "function", name: "read_file" }],
    input: [
      { id: "msg_generated_a", type: "message", role: "developer", content: "stable policy" },
      { type: "message", role: "user", content: "task" },
    ],
  });
  const second = computeEncodedProviderWirePrefixDiagnostics({
    instructions: "stable instructions",
    tools: [{ type: "function", name: "read_file" }],
    input: [
      { id: "msg_generated_b", type: "message", role: "developer", content: "stable policy" },
      { type: "message", role: "user", content: "task" },
    ],
  });

  assert.equal(first.inputHash, second.inputHash);
  assert.equal(first.fullHash, second.fullHash);
});

test("independent three-round replay records intentional pre-change encoded drift", async () => {
  const firstPayload: any = {
    model: "tokenpilot/gpt-5.4-mini",
    input: [
      { type: "message", role: "user", content: "inspect one file" },
      {
        type: "function_call",
        call_id: "read-1",
        name: "Read",
        arguments: JSON.stringify({ path: "/repo/data.txt" }),
      },
      {
        type: "function_call_output",
        call_id: "read-1",
        output: repeatedToolOutput("READ_BEFORE_EDIT"),
        tool_result: { headers: { "x-round": "read-1", nested: { source: "fixture" } } },
      },
      {
        type: "function_call",
        call_id: "edit-1",
        name: "Edit",
        arguments: JSON.stringify({ path: "/repo/data.txt" }),
      },
      {
        type: "function_call_output",
        call_id: "edit-1",
        output: repeatedToolOutput("EDIT_AFTER_READ"),
        tool_result: { headers: { "x-round": "edit-1", nested: { source: "fixture" } } },
      },
      {
        type: "function_call",
        call_id: "read-2",
        name: "Read",
        arguments: JSON.stringify({ path: "/repo/data.txt" }),
      },
      {
        type: "function_call_output",
        call_id: "read-2",
        output: repeatedToolOutput("READ_AFTER_EDIT"),
        tool_result: { headers: { "x-round": "read-2", nested: { source: "fixture" } } },
      },
    ],
  };
  const appendOnlyPayload: any = structuredClone(firstPayload);
  appendOnlyPayload.input.push(
      {
        type: "function_call",
        call_id: "read-3",
        name: "Read",
        arguments: JSON.stringify({ path: "/repo/data.txt" }),
      },
      {
        type: "function_call_output",
        call_id: "read-3",
        output: repeatedToolOutput("READ_REPEATED"),
        tool_result: { headers: { "x-round": "read-3", nested: { source: "fixture" } } },
      },
  );

  assert.notEqual(firstPayload.input[2], appendOnlyPayload.input[2]);
  assert.notEqual(firstPayload.input[2].tool_result, appendOnlyPayload.input[2].tool_result);
  assert.equal(appendOnlyPayload.input.filter((item: any) => item.role === "user").length, 1);

  const first = await applyBeforeCallReductionToPayload({
    payload: firstPayload,
    sessionId: "replay-wire-session",
    config: replayConfig,
  });
  assert.ok(first.changedBlocks > 0);
  assert.notEqual(firstPayload.input[2].output, repeatedToolOutput("READ_BEFORE_EDIT"));
  assert.deepEqual(firstPayload.input[2].tool_result.headers, {
    "x-round": "read-1",
    nested: { source: "fixture" },
  });

  const historicalIds = ["read-1", "edit-1", "read-2"];
  const firstEncodedPrefix = encodedItemsByStableId(firstPayload, historicalIds);
  const independentOriginalPrefix = encodedItemsByStableId(appendOnlyPayload, historicalIds);
  assert.notEqual(firstEncodedPrefix, independentOriginalPrefix);

  const second = await applyBeforeCallReductionToPayload({
    payload: appendOnlyPayload,
    sessionId: "replay-wire-session",
    config: replayConfig,
  });
  assert.ok(second.changedBlocks > 0);

  // Intentional baseline drift: Task 3 will replace this with equality after forwarding provenance exists.
  assert.notEqual(encodedItemsByStableId(appendOnlyPayload, historicalIds), firstEncodedPrefix);
  assert.deepEqual(encodeProviderInput(appendOnlyPayload).find((item: any) => item?.type === "function_call_output" && item?.call_id === "read-3")?.tool_result.headers, {
    "x-round": "read-3",
    nested: { source: "fixture" },
  });
});

test("explicit response-chain rebase is the historical prefix rewrite exception", () => {
  const originalPayload: any = {
    model: "tokenpilot/gpt-5.4-mini",
    previous_response_id: "resp-before-rebase",
    input: [
      { type: "message", role: "developer", content: "stable policy" },
      { type: "message", role: "user", content: "continue" },
      { type: "function_call_output", call_id: "historical-tool", output: "historical bytes" },
    ],
  };
  const rebasedPayload: any = structuredClone(originalPayload);
  rebasedPayload.previous_response_id = "resp-after-rebase";
  rebasedPayload.context_rewrite = { mode: "response_chain_rebase", explicit: true };
  rebasedPayload.input[2].output = "rebased historical bytes";

  const originalPrefix = encodedItemsByStableId(originalPayload, ["historical-tool"]);
  const rebasedPrefix = encodedItemsByStableId(rebasedPayload, ["historical-tool"]);

  assert.notEqual(rebasedPrefix, originalPrefix);
  assert.deepEqual(rebasedPayload.context_rewrite, {
    mode: "response_chain_rebase",
    explicit: true,
  });
});
