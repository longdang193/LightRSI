import { appendJsonl } from "@lightmem2/host-adapter";
import { codexContextHistoryJournalPath } from "./journal-store.js";
import { collectCodexResponseItemsFromStream } from "./sse-item-collector.js";
import { cloneJson, normalizeStatus, sanitizeValue } from "./shared.js";
import {
  CODEX_CONTEXT_HISTORY_RESPONSE_SCHEMA,
  type CodexJournalStatus,
  type CodexResponseJournalEntry,
  type JsonObject,
} from "./types.js";

function outputRefs(outputItems: JsonObject[]): CodexResponseJournalEntry["outputItemRefs"] {
  return outputItems.map((item) => ({
    type: typeof item.type === "string" ? item.type : undefined,
    itemId: typeof item.id === "string" ? item.id : undefined,
    callId: typeof item.call_id === "string" ? item.call_id : undefined,
  }));
}

function responseStatus(params: {
  status?: CodexJournalStatus;
  streamStatus?: CodexJournalStatus;
  malformedEventCount?: number;
}): CodexJournalStatus {
  const status = normalizeStatus(params.status, params.streamStatus ?? "completed");
  return status === "completed" && (params.malformedEventCount ?? 0) > 0
    ? "incomplete"
    : status;
}

export async function appendCodexResponseJournalEntry(params: {
  stateDir: string;
  sessionId: string;
  requestId?: string;
  response?: JsonObject;
  rawStreamText?: string;
  status?: CodexJournalStatus;
  error?: string;
  observedAt?: string;
}): Promise<CodexResponseJournalEntry> {
  const streamCollected = typeof params.rawStreamText === "string"
    ? collectCodexResponseItemsFromStream(params.rawStreamText)
    : undefined;
  const response = params.response ?? {};
  const outputItems = streamCollected
    ? streamCollected.outputItems
    : Array.isArray(response.output)
      ? cloneJson(sanitizeValue(response.output)) as JsonObject[]
      : [];
  const entry: CodexResponseJournalEntry = {
    schema: CODEX_CONTEXT_HISTORY_RESPONSE_SCHEMA,
    kind: "response",
    requestId: params.requestId,
    sessionId: params.sessionId,
    responseId: streamCollected?.responseId ?? (typeof response.id === "string" ? response.id : undefined),
    previousResponseId: streamCollected?.previousResponseId
      ?? (typeof response.previous_response_id === "string" ? response.previous_response_id : undefined),
    stream: typeof params.rawStreamText === "string",
    outputItems,
    outputItemRefs: outputRefs(outputItems),
    eventTypeCounts: streamCollected?.eventTypeCounts,
    malformedEventCount: streamCollected?.malformedEventCount,
    malformedEventTypeCounts: streamCollected?.malformedEventTypeCounts,
    status: responseStatus({
      status: params.status,
      streamStatus: streamCollected?.status,
      malformedEventCount: streamCollected?.malformedEventCount,
    }),
    error: params.error,
    observedAt: params.observedAt ?? new Date().toISOString(),
  };
  await appendJsonl(codexContextHistoryJournalPath(params.stateDir, params.sessionId), entry);
  return entry;
}
