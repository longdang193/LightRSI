import { readCodexContextHistoryJournal } from "./journal-store.js";
import {
  appendCodexContextHistoryJournalEntryLocked,
  withCodexContextHistoryJournalLock,
} from "./journal-append.js";
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
    input: sanitizedInputItems(params.payload),
  })}`;
}

function latestRequestEntry(
  entries: Awaited<ReturnType<typeof readCodexContextHistoryJournal>>["entries"],
  requestId: string,
): CodexRequestJournalEntry | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.kind === "request" && entry.requestId === requestId) return entry;
  }
  return undefined;
}

function canAdvanceStatus(current: CodexJournalStatus, next: CodexJournalStatus): boolean {
  if (current === next) return false;
  if (current === "completed" || current === "failed") return false;
  return next !== "pending";
}

async function appendCodexRequestJournalEntryLocked(params: {
  stateDir: string;
  sessionId: string;
  payload: JsonObject;
  committedInputItems?: JsonObject[];
  requestId?: string;
  turnOrdinal?: number;
  status?: CodexJournalStatus;
  error?: string;
  observedAt?: string;
}): Promise<CodexRequestJournalEntry> {
  const requestId = params.requestId ?? requestIdFromPayload(params);
  const journal = await readCodexContextHistoryJournal(params.stateDir, params.sessionId);
  if (journal.readError || journal.malformedLineCount > 0) {
    throw new Error(`Refusing to update invalid Codex context-history journal for session ${params.sessionId}`);
  }
  const current = journal.entries;
  const existing = latestRequestEntry(current, requestId);
  const nextStatus = normalizeStatus(params.status, existing?.status ?? "pending");
  if (existing && !canAdvanceStatus(existing.status, nextStatus)) return existing;

  const requestEntries = new Set(
    current.filter((entry) => entry.kind === "request").map((entry) => entry.requestId),
  );
  const entry: CodexRequestJournalEntry = {
    schema: CODEX_CONTEXT_HISTORY_REQUEST_SCHEMA,
    kind: "request",
    requestId,
    sessionId: params.sessionId,
    turnOrdinal: existing?.turnOrdinal ?? params.turnOrdinal ?? requestEntries.size + 1,
    model: existing?.model ?? (typeof params.payload.model === "string" ? params.payload.model : undefined),
    stream: existing?.stream ?? params.payload.stream === true,
    previousResponseId: existing?.previousResponseId ?? (
      typeof params.payload.previous_response_id === "string" ? params.payload.previous_response_id : undefined
    ),
    promptCacheKey: existing?.promptCacheKey ?? (
      typeof params.payload.prompt_cache_key === "string" ? params.payload.prompt_cache_key : undefined
    ),
    inputItems: existing?.inputItems ?? sanitizedInputItems(params.payload),
    committedInputItems: existing?.committedInputItems ?? (
      params.committedInputItems
        ? cloneJson(sanitizeValue(params.committedInputItems)) as JsonObject[]
        : undefined
    ),
    status: nextStatus,
    error: params.error,
    observedAt: params.observedAt ?? new Date().toISOString(),
  };
  await appendCodexContextHistoryJournalEntryLocked(params.stateDir, params.sessionId, entry);
  return entry;
}

export async function appendCodexRequestJournalEntry(params: {
  stateDir: string;
  sessionId: string;
  payload: JsonObject;
  committedInputItems?: JsonObject[];
  requestId?: string;
  turnOrdinal?: number;
  status?: CodexJournalStatus;
  error?: string;
  observedAt?: string;
}): Promise<CodexRequestJournalEntry> {
  return withCodexContextHistoryJournalLock(
    { stateDir: params.stateDir, sessionId: params.sessionId },
    () => appendCodexRequestJournalEntryLocked(params),
  );
}
