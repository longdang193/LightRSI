import { readFile } from "node:fs/promises";

import {
  asJsonObject,
  hashJson,
  sanitizeValue,
} from "./shared.js";
import type {
  CodexEffectiveHistory,
  CodexEffectiveHistoryItem,
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

function isToolCall(item: JsonObject): boolean {
  const type = itemType(item);
  return type === "function_call" || type === "custom_tool_call";
}

function isToolOutput(item: JsonObject): boolean {
  const type = itemType(item);
  return type === "function_call_output" || type === "custom_tool_call_output";
}

function expectedOutputType(item: JsonObject): string | undefined {
  const type = itemType(item);
  if (type === "function_call") return "function_call_output";
  if (type === "custom_tool_call") return "custom_tool_call_output";
  return undefined;
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
  replayCandidates: JsonObject[];
  observationCandidates: JsonObject[];
  malformedSinceBaseline: number;
}): CodexEffectiveHistory {
  const expectedOutputs = new Map<string, string>();
  const outputTypes = new Map<string, string>();
  for (const item of params.replayCandidates) {
    const callId = itemCallId(item);
    if (!callId) continue;
    const expectedType = expectedOutputType(item);
    if (expectedType) expectedOutputs.set(callId, expectedType);
    if (isToolOutput(item)) outputTypes.set(callId, itemType(item));
  }

  let incomplete = params.malformedSinceBaseline > 0;
  const occurrences = new Map<string, number>();
  const replayableItems: CodexEffectiveHistoryItem[] = [];
  for (const item of params.replayCandidates) {
    const callId = itemCallId(item);
    if (isToolOutput(item) && (
      !callId
      || expectedOutputs.get(callId) !== itemType(item)
    )) {
      incomplete = true;
      continue;
    }
    replayableItems.push(createEffectiveItem(item, occurrences));
  }

  const observationOnlyItems = params.observationCandidates.map((item) =>
    createEffectiveItem(item, occurrences)
  );
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
    unresolvedCallIds,
    incomplete,
  })}`;

  return {
    revision,
    replayableItems,
    observationOnlyItems,
    unresolvedCallIds,
    source: "rollout_bootstrap",
    incomplete,
  };
}

export function parseCodexRolloutText(params: {
  text: string;
}): CodexRolloutSnapshot | null {
  let replayCandidates: JsonObject[] = [];
  let observationCandidates: JsonObject[] = [];
  let malformedLineCount = 0;
  let malformedSinceBaseline = 0;
  let sessionMeta: CodexRolloutSessionMeta | undefined;
  let compactionBaselineApplied = false;
  const unknownRecordTypeCounts: Record<string, number> = {};
  const taskEvidence: CodexRolloutTaskEvidence = {
    completedTurnIds: [],
    abortedTurnIds: [],
  };

  for (const rawLine of params.text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;
    const record = parseRecord(line);
    if (!record) {
      malformedLineCount += 1;
      malformedSinceBaseline += 1;
      continue;
    }

    const recordType = typeof record.type === "string" ? record.type : undefined;
    const payload = asJsonObject(sanitizeValue(record.payload));
    if (!recordType || !payload) {
      malformedLineCount += 1;
      malformedSinceBaseline += 1;
      continue;
    }

    if (recordType === "session_meta") {
      sessionMeta = parseSessionMeta(payload);
      continue;
    }
    if (recordType === "response_item") {
      replayCandidates.push(payload);
      continue;
    }
    if (recordType === "compacted") {
      const replacementItems = compactionReplacementItems(payload);
      if (!replacementItems) {
        malformedLineCount += 1;
        malformedSinceBaseline += 1;
        continue;
      }
      replayCandidates = replacementItems;
      observationCandidates = [];
      malformedSinceBaseline = 0;
      compactionBaselineApplied = true;
      continue;
    }
    if (recordType === "turn_context" || recordType === "event_msg") {
      if (recordType === "event_msg") addTaskEvidence(payload, taskEvidence);
      observationCandidates.push({ type: recordType, payload });
      continue;
    }
    unknownRecordTypeCounts[recordType] = (unknownRecordTypeCounts[recordType] ?? 0) + 1;
  }

  if (
    replayCandidates.length === 0
    && observationCandidates.length === 0
    && !sessionMeta
  ) {
    return null;
  }

  return {
    history: buildHistory({
      replayCandidates,
      observationCandidates,
      malformedSinceBaseline,
    }),
    sessionMeta,
    malformedLineCount,
    unknownRecordTypeCounts,
    taskEvidence: {
      completedTurnIds: Array.from(new Set(taskEvidence.completedTurnIds)),
      abortedTurnIds: Array.from(new Set(taskEvidence.abortedTurnIds)),
    },
    compactionBaselineApplied,
  };
}

export async function parseCodexRollout(
  rolloutPath: string,
): Promise<CodexRolloutSnapshot | null> {
  try {
    return parseCodexRolloutText({ text: await readFile(rolloutPath, "utf8") });
  } catch {
    return null;
  }
}

export async function parseCodexRolloutFile(params: {
  rolloutPath: string;
}): Promise<CodexRolloutSnapshot | null> {
  return parseCodexRollout(params.rolloutPath);
}
