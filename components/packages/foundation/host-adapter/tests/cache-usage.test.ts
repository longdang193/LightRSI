import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCacheUsageEvidence,
  readCacheWriteTokens,
  readCachedInputTokens,
  readInputTokens,
} from "../src/state/cache-usage.js";

test("reads nested input token cache metrics", () => {
  const usage = {
    input_tokens: 1200,
    input_tokens_details: {
      cached_tokens: 900,
      cache_write_tokens: 300,
    },
  };

  assert.equal(readInputTokens(usage), 1200);
  assert.equal(readCachedInputTokens(usage), 900);
  assert.equal(readCacheWriteTokens(usage), 300);
});

test("returns zero when cache write metrics are absent", () => {
  assert.equal(readCacheWriteTokens({ input_tokens: 1200 }), 0);
});

test("reads Anthropic cache creation input tokens", () => {
  assert.equal(readCacheWriteTokens({ cache_creation_input_tokens: 768 }), 768);
});

test("normalizes OpenAI cache usage without changing numeric compatibility helpers", () => {
  assert.deepEqual(
    normalizeCacheUsageEvidence({
      input_tokens: 1200,
      input_tokens_details: { cached_tokens: 900, cache_write_tokens: 0 },
    }, "gpt-5.6"),
    {
      inputTotal: 1200,
      inputUncached: 300,
      cacheRead: 900,
      cacheWrite: 0,
      evidence: "hit",
    },
  );
  assert.equal(readCachedInputTokens({ input_tokens: 1200 }), 0);
});

test("normalizes Anthropic cache usage and preserves unknown evidence", () => {
  assert.deepEqual(
    normalizeCacheUsageEvidence({
      input_tokens: 100,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 100,
    }, "claude-sonnet-4-6"),
    {
      inputTotal: 200,
      inputUncached: 100,
      cacheRead: 0,
      cacheWrite: 100,
      evidence: "miss",
    },
  );
  assert.deepEqual(normalizeCacheUsageEvidence({ input_tokens: 100 }), {
    inputTotal: 100,
    inputUncached: 100,
    evidence: "unknown",
  });
});
