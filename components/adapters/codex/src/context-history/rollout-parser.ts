import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { buildTurnAbsId } from "@lightrsi/history";

import {
  asJsonObject,
  hashJson,
  sanitizeValue,
} from "./shared.js";
import { codexReplayabilityForItem, codexReplayPairRef } from "./replayability.js";
import type {
  CodexEffectiveHistory,
  CodexEffectiveHistoryItem,
  CodexEffectiveHistoryReasonCode,
  CodexEffectiveHistoryTurn,
  CodexEffectiveHistoryView,
  CodexRolloutSessionMeta,
  CodexRolloutSnapshot,
  CodexRolloutTaskEvidence,
  JsonObject,
} from "./types.js";

type RolloutRecord = {
  type?: unknown;
  payload?: unknown;
};

function itemType(item: JsonObject): string {
  if (typeof item.type === "string") return item.type;
  if (typeof item.role === "string") return `message:${item.role}`;
  return "item";
}

function itemCallId(item: JsonObject): string | undefined {
  return typeof item.call_id === "string" ? item.call_id : undefined;
}

function isToolOutput(item: JsonObject): boolean {
  return codexReplayPairRef(item).side === "output";
}

type RolloutAccumulator = {
  replayCandidates: RolloutItemCandidate[];
  observationCandidates: JsonObject[];
  malformedLineCount: number;
  malformedSinceBaseline: number;
  sessionMeta?: CodexRolloutSessionMeta;
  compactionBaselineApplied: boolean;
  unknownRecordTypeCounts: Record<string, number>;
  taskEvidence: CodexRolloutTaskEvidence;
  currentTurnSeq?: number;
};

type RolloutItemCandidate = {
  item: JsonObject;
  turnSeq?: number;
  phase: "input" | "output";
  boundarySource?: "compaction" | "rollout";
};

function createAccumulator(): RolloutAccumulator {
  return {
    replayCandidates: [],
    observationCandidates: [],
    malformedLineCount: 0,
    malformedSinceBaseline: 0,
    compactionBaselineApplied: false,
    unknownRecordTypeCounts: {},
    taskEvidence: { completedTurnIds: [], abortedTurnIds: [] },
  };
}

function expectedOutputType(item: JsonObject): string | undefined {
  const ref = codexReplayPairRef(item);
  return ref.side === "call" ? `${ref.type}_output` : undefined;
}

function createEffectiveItem(
  item: JsonObject,
  occurrences: Map<string, number>,
): CodexEffectiveHistoryItem {
  const type = itemType(item);
  const callId = itemCallId(item);
  const baseNativeId = typeof item.id === "string"
    ? `${type}:id:${item.id}`
    : callId
      ? `${type}:call:${callId}`
      : `${type}:synthetic:${hashJson(item)}`;
  const occurrence = occurrences.get(baseNativeId) ?? 0;
  occurrences.set(baseNativeId, occurrence + 1);
  const nativeId = occurrence === 0
    ? baseNativeId
    : `${baseNativeId}:occurrence:${occurrence}`;

  return {
    stableItemId: `codex-${hashJson(nativeId)}`,
    nativeId,
    callId,
    item,
  };
}

function parseRecord(line: string): RolloutRecord | undefined {
  try {
    return asJsonObject(JSON.parse(line)) as RolloutRecord | undefined;
  } catch {
    return undefined;
  }
}

function parseSessionMeta(payload: JsonObject): CodexRolloutSessionMeta {
  return {
    sessionId: typeof payload.id === "string" ? payload.id : undefined,
    cwd: typeof payload.cwd === "string" ? payload.cwd : undefined,
    originator: typeof payload.originator === "string" ? payload.originator : undefined,
    cliVersion: typeof payload.cli_version === "string" ? payload.cli_version : undefined,
    source: typeof payload.source === "string" ? payload.source : undefined,
    modelProvider: typeof payload.model_provider === "string" ? payload.model_provider : undefined,
  };
}

function compactionReplacementItems(payload: JsonObject): JsonObject[] | undefined {
  if (Array.isArray(payload.replacement_history)) {
    return payload.replacement_history
      .map((item) => asJsonObject(sanitizeValue(item)))
      .filter((item): item is JsonObject => Boolean(item));
  }
  if (typeof payload.message === "string" && payload.message) {
    return [{
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: payload.message }],
    }];
  }
  return undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function turnSeqFromContext(payload: JsonObject): number | undefined {
  return positiveInteger(payload.turn_seq) ?? positiveInteger(payload.turn_ordinal);
}

function itemPhase(item: JsonObject): "input" | "output" {
  const role = typeof item.role === "string" ? item.role : undefined;
  if (role === "assistant") return "output";
  const ref = codexReplayPairRef(item);
  if (ref.side === "call") return "output";
  if (ref.side === "output") return "input";
  return item.type === "reasoning"
    || item.type === "compaction"
    || (typeof item.type === "string" && item.type.endsWith("_call"))
    ? "output"
    : "input";
}

function candidate(
  item: JsonObject,
  turnSeq: number | undefined,
  boundarySource: "compaction" | "rollout",
): RolloutItemCandidate {
  return {
    item,
    turnSeq,
    phase: itemPhase(item),
    ...(turnSeq === undefined ? { boundarySource } : {}),
  };
}

function addTaskEvidence(payload: JsonObject, evidence: CodexRolloutTaskEvidence): void {
  const eventType = typeof payload.type === "string" ? payload.type : undefined;
  const turnId = typeof payload.turn_id === "string" ? payload.turn_id : undefined;
  if (!eventType || !turnId) return;
  if (eventType === "task_complete") evidence.completedTurnIds.push(turnId);
  if (eventType === "task_aborted" || eventType === "turn_aborted") {
    evidence.abortedTurnIds.push(turnId);
  }
}

function buildHistory(params: {
  replayCandidates: RolloutItemCandidate[];
  observationCandidates: JsonObject[];
  malformedSinceBaseline: number;
  sessionId: string;
}): CodexEffectiveHistoryView {
  const replayCandidates: RolloutItemCandidate[] = [];
  const observationCandidates = [...params.observationCandidates];
  const deferredCandidates: RolloutItemCandidate[] = [];
  for (const entry of params.replayCandidates) {
    const replayability = codexReplayabilityForItem(entry.item);
    if (replayability.mode === "replayable") replayCandidates.push(entry);
    else if (replayability.mode === "observation_only") observationCandidates.push(entry.item);
    else deferredCandidates.push(entry);
  }

  const expectedOutputs = new Map<string, string>();
  const outputTypes = new Map<string, string>();
  for (const { item } of replayCandidates) {
    const callId = itemCallId(item);
    if (!callId) continue;
    const expectedType = expectedOutputType(item);
    if (expectedType) expectedOutputs.set(callId, expectedType);
    if (isToolOutput(item)) outputTypes.set(callId, itemType(item));
  }

  let incomplete = params.malformedSinceBaseline > 0 || deferredCandidates.length > 0;
  const occurrences = new Map<string, number>();
  const replayableItems: CodexEffectiveHistoryItem[] = [];
  const effectiveCandidateById = new Map<string, RolloutItemCandidate>();
  const attributedCandidateByItem = new Map(
    params.replayCandidates.map((entry) => [entry.item, entry] as const),
  );
  for (const entry of replayCandidates) {
    const item = entry.item;
    const callId = itemCallId(item);
    if (isToolOutput(item) && (
      !callId
      || expectedOutputs.get(callId) !== itemType(item)
    )) {
      incomplete = true;
      continue;
    }
    const effective = createEffectiveItem(item, occurrences);
    replayableItems.push(effective);
    effectiveCandidateById.set(effective.stableItemId, entry);
  }

  const observationOnlyItems = observationCandidates.map((item) => {
    const effective = createEffectiveItem(item, occurrences);
    const attributed = attributedCandidateByItem.get(item);
    if (attributed) effectiveCandidateById.set(effective.stableItemId, attributed);
    return effective;
  });
  const deferredItems = deferredCandidates.map((entry) => {
    const effective = createEffectiveItem(entry.item, occurrences);
    effectiveCandidateById.set(effective.stableItemId, entry);
    return effective;
  });
  const unresolvedCallIds = Array.from(expectedOutputs)
    .filter(([callId, expectedType]) => outputTypes.get(callId) !== expectedType)
    .map(([callId]) => callId)
    .sort();
  if (unresolvedCallIds.length > 0) incomplete = true;

  const revision = `rev-${hashJson({
    replayableItems: replayableItems.map((entry) => ({
      stableItemId: entry.stableItemId,
      fingerprint: hashJson(entry.item),
    })),
    observationOnlyItems: observationOnlyItems.map((entry) => ({
      stableItemId: entry.stableItemId,
      fingerprint: hashJson(entry.item),
    })),
    deferredItems: deferredItems.map((entry) => ({
      stableItemId: entry.stableItemId,
      fingerprint: hashJson(entry.item),
    })),
    unresolvedCallIds,
    incomplete,
  })}`;

  const history: CodexEffectiveHistory = {
    revision,
    replayableItems,
    observationOnlyItems,
    deferredItems,
    unresolvedCallIds,
    source: "rollout_bootstrap",
    incomplete,
  };
  const turnBySeq = new Map<number, CodexEffectiveHistoryTurn>();
  for (const effective of [...replayableItems, ...observationOnlyItems, ...deferredItems]) {
    const entry = effectiveCandidateById.get(effective.stableItemId);
    if (!entry?.turnSeq) continue;
    const turn = turnBySeq.get(entry.turnSeq) ?? {
      turnSeq: entry.turnSeq,
      turnAbsId: buildTurnAbsId(params.sessionId, entry.turnSeq),
      inputItemIds: [],
      outputItemIds: [],
    };
    const itemIds = entry.phase === "input" ? turn.inputItemIds : turn.outputItemIds;
    if (!itemIds.includes(effective.stableItemId)) itemIds.push(effective.stableItemId);
    turnBySeq.set(entry.turnSeq, turn);
  }
  const effectiveCandidates = Array.from(effectiveCandidateById.values());
  const boundaryUnavailable = effectiveCandidates.some((entry) => entry.turnSeq === undefined);
  const compactionBoundaryUnavailable = effectiveCandidates.some((entry) =>
    entry.turnSeq === undefined && entry.boundarySource === "compaction"
  );
  const reasonCodes: CodexEffectiveHistoryReasonCode[] = Array.from(new Set([
    ...(history.incomplete ? ["history_replay_incomplete" as const] : []),
    ...(params.malformedSinceBaseline > 0 ? ["rollout_malformed_lines" as const] : []),
    ...(compactionBoundaryUnavailable
      ? ["rollout_compaction_turn_boundary_unavailable" as const]
      : boundaryUnavailable
        ? ["rollout_turn_boundary_unavailable" as const]
        : []),
    ...(deferredItems.length > 0 ? ["history_deferred_items" as const] : []),
    ...(unresolvedCallIds.length > 0 ? ["history_unresolved_tool_calls" as const] : []),
  ]));
  return {
    history,
    turns: Array.from(turnBySeq.values()).sort((left, right) => left.turnSeq - right.turnSeq),
    semanticComplete: reasonCodes.length === 0,
    reasonCodes,
  };
}

function consumeRolloutLine(accumulator: RolloutAccumulator, rawLine: string): void {
  const line = rawLine.trim();
  if (!line) return;
  const record = parseRecord(line);
  if (!record) {
    accumulator.malformedLineCount += 1;
    accumulator.malformedSinceBaseline += 1;
    return;
  }

  const recordType = typeof record.type === "string" ? record.type : undefined;
  const payload = asJsonObject(sanitizeValue(record.payload));
  if (!recordType || !payload) {
    accumulator.malformedLineCount += 1;
    accumulator.malformedSinceBaseline += 1;
    return;
  }

  if (recordType === "session_meta") {
    accumulator.sessionMeta = parseSessionMeta(payload);
    return;
  }
  if (recordType === "response_item") {
    accumulator.replayCandidates.push(candidate(payload, accumulator.currentTurnSeq, "rollout"));
    return;
  }
  if (recordType === "compacted") {
    const replacementItems = compactionReplacementItems(payload);
    if (!replacementItems) {
      accumulator.malformedLineCount += 1;
      accumulator.malformedSinceBaseline += 1;
      return;
    }
    const compactionTurnSeq = turnSeqFromContext(payload);
    accumulator.replayCandidates = replacementItems.map((item) =>
      candidate(item, turnSeqFromContext(item), "compaction")
    );
    accumulator.observationCandidates = [];
    accumulator.malformedSinceBaseline = 0;
    accumulator.taskEvidence = { completedTurnIds: [], abortedTurnIds: [] };
    accumulator.compactionBaselineApplied = true;
    accumulator.currentTurnSeq = compactionTurnSeq;
    return;
  }
  if (recordType === "turn_context" || recordType === "event_msg") {
    if (recordType === "turn_context") {
      accumulator.currentTurnSeq = turnSeqFromContext(payload);
    }
    if (recordType === "event_msg") addTaskEvidence(payload, accumulator.taskEvidence);
    accumulator.observationCandidates.push({ type: recordType, payload });
    return;
  }
  accumulator.unknownRecordTypeCounts[recordType] = (
    accumulator.unknownRecordTypeCounts[recordType] ?? 0
  ) + 1;
}

function finishRolloutSnapshot(accumulator: RolloutAccumulator): CodexRolloutSnapshot | null {
  if (
    accumulator.replayCandidates.length === 0
    && accumulator.observationCandidates.length === 0
    && !accumulator.sessionMeta
  ) {
    return null;
  }
  const sessionId = accumulator.sessionMeta?.sessionId ?? "unknown-codex-session";
  const view = buildHistory({
      replayCandidates: accumulator.replayCandidates,
      observationCandidates: accumulator.observationCandidates,
      malformedSinceBaseline: accumulator.malformedSinceBaseline,
      sessionId,
    });
  return {
    history: view.history,
    view,
    sessionMeta: accumulator.sessionMeta,
    malformedLineCount: accumulator.malformedLineCount,
    unknownRecordTypeCounts: accumulator.unknownRecordTypeCounts,
    taskEvidence: {
      completedTurnIds: Array.from(new Set(accumulator.taskEvidence.completedTurnIds)),
      abortedTurnIds: Array.from(new Set(accumulator.taskEvidence.abortedTurnIds)),
    },
    compactionBaselineApplied: accumulator.compactionBaselineApplied,
  };
}

export function parseCodexRolloutText(params: {
  text: string;
}): CodexRolloutSnapshot | null {
  const accumulator = createAccumulator();
  for (const rawLine of params.text.split(/\r?\n/u)) consumeRolloutLine(accumulator, rawLine);
  return finishRolloutSnapshot(accumulator);
}

export async function parseCodexRollout(
  rolloutPath: string,
): Promise<CodexRolloutSnapshot | null> {
  const accumulator = createAccumulator();
  try {
    const lines = createInterface({
      input: createReadStream(rolloutPath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const line of lines) consumeRolloutLine(accumulator, line);
    return finishRolloutSnapshot(accumulator);
  } catch {
    return null;
  }
}

export async function parseCodexRolloutFile(params: {
  rolloutPath: string;
}): Promise<CodexRolloutSnapshot | null> {
  return parseCodexRollout(params.rolloutPath);
}
