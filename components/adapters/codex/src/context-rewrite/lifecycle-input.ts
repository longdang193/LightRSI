import {
  buildDeltaViewFromRawSemanticSnapshot,
  type DeltaInputMode,
  type DeltaTaskSummary,
  type DeltaView,
  type HistoryBlock,
  type RawSemanticSnapshot,
  type RawSemanticTurnRecord,
  type SessionTaskRegistry,
} from "@lightrsi/history";
import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  type ModelContextSnapshot,
} from "@lightrsi/host-adapter";

import { codexReplayPairRef } from "../context-history/replayability.js";
import type {
  CodexEffectiveHistoryItem,
  CodexEffectiveHistoryView,
  CodexRequestJournalEntry,
} from "../context-history/types.js";
import {
  buildCodexContextSnapshot,
  type CodexSharedBackendMetadata,
  type CodexSharedBackendRequest,
} from "./backend.js";
import {
  buildCodexRawSemanticTurns,
  type CodexRawSemanticReasonCode,
} from "./semantic-mapping.js";

export type CodexLifecycleInputReasonCode =
  | CodexRawSemanticReasonCode
  | "lifecycle_current_request_boundary_untrusted"
  | "lifecycle_registry_session_mismatch"
  | "lifecycle_registry_version_invalid"
  | "lifecycle_registry_watermark_invalid"
  | "lifecycle_registry_ahead_of_history"
  | "lifecycle_no_pending_turns"
  | "lifecycle_snapshot_identity_invalid"
  | "lifecycle_semantic_source_incomplete"
  | "lifecycle_tool_pair_target_missing"
  | "lifecycle_tool_pair_target_ambiguous"
  | "lifecycle_tool_pair_task_mismatch";

export type CodexLifecycleBackendRequestBase = Omit<
  CodexSharedBackendRequest,
  "taskIdsByItemId" | "activeTaskIds" | "evictableTaskIds"
>;

export type BuildCodexLifecycleBackendRequestParams = {
  view: CodexEffectiveHistoryView;
  registry: SessionTaskRegistry;
  request: CodexLifecycleBackendRequestBase;
};

export type BuildCodexLifecycleInputParams = {
  view: CodexEffectiveHistoryView;
  registry: SessionTaskRegistry;
  backendRequest: CodexLifecycleBackendRequestBase;
  expectedCurrentRequest?: Pick<
    CodexRequestJournalEntry,
    "requestId" | "sessionId" | "status" | "turnOrdinal"
  >;
  currentTaskIds?: readonly string[];
  closureDeferredTaskIds?: readonly string[];
  currentActiveTaskHint?: string;
  inputMode?: DeltaInputMode;
  completedTaskSummaries?: DeltaTaskSummary[];
};

export type CodexLifecycleInputDeferred = {
  status: "deferred";
  reasonCodes: CodexLifecycleInputReasonCode[];
};

export type CodexLifecycleInputReady = {
  status: "ready";
  reasonCodes: [];
  committedView: CodexEffectiveHistoryView;
  rawSemanticTurns: RawSemanticTurnRecord[];
  rawSemanticSnapshot: RawSemanticSnapshot;
  delta: DeltaView;
  pendingTurnCount: number;
  historyBlocks: HistoryBlock[];
  stableItemIdsByMessageId: Record<string, string[]>;
  backendRequest: CodexSharedBackendRequest;
  snapshot: ModelContextSnapshot<CodexSharedBackendMetadata>;
  activeTaskIds: string[];
  currentTaskIds: string[];
  currentTurnAbsId?: string;
  closureDeferredTaskIds: string[];
};

export type CodexLifecycleInputResult =
  | CodexLifecycleInputDeferred
  | CodexLifecycleInputReady;

type ToolPairEntry = {
  entry: CodexEffectiveHistoryItem;
  kind: "function" | "custom";
  side: "call" | "output";
};

function uniqueStrings(values: Iterable<string | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function uniqueReasons(
  values: Iterable<CodexLifecycleInputReasonCode | undefined>,
): CodexLifecycleInputReasonCode[] {
  const result: CodexLifecycleInputReasonCode[] = [];
  const seen = new Set<CodexLifecycleInputReasonCode>();
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function deferred(
  values: Iterable<CodexLifecycleInputReasonCode | undefined>,
): CodexLifecycleInputDeferred {
  return { status: "deferred", reasonCodes: uniqueReasons(values) };
}

function allEffectiveItems(view: CodexEffectiveHistoryView): CodexEffectiveHistoryItem[] {
  return [
    ...view.history.replayableItems,
    ...view.history.observationOnlyItems,
    ...view.history.deferredItems,
  ];
}

function expectedCurrentRequestTrusted(
  params: BuildCodexLifecycleInputParams,
): boolean {
  const request = params.expectedCurrentRequest;
  if (!request) return false;
  const latestCommittedTurn = Math.max(0, ...params.view.turns.map((turn) => turn.turnSeq));
  return request.requestId.trim().length > 0
    && request.sessionId === params.backendRequest.sessionId
    && request.sessionId === params.registry.sessionId
    && request.status === "pending"
    && Number.isInteger(request.turnOrdinal)
    && request.turnOrdinal > latestCommittedTurn;
}

function committedHeadView(
  params: BuildCodexLifecycleInputParams,
): CodexEffectiveHistoryView | CodexLifecycleInputDeferred {
  const currentPendingReason = "journal_current_request_uncommitted" as const;
  const hasExpectedPendingBoundary = params.view.reasonCodes.includes(currentPendingReason);
  if (hasExpectedPendingBoundary && !expectedCurrentRequestTrusted(params)) {
    return deferred([
      currentPendingReason,
      "lifecycle_current_request_boundary_untrusted",
    ]);
  }

  const remainingReasons = params.view.reasonCodes.filter(
    (reason) => reason !== currentPendingReason,
  );
  const structuralReasons: CodexLifecycleInputReasonCode[] = [
    ...(params.view.history.incomplete
      ? ["history_replay_incomplete" as const]
      : []),
    ...(params.view.history.deferredItems.length > 0
      ? ["history_deferred_items" as const]
      : []),
    ...(params.view.history.unresolvedCallIds.length > 0
      ? ["history_unresolved_tool_calls" as const]
      : []),
  ];
  const structurallyIncomplete = params.view.history.incomplete
    || params.view.history.deferredItems.length > 0
    || params.view.history.unresolvedCallIds.length > 0;
  const unexplainedSemanticIncomplete = !params.view.semanticComplete
    && !hasExpectedPendingBoundary;
  if (
    remainingReasons.length > 0
    || structurallyIncomplete
    || unexplainedSemanticIncomplete
  ) {
    return deferred([
      ...remainingReasons,
      ...structuralReasons,
      "lifecycle_semantic_source_incomplete",
    ]);
  }

  return {
    ...params.view,
    semanticComplete: true,
    reasonCodes: [],
  };
}

function stableItemTurnIds(view: CodexEffectiveHistoryView): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const turn of [...view.turns].sort((left, right) => left.turnSeq - right.turnSeq)) {
    for (const stableItemId of [...turn.inputItemIds, ...turn.outputItemIds]) {
      result.set(stableItemId, uniqueStrings([
        ...(result.get(stableItemId) ?? []),
        turn.turnAbsId,
      ]));
    }
  }
  return result;
}

function taskIdsForStableItem(params: {
  registry: SessionTaskRegistry;
  stableItemId: string;
  turnIdsByStableItemId: ReadonlyMap<string, readonly string[]>;
}): string[] {
  return uniqueStrings([
    ...(params.turnIdsByStableItemId.get(params.stableItemId) ?? [])
      .flatMap((turnAbsId) => params.registry.turnToTaskIds[turnAbsId] ?? []),
    ...(params.registry.blockToTaskIds[params.stableItemId] ?? []),
    ...(params.registry.blockToTaskIds[`history-block:${params.stableItemId}`] ?? []),
  ]);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const normalizedLeft = uniqueStrings(left);
  const normalizedRight = uniqueStrings(right);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value) => normalizedRight.includes(value));
}

/**
 * Rebinds the canonical Codex backend request to one registry version. PR-C can
 * call this again after estimator updates so validation sees the post-update
 * task ownership without inventing another snapshot or stable-id rule.
 */
export function buildCodexLifecycleBackendRequest(
  params: BuildCodexLifecycleBackendRequestParams,
): CodexSharedBackendRequest {
  const turnIdsByStableItemId = stableItemTurnIds(params.view);
  const taskIdsByItemId: Record<string, string[]> = {};
  for (const item of allEffectiveItems(params.view)) {
    const taskIds = taskIdsForStableItem({
      registry: params.registry,
      stableItemId: item.stableItemId,
      turnIdsByStableItemId,
    });
    if (taskIds.length > 0) taskIdsByItemId[item.stableItemId] = taskIds;
  }
  for (const pairEntries of toolPairsByCallId(params.view).values()) {
    const calls = pairEntries.filter((entry) => entry.side === "call");
    const outputs = pairEntries.filter((entry) => entry.side === "output");
    if (
      calls.length !== 1
      || outputs.length !== 1
      || calls[0]!.kind !== outputs[0]!.kind
    ) continue;

    const callId = calls[0]!.entry.stableItemId;
    const outputId = outputs[0]!.entry.stableItemId;
    const callTaskIds = taskIdsByItemId[callId] ?? [];
    const outputTaskIds = taskIdsByItemId[outputId] ?? [];
    if (
      callTaskIds.length > 0
      && outputTaskIds.length > 0
      && !sameStringSet(callTaskIds, outputTaskIds)
    ) continue;

    // The semantic estimator intentionally anchors a completed pair to the
    // original call turn. Mirror that ownership onto the later result item so
    // the shared backend observes one protocol closure after registry update.
    const pairTaskIds = uniqueStrings([...callTaskIds, ...outputTaskIds]);
    if (pairTaskIds.length > 0) {
      taskIdsByItemId[callId] = pairTaskIds;
      taskIdsByItemId[outputId] = pairTaskIds;
    }
  }
  return {
    ...params.request,
    effectiveHistory: params.view.history,
    taskIdsByItemId,
    activeTaskIds: uniqueStrings(params.registry.activeTaskIds),
    evictableTaskIds: uniqueStrings(params.registry.evictableTaskIds),
  };
}

function rawSnapshot(
  sessionId: string,
  turns: readonly RawSemanticTurnRecord[],
): RawSemanticSnapshot {
  return {
    sessionId,
    lastTurnSeq: Math.max(0, ...turns.map((turn) => turn.turnSeq)),
    messages: turns.flatMap((turn) => turn.messages),
    toolCalls: turns.flatMap((turn) => turn.toolCalls),
    toolResults: turns.flatMap((turn) => turn.toolResults),
  };
}

function toolPairsByCallId(
  view: CodexEffectiveHistoryView,
): Map<string, ToolPairEntry[]> {
  const result = new Map<string, ToolPairEntry[]>();
  for (const entry of view.history.replayableItems) {
    const pair = codexReplayPairRef(entry.item);
    const originalCallId = typeof entry.item.call_id === "string"
      && entry.item.call_id.trim().length > 0
      ? entry.item.call_id
      : undefined;
    if (
      !originalCallId
      || !pair.side
      || (pair.kind !== "function" && pair.kind !== "custom")
    ) continue;
    const entries = result.get(originalCallId) ?? [];
    entries.push({ entry, kind: pair.kind, side: pair.side });
    result.set(originalCallId, entries);
  }
  return result;
}

function lifecycleBlocks(params: {
  view: CodexEffectiveHistoryView;
  registry: SessionTaskRegistry;
  turns: readonly RawSemanticTurnRecord[];
  taskIdsByItemId: Readonly<Record<string, readonly string[]>>;
}): {
  historyBlocks: HistoryBlock[];
  stableItemIdsByMessageId: Record<string, string[]>;
} | CodexLifecycleInputDeferred {
  const pairsByCallId = toolPairsByCallId(params.view);
  const turnIdsByStableItemId = stableItemTurnIds(params.view);
  const turnsByAbsId = new Map(
    params.view.turns.map((turn) => [turn.turnAbsId, turn]),
  );
  const historyBlocks: HistoryBlock[] = [];
  const stableItemIdsByMessageId: Record<string, string[]> = {};
  const claimedSegmentIds = new Set<string>();

  for (const result of params.turns.flatMap((turn) => turn.toolResults)) {
    const pairs = pairsByCallId.get(result.toolCallId) ?? [];
    const calls = pairs.filter((entry) => entry.side === "call");
    const outputs = pairs.filter((entry) => entry.side === "output");
    if (calls.length === 0 || outputs.length === 0) {
      return deferred(["lifecycle_tool_pair_target_missing"]);
    }
    if (
      calls.length !== 1
      || outputs.length !== 1
      || calls[0]!.kind !== outputs[0]!.kind
    ) {
      return deferred(["lifecycle_tool_pair_target_ambiguous"]);
    }

    const call = calls[0]!;
    const output = outputs[0]!;
    const segmentId = output.entry.stableItemId;
    if (claimedSegmentIds.has(segmentId)) {
      return deferred(["lifecycle_tool_pair_target_ambiguous"]);
    }
    claimedSegmentIds.add(segmentId);

    const callTaskIds = uniqueStrings(
      params.taskIdsByItemId[call.entry.stableItemId] ?? [],
    );
    const outputTaskIds = uniqueStrings(
      params.taskIdsByItemId[output.entry.stableItemId] ?? [],
    );
    if (
      callTaskIds.length > 0
      && outputTaskIds.length > 0
      && !sameStringSet(callTaskIds, outputTaskIds)
    ) {
      return deferred(["lifecycle_tool_pair_task_mismatch"]);
    }
    const taskIds = uniqueStrings([
      ...callTaskIds,
      ...outputTaskIds,
      ...(params.registry.turnToTaskIds[result.anchor.turnAbsId] ?? []),
    ]);
    const turnAbsIds = uniqueStrings([
      ...(turnIdsByStableItemId.get(call.entry.stableItemId) ?? []),
      ...(turnIdsByStableItemId.get(output.entry.stableItemId) ?? []),
      result.anchor.turnAbsId,
    ]);
    const turnAnchors = turnAbsIds.map((turnAbsId) => {
      const turn = turnsByAbsId.get(turnAbsId);
      return turn
        ? {
            sessionId: result.anchor.sessionId,
            turnAbsId,
            turnSeq: turn.turnSeq,
            role: "tool" as const,
          }
        : result.anchor;
    });
    const charCount = result.fullText.length;
    historyBlocks.push({
      blockId: `history-block:${segmentId}`,
      blockType: "tool_result",
      lifecycleState: "ACTIVE",
      segmentIds: [segmentId],
      text: result.fullText,
      charCount,
      approxTokens: Math.max(0, Math.round(charCount / 4)),
      source: "codex_effective_history",
      toolName: result.toolName,
      turnAnchors,
      turnAbsIds,
      ...(taskIds.length > 0 ? { taskIds } : {}),
      metadata: {
        callId: result.toolCallId,
        replayPairKind: call.kind,
      },
    });
    stableItemIdsByMessageId[segmentId] = [
      call.entry.stableItemId,
      output.entry.stableItemId,
    ];
  }

  return { historyBlocks, stableItemIdsByMessageId };
}

function validSnapshotIdentity(
  snapshot: ModelContextSnapshot<CodexSharedBackendMetadata>,
): boolean {
  const stableIds = snapshot.items.map((item) => item.stableId);
  return snapshot.schemaVersion === MODEL_CONTEXT_REWRITE_SCHEMA_VERSION
    && snapshot.hostId.trim().length > 0
    && snapshot.sessionId.trim().length > 0
    && snapshot.revision.trim().length > 0
    && stableIds.length === new Set(stableIds).size
    && snapshot.items.every(
      (item) => item.stableId.trim().length > 0
        && item.fingerprint.trim().length > 0,
    );
}

/**
 * Pure Codex adapter projection for the shared lifecycle planner. It performs
 * no filesystem writes, estimator calls, planner calls, tracing, or mutation.
 */
export function buildCodexLifecycleInput(
  params: BuildCodexLifecycleInputParams,
): CodexLifecycleInputResult {
  if (
    !params.backendRequest.sessionId.trim()
    || params.registry.sessionId !== params.backendRequest.sessionId
  ) {
    return deferred(["lifecycle_registry_session_mismatch"]);
  }
  if (!Number.isInteger(params.registry.version) || params.registry.version < 0) {
    return deferred(["lifecycle_registry_version_invalid"]);
  }
  if (
    !Number.isInteger(params.registry.lastProcessedTurnSeq)
    || params.registry.lastProcessedTurnSeq < 0
  ) {
    return deferred(["lifecycle_registry_watermark_invalid"]);
  }

  const committed = committedHeadView(params);
  if ("status" in committed) return committed;
  const semantic = buildCodexRawSemanticTurns(committed);
  if (!semantic.complete) return deferred(semantic.reasonCodes);
  if (semantic.turns.some((turn) => turn.sessionId !== params.registry.sessionId)) {
    return deferred(["lifecycle_registry_session_mismatch"]);
  }

  const snapshot = rawSnapshot(params.registry.sessionId, semantic.turns);
  if (params.registry.lastProcessedTurnSeq > snapshot.lastTurnSeq) {
    return deferred(["lifecycle_registry_ahead_of_history"]);
  }
  if (params.registry.lastProcessedTurnSeq === snapshot.lastTurnSeq) {
    return deferred(["lifecycle_no_pending_turns"]);
  }
  const delta = buildDeltaViewFromRawSemanticSnapshot(snapshot, {
    fromTurnSeqExclusive: params.registry.lastProcessedTurnSeq,
    toTurnSeqInclusive: snapshot.lastTurnSeq,
    currentActiveTaskHint: params.currentActiveTaskHint,
    inputMode: params.inputMode,
    completedTaskSummaries: params.completedTaskSummaries,
  });
  const pendingTurnCount = semantic.turns.filter(
    (turn) => turn.turnSeq > params.registry.lastProcessedTurnSeq
      && turn.turnSeq <= snapshot.lastTurnSeq,
  ).length;

  const backendRequest = buildCodexLifecycleBackendRequest({
    view: committed,
    registry: params.registry,
    request: params.backendRequest,
  });
  const blocks = lifecycleBlocks({
    view: committed,
    registry: params.registry,
    turns: semantic.turns,
    taskIdsByItemId: backendRequest.taskIdsByItemId ?? {},
  });
  if ("status" in blocks) return blocks;
  const contextSnapshot = buildCodexContextSnapshot(backendRequest);
  if (!validSnapshotIdentity(contextSnapshot)) {
    return deferred(["lifecycle_snapshot_identity_invalid"]);
  }

  const latestTurn = [...committed.turns]
    .sort((left, right) => left.turnSeq - right.turnSeq)
    .at(-1);
  return {
    status: "ready",
    reasonCodes: [],
    committedView: committed,
    rawSemanticTurns: semantic.turns,
    rawSemanticSnapshot: snapshot,
    delta,
    pendingTurnCount,
    historyBlocks: blocks.historyBlocks,
    stableItemIdsByMessageId: blocks.stableItemIdsByMessageId,
    backendRequest,
    snapshot: contextSnapshot,
    activeTaskIds: uniqueStrings(params.registry.activeTaskIds),
    currentTaskIds: uniqueStrings(params.currentTaskIds ?? []),
    ...(latestTurn ? { currentTurnAbsId: latestTurn.turnAbsId } : {}),
    closureDeferredTaskIds: uniqueStrings(params.closureDeferredTaskIds ?? []),
  };
}
