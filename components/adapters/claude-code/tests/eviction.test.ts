import test from "node:test";
import assert from "node:assert/strict";

import { analyzeClaudeEviction } from "../src/eviction.js";

const big = "X".repeat(5000);

function sampleMessages() {
  return [
    { role: "user", content: "read config.json" },
    { role: "assistant", content: [{ type: "text", text: "reading it now" }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "c1", content: big }] },
    { role: "assistant", content: [{ type: "text", text: "done, here is a summary" }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "c2", content: big }] },
  ];
}

test("eviction analysis is disabled when the module is off", () => {
  const result = analyzeClaudeEviction({
    sessionId: "s1",
    model: "claude-sonnet-4",
    messages: sampleMessages(),
    config: { enabled: false },
  });
  assert.equal(result.enabled, false);
  assert.equal(result.changed, false);
  assert.deepEqual(result.evictedBlockIds, []);
  assert.equal(result.savedChars, 0);
});

test("signal-driven eviction selects oversized blocks", () => {
  const result = analyzeClaudeEviction({
    sessionId: "s1",
    model: "claude-sonnet-4",
    messages: sampleMessages(),
    config: { enabled: true, minBlockChars: 256 },
  });
  assert.equal(result.enabled, true);
  assert.equal(result.changed, true);
  assert.ok(result.evictedBlockIds.length > 0, "should evict at least one block");
  assert.ok(result.savedChars > 0, "should report saved chars");
  for (const selection of result.selections) {
    assert.ok(selection.chars >= 256, "selected block must meet the size floor");
    assert.ok(selection.segmentIds.length > 0, "selection must carry segment ids");
  }
});

test("small blocks below the size floor are not evicted", () => {
  const result = analyzeClaudeEviction({
    sessionId: "s1",
    model: "claude-sonnet-4",
    messages: [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "hello" }] },
    ],
    config: { enabled: true, minBlockChars: 256 },
  });
  assert.equal(result.changed, false);
  assert.deepEqual(result.evictedBlockIds, []);
});
