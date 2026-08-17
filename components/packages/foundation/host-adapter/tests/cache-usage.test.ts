import assert from "node:assert/strict";
import test from "node:test";

import {
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
