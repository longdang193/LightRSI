import { cloneJson, stableInputKey } from "./shared.js";
import type {
  CodexEffectiveHistory,
  CodexMutationPlan,
  CodexRebaseRequestResult,
  JsonObject,
} from "./types.js";

function evictedStableItemIds(plan: CodexMutationPlan): Set<string> {
  return new Set(
    plan.operations
      .filter((operation) => operation.type === "evict" && typeof operation.stableItemId === "string")
      .map((operation) => String(operation.stableItemId)),
  );
}

function stripServerOwnedResponsesFields(item: JsonObject): JsonObject {
  const next = cloneJson(item);
  delete next.id;
  delete next.status;
  delete next.created_at;
  return next;
}

export function buildCodexRebaseRequest(params: {
  sessionId: string;
  planId: string;
  baseRevision: string;
  originalPayload: JsonObject;
  effectiveHistory: CodexEffectiveHistory;
  currentInput: unknown;
  mutationPlan: CodexMutationPlan;
}): CodexRebaseRequestResult {
  const payload = cloneJson(params.originalPayload);
  delete payload.previous_response_id;

  const evicted = evictedStableItemIds(params.mutationPlan);
  const currentInput = Array.isArray(params.currentInput)
    ? cloneJson(params.currentInput)
    : [];
  const currentInputKeys = new Set(currentInput.map(stableInputKey));
  const retainedHistory = params.effectiveHistory.replayableItems
    .filter((entry) => !evicted.has(entry.stableItemId))
    .map((entry) => stripServerOwnedResponsesFields(entry.item))
    .filter((item) => !currentInputKeys.has(stableInputKey(item)));

  payload.input = [
    ...retainedHistory,
    ...currentInput,
  ];

  return {
    payload,
    oldRevision: params.baseRevision,
    rebaseRevision: `${params.baseRevision}:${params.planId}:rebase`,
  };
}
