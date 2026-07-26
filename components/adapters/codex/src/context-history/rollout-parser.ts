import { readFile } from "node:fs/promises";

import {
  asJsonObject,
  hashJson,
  sanitizeValue,
} from "./shared.js";
import type {
  CodexEffectiveHistory,
  CodexEffectiveHistoryItem,
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
  return type === "function_call_output"
    || type === "custom_tool_call_output";
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

export function parseCodexRolloutText(params: {
  text: string;
}): CodexEffectiveHistory | null {
  const replayCandidates: JsonObject[] = [];
  const observationCandidates: JsonObject[] = [];
  let malformedLineCount = 0;

  for (const rawLine of params.text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line) continue;

    const record = parseRecord(line);
    if (!record) {
      malformedLineCount += 1;
      continue;
    }

    const recordType = typeof record.type === "string"
      ? record.type
      : undefined;
    const payload = asJsonObject(sanitizeValue(record.payload));

    if (!recordType || !payload) {
      malformedLineCount += 1;
      continue;
    }

    if (recordType === "response_item") {
      replayCandidates.push(payload);
      continue;
    }

    if (recordType === "turn_context" || recordType === "event_msg") {
      observationCandidates.push({
        type: recordType,
        payload,
      });
    }
  }

  if (
    replayCandidates.length === 0
    && observationCandidates.length === 0
  ) {
    return null;
  }

  const callIds = new Set<string>();
  const outputIds = new Set<string>();

  for (const item of replayCandidates) {
    const callId = itemCallId(item);
    if (!callId) continue;
    if (isToolCall(item)) callIds.add(callId);
    if (isToolOutput(item)) outputIds.add(callId);
  }

  let incomplete = malformedLineCount > 0;
  const occurrences = new Map<string, number>();
  const replayableItems: CodexEffectiveHistoryItem[] = [];

  for (const item of replayCandidates) {
    const callId = itemCallId(item);

    if (isToolOutput(item) && (!callId || !callIds.has(callId))) {
      incomplete = true;
      continue;
    }

    replayableItems.push(createEffectiveItem(item, occurrences));
  }

  const observationOnlyItems = observationCandidates.map((item) =>
    createEffectiveItem(item, occurrences)
  );

  const unresolvedCallIds = Array.from(callIds)
    .filter((callId) => !outputIds.has(callId))
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

export async function parseCodexRolloutFile(params: {
  rolloutPath: string;
}): Promise<CodexEffectiveHistory | null> {
  const text = await readFile(params.rolloutPath, "utf8");
  return parseCodexRolloutText({ text });
}
