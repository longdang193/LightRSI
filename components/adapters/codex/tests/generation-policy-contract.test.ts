import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGenerationPolicy,
} from "@lightrsi/product-surface";
import { prepareBeforeCallWithReductionSummary } from "@lightrsi/host-adapter";
import { createCodexResponsesPayloadCodec } from "../src/responses-codec.js";

const config = {
  caveman: { enabled: true, level: "full" as const },
  ponytail: { enabled: true, level: "full" as const },
};

function payload(stream: boolean, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model: "gpt-test",
    stream,
    instructions: "Answer with technical detail.",
    input: [
      { role: "user", content: "Current question" },
      { type: "function_call", call_id: "call-1", name: "search", arguments: "{\"q\":\"old\"}" },
      { type: "function_call_output", call_id: "call-1", output: "historical result" },
    ],
    tools: [{ type: "function", name: "search", parameters: { type: "object" } }],
    ...extra,
  };
}

test("Codex policy preserves tools and historical tool payloads", async () => {
  const original = payload(false);
  const codec = createCodexResponsesPayloadCodec();
  const decoded = codec.decodeRequest(original);
  const baseline = codec.encodeRequest(decoded) as Record<string, unknown>;
  const prepared = await prepareBeforeCallWithReductionSummary({
    envelope: decoded,
    codec,
    applyGenerationPolicy: (next) => applyGenerationPolicy(next, config),
    prepareStablePrefix: (next) => next,
    applyBeforeCallReduction: async ({ envelope }) => ({
      envelope,
      summary: { savedChars: 0 },
    }),
  });
  const encoded = codec.encodeRequest(prepared.envelope) as Record<string, unknown>;

  assert.match(String(encoded.instructions), /\[LightRSI Caveman/);
  assert.match(String(encoded.instructions), /\[LightRSI Ponytail/);
  assert.deepEqual(encoded.tools, baseline.tools);
  assert.deepEqual(encoded.input, baseline.input);
});

test("stream and non-stream requests receive identical policy text", () => {
  const codec = createCodexResponsesPayloadCodec();
  const nonStream = applyGenerationPolicy(codec.decodeRequest(payload(false)), config);
  const stream = applyGenerationPolicy(codec.decodeRequest(payload(true)), config);
  assert.equal(nonStream.instructions, stream.instructions);
});

test("strict structured-output requests bypass policy without changing payload", () => {
  const original = payload(false, { text: { format: { type: "json_schema", name: "answer" } } });
  const codec = createCodexResponsesPayloadCodec();
  const decoded = codec.decodeRequest(original);
  const prepared = applyGenerationPolicy(decoded, config);
  assert.equal(prepared, decoded);
  assert.deepEqual(codec.encodeRequest(prepared), codec.encodeRequest(decoded));
});

test("already-applied policy is a no-op", () => {
  const codec = createCodexResponsesPayloadCodec();
  const first = applyGenerationPolicy(codec.decodeRequest(payload(false)), config);
  assert.equal(applyGenerationPolicy(first, config), first);
});
