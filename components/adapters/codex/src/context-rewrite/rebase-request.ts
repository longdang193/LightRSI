import { cloneJson, stableInputKey } from "./shared.js";
import type {
  CodexEffectiveHistory,
  CodexMutationPlan,
  CodexRebaseAccounting,
  CodexRebaseRequestResult,
  CodexRebaseValidation,
  JsonObject,
} from "./types.js";

function evictedStableItemIds(plan: CodexMutationPlan): Set<string> {
  return new Set(
    plan.operations
      .filter((operation) => operation.type === "evict" && typeof operation.stableItemId === "string")
      .map((operation) => String(operation.stableItemId)),
  );
}

function itemCallRef(item: JsonObject): { callId?: string; side?: "call" | "output" } {
  const type = String(item.type ?? "").toLowerCase();
  const callId = typeof item.call_id === "string" ? item.call_id : undefined;
  if (!callId) return {};
  if (type === "function_call" || type === "custom_tool_call") return { callId, side: "call" };
  if (type === "function_call_output" || type === "custom_tool_call_output") {
    return { callId, side: "output" };
  }
  return {};
}

function closureReasons(items: JsonObject[]): string[] {
  const calls = new Set<string>();
  const outputs = new Set<string>();
  for (const item of items) {
    const ref = itemCallRef(item);
    if (ref.side === "call" && ref.callId) calls.add(ref.callId);
    if (ref.side === "output" && ref.callId) outputs.add(ref.callId);
  }
  return Array.from(new Set([...calls, ...outputs]))
    .filter((callId) => calls.has(callId) !== outputs.has(callId))
    .sort()
    .map((callId) => `tool_closure_incomplete:${callId}`);
}

export function validateCodexRebaseRequest(params: {
  baseRevision: string;
  effectiveHistory: CodexEffectiveHistory;
  currentInput: unknown;
  mutationPlan: CodexMutationPlan;
}): CodexRebaseValidation {
  const reasons: string[] = [];
  if (params.baseRevision !== params.effectiveHistory.revision) reasons.push("revision_mismatch");
  if (params.effectiveHistory.incomplete) reasons.push("effective_history_incomplete");

  const knownItemIds = new Set(
    [
      ...params.effectiveHistory.replayableItems,
      ...params.effectiveHistory.observationOnlyItems,
    ].map((entry) => entry.stableItemId),
  );
  const evicted = evictedStableItemIds(params.mutationPlan);
  for (const operation of params.mutationPlan.operations) {
    if (operation.type !== "evict") reasons.push(`unsupported_operation:${operation.type}`);
    else if (typeof operation.stableItemId !== "string" || !operation.stableItemId) {
      reasons.push("mutation_target_missing_id");
    }
  }
  for (const stableItemId of evicted) {
    if (!knownItemIds.has(stableItemId)) reasons.push(`mutation_target_missing:${stableItemId}`);
  }

  const retainedItems = params.effectiveHistory.replayableItems
    .filter((entry) => !evicted.has(entry.stableItemId))
    .map((entry) => entry.item);
  const currentInput = Array.isArray(params.currentInput)
    ? params.currentInput.filter((item): item is JsonObject => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
  reasons.push(...closureReasons([...retainedItems, ...currentInput]));

  return {
    valid: reasons.length === 0,
    reasons: Array.from(new Set(reasons)),
    evictedStableItemIds: Array.from(evicted).sort(),
  };
}

function stripServerOwnedResponsesFields(item: JsonObject): JsonObject {
  const next = cloneJson(item);
  delete next.id;
  delete next.status;
  delete next.created_at;
  return next;
}

function jsonChars(value: unknown): number {
  const text = JSON.stringify(value);
  return typeof text === "string" ? text.length : 0;
}

function estimatedTokens(chars: number): number {
  return chars > 0 ? Math.ceil(chars / 4) : 0;
}

function sumItemChars(items: JsonObject[]): number {
  return items.reduce((total, item) => total + jsonChars(item), 0);
}

function buildRebaseAccounting(params: {
  effectiveHistory: CodexEffectiveHistory;
  evictedStableItemIds: Set<string>;
  payload: JsonObject;
}): CodexRebaseAccounting {
  const plannedItems = [
    ...params.effectiveHistory.replayableItems,
    ...params.effectiveHistory.observationOnlyItems,
  ].filter((entry) => params.evictedStableItemIds.has(entry.stableItemId));
  const removedItems = params.effectiveHistory.replayableItems
    .filter((entry) => params.evictedStableItemIds.has(entry.stableItemId));
  const plannedSavedChars = sumItemChars(plannedItems.map((entry) => entry.item));
  const actuallyRemovedChars = sumItemChars(removedItems.map((entry) => entry.item));
  const rebaseReplayCostChars = jsonChars(params.payload.input);
  const estimatorCostChars = 0;
  const totalOneTimeCost = rebaseReplayCostChars + estimatorCostChars;
  return {
    plannedSavedChars,
    plannedSavedTokens: estimatedTokens(plannedSavedChars),
    actuallyRemovedChars,
    actuallyRemovedTokens: estimatedTokens(actuallyRemovedChars),
    rebaseReplayCostChars,
    rebaseReplayCostTokens: estimatedTokens(rebaseReplayCostChars),
    subsequentSavedCharsPerTurn: actuallyRemovedChars,
    subsequentSavedTokensPerTurn: estimatedTokens(actuallyRemovedChars),
    estimatorCostChars,
    estimatorCostTokens: estimatedTokens(estimatorCostChars),
    fallbackExtraRequestCount: 0,
    cacheColdMissCount: 1,
    breakEvenTurn: actuallyRemovedChars > 0
      ? Math.ceil(totalOneTimeCost / actuallyRemovedChars)
      : undefined,
  };
}

export function withCodexRebaseReplayAccountingInput(
  accounting: CodexRebaseAccounting,
  input: unknown,
): CodexRebaseAccounting {
  const rebaseReplayCostChars = jsonChars(input);
  const estimatorCostChars = accounting.estimatorCostChars;
  const totalOneTimeCost = rebaseReplayCostChars + estimatorCostChars;
  return {
    ...accounting,
    rebaseReplayCostChars,
    rebaseReplayCostTokens: estimatedTokens(rebaseReplayCostChars),
    breakEvenTurn: accounting.subsequentSavedCharsPerTurn > 0
      ? Math.ceil(totalOneTimeCost / accounting.subsequentSavedCharsPerTurn)
      : undefined,
  };
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
  const validation = validateCodexRebaseRequest(params);
  if (!validation.valid) {
    throw new Error(`Unsafe Codex rebase: ${validation.reasons.join(", ")}`);
  }
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
    oldRevision: params.effectiveHistory.revision,
    rebaseRevision: `${params.effectiveHistory.revision}:${params.planId}:rebase`,
    accounting: buildRebaseAccounting({
      effectiveHistory: params.effectiveHistory,
      evictedStableItemIds: evicted,
      payload,
    }),
  };
}
