import { appendJsonl } from "@lightmem2/host-adapter";
import { codexContextHistoryJournalPath, readCodexContextHistoryJournalEntries } from "./journal-store.js";
import { cloneJson, hashJson, normalizeStatus, sanitizeValue } from "./shared.js";
import {
  CODEX_CONTEXT_HISTORY_REQUEST_SCHEMA,
  type CodexJournalStatus,
  type CodexRequestJournalEntry,
  type JsonObject,
} from "./types.js";

function sanitizedInputItems(payload: JsonObject): JsonObject[] {
  return Array.isArray(payload.input)
    ? cloneJson(sanitizeValue(payload.input)) as JsonObject[]
    : [];
}

function requestIdFromPayload(params: {
  sessionId: string;
  turnOrdinal?: number;
  payload: JsonObject;
}): string {
  return `req-${hashJson({
    sessionId: params.sessionId,
    turnOrdinal: params.turnOrdinal,
    model: params.payload.model,
    previousResponseId: params.payload.previous_response_id,
    input: params.payload.input,
  })}`;
}

export async function appendCodexRequestJournalEntry(params: {
  stateDir: string;
  sessionId: string;
  payload: JsonObject;
  requestId?: string;
  turnOrdinal?: number;
  status?: CodexJournalStatus;
  error?: string;
  observedAt?: string;
}): Promise<CodexRequestJournalEntry> {
  const requestId = params.requestId ?? requestIdFromPayload(params);
  const current = await readCodexContextHistoryJournalEntries(params.stateDir, params.sessionId);
  const existing = current.find((entry): entry is CodexRequestJournalEntry =>
    entry.kind === "request" && entry.requestId === requestId,
  );
  if (existing) return existing;

  const requestEntries = current.filter((entry) => entry.kind === "request");
  const entry: CodexRequestJournalEntry = {
    schema: CODEX_CONTEXT_HISTORY_REQUEST_SCHEMA,
    kind: "request",
    requestId,
    sessionId: params.sessionId,
    turnOrdinal: params.turnOrdinal ?? requestEntries.length + 1,
    model: typeof params.payload.model === "string" ? params.payload.model : undefined,
    stream: params.payload.stream === true,
    previousResponseId: typeof params.payload.previous_response_id === "string"
      ? params.payload.previous_response_id
      : undefined,
    promptCacheKey: typeof params.payload.prompt_cache_key === "string"
      ? params.payload.prompt_cache_key
      : undefined,
    inputItems: sanitizedInputItems(params.payload),
    status: normalizeStatus(params.status, "pending"),
    error: params.error,
    observedAt: params.observedAt ?? new Date().toISOString(),
  };
  await appendJsonl(codexContextHistoryJournalPath(params.stateDir, params.sessionId), entry);
  return entry;
}
