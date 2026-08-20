import assert from "node:assert/strict";
import test from "node:test";

import { countTextWithPreciseTokens } from "../src/index.js";

test("countTextWithPreciseTokens uses precise OpenAI token counting for supported models", () => {
  const result = countTextWithPreciseTokens("gpt-5.4-mini", "hello world");

  assert.equal(result.mode, "openai_tokens");
  assert.ok(result.count > 0);
});

test("countTextWithPreciseTokens treats compatibility model prefixes uniformly", () => {
  const text = "stable cache prefix";
  const counts = ["gpt-5.6-sol", "tokenpilot/gpt-5.6-sol", "lightmem2/gpt-5.6-sol", "lightrsi/gpt-5.6-sol"]
    .map((model) => countTextWithPreciseTokens(model, text));

  assert.deepEqual(counts.map((result) => result.mode), [
    "openai_tokens",
    "openai_tokens",
    "openai_tokens",
    "openai_tokens",
  ]);
  assert.equal(new Set(counts.map((result) => result.count)).size, 1);
  assert.equal(countTextWithPreciseTokens("cx/gpt-5.6-sol", text).mode, "chars");
});

test("countTextWithPreciseTokens falls back to chars for unsupported models", () => {
  const result = countTextWithPreciseTokens("claude-sonnet-4-6", "hello world");

  assert.deepEqual(result, {
    mode: "chars",
    count: "hello world".length,
  });
});
