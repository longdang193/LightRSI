import {
  countTextWithPreciseTokens,
  type ContextItemRef,
} from "@lightrsi/host-adapter";
import type {
  ContextCleanTaskBreakdown,
  ContextCleanTokenCountMode,
} from "./contracts.js";
import {
  attributeItems,
  mapTaskLifecycle,
  type AttributedItem,
  type TaskAttributionInput,
} from "./task-attribution.js";

export const CHARS_PER_TOKEN_ESTIMATE = 4;

export const TOKEN_COUNT_METHOD_EXACT = "openai_tokenizer";
export const TOKEN_COUNT_METHOD_ESTIMATED = "chars_estimate";
export const TOKEN_COUNT_METHOD_CHARS_ONLY = "utf16_chars";

export type ItemTokenCounts = {
  /** null for every item in chars_only mode; non-null otherwise. */
  tokensByStableId: Record<string, number | null>;
  charsByStableId: Record<string, number>;
  tokenCountMode: ContextCleanTokenCountMode;
  tokenCountMethod: string;
};

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Per-item token counts with an explicit degradation chain:
 *
 * 1. itemTokenCounts — precomputed by the host bridge (e.g. Codex counts each
 *    serialized item with the model tokenizer) are authoritative.
 * 2. itemTextByStableId + model — exact tiktoken count when the model is
 *    known; otherwise an estimated chars/4 count (never passes raw char
 *    counts off as provider tokens).
 * 3. Neither — chars_only: token counts stay null and only chars conserve.
 *
 * Mode is the worst observed: any null -> chars_only, any estimate ->
 * estimated, all exact -> exact.
 */
export function buildItemTokenCounts(input: {
  items: ContextItemRef[];
  model?: string;
  itemTextByStableId?: Record<string, string>;
  itemTokenCounts?: Record<string, number>;
}): ItemTokenCounts {
  if (input.items.length === 0) {
    return { tokensByStableId: {}, charsByStableId: {}, tokenCountMode: "chars_only",
      tokenCountMethod: TOKEN_COUNT_METHOD_CHARS_ONLY };
  }
  const tokensByStableId: Record<string, number | null> = {};
  const charsByStableId: Record<string, number> = {};
  let allExact = true;
  for (const item of input.items) {
    charsByStableId[item.stableId] = item.chars;
    const precomputed = input.itemTokenCounts?.[item.stableId];
    if (isNonNegativeFinite(precomputed)) {
      tokensByStableId[item.stableId] = precomputed;
      continue;
    }
    const text = input.itemTextByStableId?.[item.stableId];
    if (typeof text === "string") {
      const counted = countTextWithPreciseTokens(input.model ?? "", text);
      tokensByStableId[item.stableId] = counted.mode === "openai_tokens"
        ? counted.count
        : Math.round(counted.count / CHARS_PER_TOKEN_ESTIMATE);
      if (counted.mode !== "openai_tokens") allExact = false;
      continue;
    }
    tokensByStableId[item.stableId] = null;
  }
  const anyNull = Object.values(tokensByStableId).some((tokens) => tokens === null);
  const tokenCountMode: ContextCleanTokenCountMode = anyNull
    ? "chars_only"
    : allExact ? "exact" : "estimated";
  const tokenCountMethod = tokenCountMode === "exact"
    ? TOKEN_COUNT_METHOD_EXACT
    : tokenCountMode === "estimated" ? TOKEN_COUNT_METHOD_ESTIMATED : TOKEN_COUNT_METHOD_CHARS_ONLY;
  return { tokensByStableId, charsByStableId, tokenCountMode, tokenCountMethod };
}

export type TokenAccountingBreakdown = {
  /** null in chars_only mode; otherwise sums over the items of each task. */
  tokensByTaskId: Record<string, number | null>;
  charsByTaskId: Record<string, number>;
  protectedTokens: number | null;
  protectedChars: number;
  unassignedTokens: number | null;
  unassignedChars: number;
  usedTokens: number | null;
  usedChars: number;
  tokenCountMode: ContextCleanTokenCountMode;
  tokenCountMethod: string;
};

/**
 * Sums every item into exactly one accounting bucket. Each item is attributed
 * to exactly one of {task, protected, unassigned} (shared items only ever
 * count in protected), so conservation holds in both units:
 *
 *   task tokens + protected + unassigned === usedTokens
 *   task chars + protected + unassigned === usedChars
 *
 * Token sums are null in chars_only mode because no item carries a token count.
 */
export function aggregateTaskAccounting(
  attributed: AttributedItem[],
  counts: ItemTokenCounts,
): TokenAccountingBreakdown {
  const tokensByTaskId: Record<string, number> = {};
  const charsByTaskId: Record<string, number> = {};
  let protectedTokens = 0;
  let protectedChars = 0;
  let unassignedTokens = 0;
  let unassignedChars = 0;
  for (const item of attributed) {
    const tokens = counts.tokensByStableId[item.stableId] ?? 0;
    const chars = counts.charsByStableId[item.stableId] ?? 0;
    if (item.bucket === "task") {
      for (const taskId of item.taskIds) {
        tokensByTaskId[taskId] = (tokensByTaskId[taskId] ?? 0) + tokens;
        charsByTaskId[taskId] = (charsByTaskId[taskId] ?? 0) + chars;
      }
    } else if (item.bucket === "protected") {
      protectedTokens += tokens;
      protectedChars += chars;
    } else {
      unassignedTokens += tokens;
      unassignedChars += chars;
    }
  }
  let usedTokens = 0;
  let usedChars = 0;
  for (const item of attributed) {
    usedTokens += counts.tokensByStableId[item.stableId] ?? 0;
    usedChars += counts.charsByStableId[item.stableId] ?? 0;
  }
  const nullable = (value: number): number | null =>
    counts.tokenCountMode === "chars_only" ? null : value;
  return {
    tokensByTaskId: Object.fromEntries(
      Object.entries(tokensByTaskId).map(([taskId, value]) => [taskId, nullable(value)]),
    ),
    charsByTaskId,
    protectedTokens: nullable(protectedTokens),
    protectedChars,
    unassignedTokens: nullable(unassignedTokens),
    unassignedChars,
    usedTokens: nullable(usedTokens),
    usedChars,
    tokenCountMode: counts.tokenCountMode,
    tokenCountMethod: counts.tokenCountMethod,
  };
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

function tokenPercentOf(
  tokens: number | null,
  usedTokens: number | null,
  mode: ContextCleanTokenCountMode,
): number | null {
  if (mode === "chars_only" || tokens === null || usedTokens === null || usedTokens <= 0) {
    return null;
  }
  return roundTo2((tokens / usedTokens) * 100);
}

export type ContextCleanBreakdown = {
  tasks: ContextCleanTaskBreakdown[];
  usedTokens: number | null;
  usedChars: number;
  protectedTokens: number | null;
  protectedChars: number;
  unassignedTokens: number | null;
  unassignedChars: number;
  tokenCountMode: ContextCleanTokenCountMode;
  tokenCountMethod: string;
};

/**
 * Combined 7.2 pipeline: attribution -> counting -> accounting -> task
 * breakdown. Produces everything a ContextCleanPlan needs except identity
 * (planId/hostId/sessionId/baseRevision/createdAt), which the orchestrator
 * supplies. label/description/summary fall back to registry fields or
 * deterministic placeholders; the recommendation analyzer (7.3) replaces
 * description/summary/recommendation later.
 *
 * selectable is deterministic: registry.evictableTaskIds membership, hardened
 * so active/unresolved tasks can never be offered for cleaning even if the
 * registry claims otherwise.
 */
export function buildContextCleanBreakdown(input: TaskAttributionInput & {
  model?: string;
  itemTextByStableId?: Record<string, string>;
  itemTokenCounts?: Record<string, number>;
}): ContextCleanBreakdown {
  const attributed = attributeItems(input);
  const counts = buildItemTokenCounts({
    items: input.snapshot.items,
    model: input.model,
    itemTextByStableId: input.itemTextByStableId,
    itemTokenCounts: input.itemTokenCounts,
  });
  const accounting = aggregateTaskAccounting(attributed, counts);

  const fingerprintByStableId = new Map(
    input.snapshot.items.map((item) => [item.stableId, item.fingerprint]),
  );
  const taskOrder = [...new Set(
    attributed.filter((item) => item.bucket === "task")
      .map((item) => item.taskIds[0]),
  )];

  const tasks: ContextCleanTaskBreakdown[] = [];
  for (const taskId of taskOrder) {
    const itemIds = attributed
      .filter((item) => item.bucket === "task" && item.taskIds[0] === taskId)
      .map((item) => item.stableId);
    const state = input.registry?.tasks[taskId];
    const lifecycleState = state
      ? mapTaskLifecycle(state.lifecycle, state.unresolvedQuestions)
      : "unknown";
    const selectable = (input.registry?.evictableTaskIds.includes(taskId) ?? false)
      && lifecycleState !== "active"
      && lifecycleState !== "unresolved";
    tasks.push({
      taskId,
      label: state?.title ?? taskId,
      description: state?.objective ?? `${taskId} task (${lifecycleState})`,
      summary: state?.objective ?? `${taskId} task (${lifecycleState})`,
      lifecycleState,
      itemIds,
      itemDigests: Object.fromEntries(
        itemIds.map((id) => [id, fingerprintByStableId.get(id) ?? ""]),
      ),
      tokenCount: accounting.tokensByTaskId[taskId] ?? null,
      charCount: accounting.charsByTaskId[taskId] ?? 0,
      tokenPercent: tokenPercentOf(
        accounting.tokensByTaskId[taskId] ?? null,
        accounting.usedTokens,
        accounting.tokenCountMode,
      ),
      // Deterministic safe default until the 7.3 recommendation analyzer runs.
      recommendation: "keep",
      reasonCodes: [],
      selectable,
    });
  }

  return {
    tasks,
    usedTokens: accounting.usedTokens,
    usedChars: accounting.usedChars,
    protectedTokens: accounting.protectedTokens,
    protectedChars: accounting.protectedChars,
    unassignedTokens: accounting.unassignedTokens,
    unassignedChars: accounting.unassignedChars,
    tokenCountMode: accounting.tokenCountMode,
    tokenCountMethod: accounting.tokenCountMethod,
  };
}
