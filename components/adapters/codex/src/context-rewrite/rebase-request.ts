import {
  codexProgramCallerId,
  codexReplayPairRef,
} from "../context-history/replayability.js";
import { sameCanonicalValue } from "@lightrsi/cleaner";
import type { TaskStateEstimatorOutput } from "@lightrsi/eviction";
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

type IndexedToolCallRef = ReturnType<typeof codexReplayPairRef> & {
  index?: number;
  item: JsonObject;
};

function sameCaller(left: unknown, right: unknown): boolean {
  return sameCanonicalValue(left, right);
}

function closureReasons(items: JsonObject[]): string[] {
  const refs = new Map<string, { calls: IndexedToolCallRef[]; outputs: IndexedToolCallRef[] }>();
  const programs = new Map<string, number[]>();
  const programOutputs = new Map<string, number[]>();
  const reasons: string[] = [];
  for (const [index, item] of items.entries()) {
    const type = String(item.type ?? "").toLowerCase();
    const callId = typeof item.call_id === "string" && item.call_id.trim()
      ? item.call_id.trim()
      : undefined;
    if (type === "program" || type === "program_output") {
      if (!callId) reasons.push(`program_call_id_missing:${type}`);
      else {
        const target = type === "program" ? programs : programOutputs;
        const indexes = target.get(callId) ?? [];
        indexes.push(index);
        target.set(callId, indexes);
      }
    }

    const ref: IndexedToolCallRef = { ...codexReplayPairRef(item), index, item };
    if (ref.side) {
      if (!ref.callId) {
        reasons.push(`tool_call_id_missing:${ref.type}`);
        continue;
      }
      const entry = refs.get(ref.callId) ?? { calls: [], outputs: [] };
      entry[ref.side === "call" ? "calls" : "outputs"].push(ref);
      refs.set(ref.callId, entry);
    }
  }
  for (const [callId, entry] of refs) {
    if (entry.calls.length !== 1 || entry.outputs.length !== 1) {
      if (entry.calls.length === 0 || entry.outputs.length === 0) {
        reasons.push(`tool_closure_incomplete:${callId}`);
      }
      if (entry.calls.length > 1) reasons.push(`tool_call_duplicate:${callId}`);
      if (entry.outputs.length > 1) reasons.push(`tool_output_duplicate:${callId}`);
      continue;
    }
    if (entry.calls[0]?.kind !== entry.outputs[0]?.kind) {
      reasons.push(`tool_closure_type_mismatch:${callId}`);
      continue;
    }
    if ((entry.outputs[0]?.index ?? -1) <= (entry.calls[0]?.index ?? -1)) {
      reasons.push(`tool_output_before_call:${callId}`);
    }
    const programCallerId = codexProgramCallerId(entry.calls[0]!.item);
    const outputProgramCallerId = codexProgramCallerId(entry.outputs[0]!.item);
    if (programCallerId) {
      if (!programs.has(programCallerId)) {
        reasons.push(`program_caller_missing:${programCallerId}`);
      } else if ((programs.get(programCallerId)?.[0] ?? Number.MAX_SAFE_INTEGER) >= (entry.calls[0]?.index ?? -1)) {
        reasons.push(`program_caller_before_program:${programCallerId}`);
      }
      if (!sameCaller(entry.calls[0]!.item.caller, entry.outputs[0]!.item.caller)) {
        reasons.push(`program_caller_mismatch:${callId}`);
      }
    } else if (outputProgramCallerId) {
      reasons.push(`program_caller_mismatch:${callId}`);
    }
  }
  for (const [callId, indexes] of programs) {
    if (indexes.length > 1) reasons.push(`program_duplicate:${callId}`);
  }
  for (const [callId, indexes] of programOutputs) {
    if (indexes.length > 1) reasons.push(`program_output_duplicate:${callId}`);
    const programIndexes = programs.get(callId);
    if (!programIndexes || programIndexes.length === 0) {
      reasons.push(`program_output_orphan:${callId}`);
    } else if ((indexes[0] ?? -1) <= (programIndexes[0] ?? -1)) {
      reasons.push(`program_output_before_program:${callId}`);
    }
  }
  return Array.from(new Set(reasons)).sort();
}

type ForwardedInputResult = {
  items: JsonObject[];
  reasons: string[];
};

function normalizedCurrentInput(currentInput: unknown): JsonObject[] {
  return Array.isArray(currentInput)
    ? currentInput.filter((item): item is JsonObject => Boolean(
        item && typeof item === "object" && !Array.isArray(item),
      )).map((item) => cloneJson(item))
    : [];
}

function cumulativeCorrespondence(params: {
  historyItems: CodexEffectiveHistory["replayableItems"];
  currentInput: JsonObject[];
}): Map<string, number> | undefined {
  const currentIndexesByKey = new Map<string, number[]>();
  params.currentInput.forEach((item, index) => {
    const key = stableInputKey(item);
    const indexes = currentIndexesByKey.get(key) ?? [];
    indexes.push(index);
    currentIndexesByKey.set(key, indexes);
  });
  const mappableHistoryItems = params.historyItems.filter((entry) => (
    (currentIndexesByKey.get(stableInputKey(entry.item))?.length ?? 0) > 0
  ));
  if (mappableHistoryItems.length === params.historyItems.length
    && params.currentInput.length >= mappableHistoryItems.length
    && mappableHistoryItems.every((entry, index) => (
      stableInputKey(entry.item) === stableInputKey(params.currentInput[index]!)
    ))) {
    return new Map(mappableHistoryItems.map((entry, index) => [entry.stableItemId, index]));
  }
  const earliest: number[] = [];
  let cursor = -1;
  for (const entry of params.historyItems) {
    if (!mappableHistoryItems.includes(entry)) continue;
    const indexes = currentIndexesByKey.get(stableInputKey(entry.item)) ?? [];
    const index = indexes.find((candidate) => candidate > cursor);
    if (index === undefined) return undefined;
    earliest.push(index);
    cursor = index;
  }
  const latest = new Map<string, number>();
  cursor = params.currentInput.length;
  for (let historyIndex = params.historyItems.length - 1; historyIndex >= 0; historyIndex -= 1) {
    const entry = params.historyItems[historyIndex]!;
    if (!mappableHistoryItems.includes(entry)) continue;
    const indexes = currentIndexesByKey.get(stableInputKey(entry.item)) ?? [];
    const index = [...indexes].reverse().find((candidate) => candidate < cursor);
    if (index === undefined) return undefined;
    latest.set(entry.stableItemId, index);
    cursor = index;
  }
  if (earliest.some((index, indexOfHistoryItem) => (
    index !== latest.get(mappableHistoryItems[indexOfHistoryItem]!.stableItemId)
  ))) {
    return undefined;
  }
  return new Map(mappableHistoryItems.map((entry, index) => [entry.stableItemId, earliest[index]!])) as Map<string, number>;
}

function buildForwardedInput(params: {
  effectiveHistory: CodexEffectiveHistory;
  currentInput: unknown;
  evicted: Set<string>;
  inputFormat?: "response_chain" | "cumulative";
}): ForwardedInputResult {
  const currentInput = normalizedCurrentInput(params.currentInput);
  if (params.inputFormat !== "cumulative") {
    const currentInputKeys = new Set(currentInput.map(stableInputKey));
    const retainedHistory = params.effectiveHistory.replayableItems
      .filter((entry) => !params.evicted.has(entry.stableItemId))
      .map((entry) => stripServerOwnedResponsesFields(entry.item))
      .filter((item) => !currentInputKeys.has(stableInputKey(item)));
    return { items: [...retainedHistory, ...currentInput], reasons: [] };
  }

  const removedIndexes = new Set<number>();
  const reasons: string[] = [];
  const correspondence = cumulativeCorrespondence({
    historyItems: params.effectiveHistory.replayableItems,
    currentInput,
  });
  for (const stableItemId of params.evicted) {
    const historyEntry = params.effectiveHistory.replayableItems.find(
      (entry) => entry.stableItemId === stableItemId,
    );
    if (!historyEntry) continue;
    const currentIndex = correspondence?.get(stableItemId);
    if (currentIndex !== undefined) {
      removedIndexes.add(currentIndex);
      continue;
    }
    const key = stableInputKey(historyEntry.item);
    const currentHasKey = currentInput.some((item) => stableInputKey(item) === key);
    reasons.push(currentHasKey
      ? `cumulative_occurrence_ambiguous:${key}`
      : `mutation_target_missing_in_current_input:${stableItemId}`);
  }

  return {
    items: currentInput.filter((_, index) => !removedIndexes.has(index)),
    reasons,
  };
}

export function validateCodexRebaseRequest(params: {
  baseRevision: string;
  effectiveHistory: CodexEffectiveHistory;
  currentInput: unknown;
  inputFormat?: "response_chain" | "cumulative";
  mutationPlan: CodexMutationPlan;
}): CodexRebaseValidation {
  const reasons: string[] = [];
  if (params.baseRevision !== params.effectiveHistory.revision) reasons.push("revision_mismatch");
  const inputFormat = params.inputFormat ?? "response_chain";
  if ((inputFormat === "response_chain" && params.effectiveHistory.deferredItems.length > 0)
    || (params.effectiveHistory.incomplete
      && params.effectiveHistory.replayableItems.length === 0
      && params.effectiveHistory.observationOnlyItems.length === 0)) {
    reasons.push("effective_history_incomplete");
  }

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

  const forwardedInput = buildForwardedInput({
    effectiveHistory: params.effectiveHistory,
    currentInput: params.currentInput,
    evicted,
    inputFormat: params.inputFormat,
  });
  reasons.push(...forwardedInput.reasons);
  reasons.push(...closureReasons(forwardedInput.items));

  return {
    valid: reasons.length === 0,
    reasons: Array.from(new Set(reasons)),
    evictedStableItemIds: Array.from(evicted).sort(),
  };
}

function stripServerOwnedResponsesFields(item: JsonObject): JsonObject {
  const next = cloneJson(item);
  delete next.id;
  // These status values are part of their input replay contracts, not merely
  // response-envelope state.
  if (!["program_output", "tool_search_call", "tool_search_output"].includes(
    String(next.type ?? "").toLowerCase(),
  )) delete next.status;
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

export function withCodexRebaseEstimatorAccounting(
  accounting: CodexRebaseAccounting,
  usage: TaskStateEstimatorOutput["usage"],
): CodexRebaseAccounting {
  if (!usage) return accounting;
  const estimatorCostTokens = Math.max(0, Math.trunc(usage.totalTokens));
  // The legacy accounting schema stores a char-equivalent alongside exact API tokens.
  const estimatorCostChars = estimatorCostTokens * 4;
  const totalOneTimeCost = accounting.rebaseReplayCostChars + estimatorCostChars;
  return {
    ...accounting,
    estimatorCostChars,
    estimatorCostTokens,
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
  const inputFormat = typeof params.originalPayload.previous_response_id === "string"
    && params.originalPayload.previous_response_id.trim()
    ? "response_chain" as const
    : "cumulative" as const;
  const validation = validateCodexRebaseRequest({ ...params, inputFormat });
  if (!validation.valid) {
    throw new Error(`Unsafe Codex rebase: ${validation.reasons.join(", ")}`);
  }
  const payload = cloneJson(params.originalPayload);
  delete payload.previous_response_id;

  const evicted = evictedStableItemIds(params.mutationPlan);
  const forwardedInput = buildForwardedInput({
    effectiveHistory: params.effectiveHistory,
    currentInput: params.currentInput,
    evicted,
    inputFormat,
  });
  if (forwardedInput.reasons.length > 0) {
    throw new Error(`Unsafe Codex rebase: ${forwardedInput.reasons.join(", ")}`);
  }
  payload.input = forwardedInput.items;

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
