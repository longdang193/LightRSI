import type { ToolResultBinding } from "../eviction.js";

/**
 * Build the adapter-owned segmentId -> stableId[] mapping the shared eviction
 * planner consumes as `stableItemIdsByMessageId`. 亚彬's contract: the planner
 * looks up each decision segmentId in this map to resolve the concrete snapshot
 * item stableIds to remove; without it the planner can only try the segmentId
 * verbatim as a stableId and otherwise defers the block.
 *
 * Correspondence for Claude is 1 tool-result segment <-> 1 snapshot item
 * (block), so every value here is a single-element array. The stableId is
 * reconstructed the same way buildClaudeContextSnapshot builds it:
 * `${sessionId}:${messageIndex}:${blockIndex}`. Inputs come from
 * buildToolResultSegments' bindings, which already carry messageIndex/blockIndex
 * per segment. Scope: tool-result segments only (the eviction candidates); other
 * block kinds are not segmented and are not represented here.
 */
export function buildSegmentToStableIdMap(
  sessionId: string,
  bindings: ReadonlyMap<string, ToolResultBinding>,
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const binding of bindings.values()) {
    const stableId = `${sessionId}:${binding.messageIndex}:${binding.blockIndex}`;
    map[binding.segmentId] = [stableId];
  }
  return map;
}
