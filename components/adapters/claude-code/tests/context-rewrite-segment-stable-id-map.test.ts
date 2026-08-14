import assert from "node:assert/strict";
import test from "node:test";
import type { ToolResultBinding } from "../src/eviction.js";
import { buildSegmentToStableIdMap } from "../src/context-rewrite/segment-stable-id-map.js";

function bindingsFrom(list: ToolResultBinding[]): Map<string, ToolResultBinding> {
  const map = new Map<string, ToolResultBinding>();
  for (const b of list) map.set(b.segmentId, b);
  return map;
}

test("maps each segmentId to its single reconstructed stableId", () => {
  const bindings = bindingsFrom([
    { segmentId: "anthropic-tool-result:toolu_1", messageIndex: 2, blockIndex: 0, toolUseId: "toolu_1" },
    { segmentId: "anthropic-tool-result:toolu_2", messageIndex: 5, blockIndex: 3, toolUseId: "toolu_2" },
  ]);
  const result = buildSegmentToStableIdMap("sess-1", bindings);
  assert.deepEqual(result, {
    "anthropic-tool-result:toolu_1": ["sess-1:2:0"],
    "anthropic-tool-result:toolu_2": ["sess-1:5:3"],
  });
});

test("stableId format matches buildClaudeContextSnapshot (sessionId:messageIndex:blockIndex)", () => {
  const bindings = bindingsFrom([
    { segmentId: "anthropic-tool-result:toolu_x", messageIndex: 0, blockIndex: 1, toolUseId: "toolu_x" },
  ]);
  const result = buildSegmentToStableIdMap("abc", bindings);
  assert.deepEqual(result["anthropic-tool-result:toolu_x"], ["abc:0:1"]);
});

test("empty bindings yields an empty map", () => {
  const result = buildSegmentToStableIdMap("sess-1", new Map());
  assert.deepEqual(result, {});
});

test("each value is a single-element array (1 segment <-> 1 snapshot item)", () => {
  const bindings = bindingsFrom([
    { segmentId: "anthropic-tool-result:toolu_1", messageIndex: 1, blockIndex: 0, toolUseId: "toolu_1" },
  ]);
  const result = buildSegmentToStableIdMap("s", bindings);
  assert.equal(result["anthropic-tool-result:toolu_1"]!.length, 1);
});
