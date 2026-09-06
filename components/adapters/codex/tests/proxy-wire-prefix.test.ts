import assert from "node:assert/strict";
import test from "node:test";

import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import { applyBeforeCallReductionToPayload } from "../src/reduction.js";
import { computeEncodedProviderWirePrefixDiagnostics } from "../src/proxy-runtime.js";

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

const codeOutput = `export function readConfig(path: string) { return path.trim(); }\n`.repeat(80);

function prefixItems(payload: any, count: number): string {
  return JSON.stringify(payload.input.slice(0, count));
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

test("append-only replay preserves encoded historical input prefix", async () => {
  const firstPayload: any = {
    model: "tokenpilot/gpt-5.4-mini",
    input: [
      { type: "message", role: "user", content: "inspect config" },
      {
        type: "function_call",
        call_id: "read-1",
        name: "Read",
        arguments: JSON.stringify({ path: "/repo/src/config.ts" }),
      },
      {
        type: "function_call_output",
        call_id: "read-1",
        output: codeOutput,
      },
    ],
  };
  const appendOnlyPayload: any = {
    ...firstPayload,
    input: [
      ...firstPayload.input,
      { type: "message", role: "user", content: "then inspect tests" },
      {
        type: "function_call",
        call_id: "read-2",
        name: "Read",
        arguments: JSON.stringify({ path: "/repo/tests/config.test.ts" }),
      },
      {
        type: "function_call_output",
        call_id: "read-2",
        output: codeOutput,
      },
    ],
  };

  await applyBeforeCallReductionToPayload({
    payload: firstPayload,
    sessionId: "replay-wire-session",
    config: replayConfig,
  });
  await applyBeforeCallReductionToPayload({
    payload: appendOnlyPayload,
    sessionId: "replay-wire-session",
    config: replayConfig,
  });

  assert.equal(prefixItems(appendOnlyPayload, 3), prefixItems(firstPayload, 3));
});
