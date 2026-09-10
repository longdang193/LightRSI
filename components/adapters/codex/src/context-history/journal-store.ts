import { open, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { TextDecoder } from "node:util";
import {
  CODEX_CONTEXT_HISTORY_REQUEST_SCHEMA,
  CODEX_CONTEXT_HISTORY_RESPONSE_SCHEMA,
  isCodexContextHistoryRequestSchema,
  isCodexContextHistoryResponseSchema,
  type CodexContextHistoryJournalEntry,
  type CodexJournalStatus,
  type CodexRequestJournalEntry,
  type CodexResponseJournalEntry,
  type CodexResponseOutputRef,
  type JsonObject,
} from "./types.js";

export type CodexContextHistoryJournalReadResult = {
  entries: CodexContextHistoryJournalEntry[];
  malformedLineCount: number;
  oversized?: boolean;
  readError?: string;
};

export const MAX_CODEX_CONTEXT_HISTORY_JOURNAL_BYTES = 16 * 1024 * 1024;

const MAX_JOURNAL_CACHE_SESSIONS = 128;
const MAX_JOURNAL_CACHE_BYTES = 8 * 1024 * 1024;
const JOURNAL_UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

type JournalCacheEntry = {
  identity: string;
  size: number;
  entries: CodexContextHistoryJournalEntry[];
  malformedLineCount: number;
  lastAccess: number;
};

const journalCache = new Map<string, JournalCacheEntry>();

export type CodexContextHistoryJournalLineParseResult =
  | { status: "valid"; entry: CodexContextHistoryJournalEntry }
  | { status: "invalid_json" }
  | { status: "invalid_record" };

function encodedSessionId(sessionId: string): string {
  return encodeURIComponent(sessionId.trim() || "unknown-session");
}

export function codexContextHistoryJournalPath(stateDir: string, sessionId: string): string {
  return join(stateDir, "context-history", "codex", "sessions", encodedSessionId(sessionId), "journal.jsonl");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nonBlankString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : nonBlankString(value);
}

function canonicalTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
    ? value
    : undefined;
}

function canonicalStatus(value: unknown): CodexJournalStatus | undefined {
  return value === "pending" || value === "completed" || value === "failed" || value === "incomplete"
    ? value
    : undefined;
}

function jsonObjectArray(value: unknown): JsonObject[] | undefined {
  return Array.isArray(value) && value.every(isRecord)
    ? value as JsonObject[]
    : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function countMap(value: unknown): Record<string, number> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.some(([key, count]) => !key.trim() || nonNegativeInteger(count) === undefined)) {
    return undefined;
  }
  return Object.fromEntries(entries) as Record<string, number>;
}

function outputRefs(value: unknown): CodexResponseOutputRef[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const refs: CodexResponseOutputRef[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return undefined;
    const type = optionalString(raw.type);
    const itemId = optionalString(raw.itemId);
    const callId = optionalString(raw.callId);
    if ((raw.type !== undefined && type === undefined)
      || (raw.itemId !== undefined && itemId === undefined)
      || (raw.callId !== undefined && callId === undefined)) {
      return undefined;
    }
    refs.push({
      ...(type ? { type } : {}),
      ...(itemId ? { itemId } : {}),
      ...(callId ? { callId } : {}),
    });
  }
  return refs;
}

function canonicalRequestEntry(
  candidate: Record<string, unknown>,
  sessionId: string,
  status: CodexJournalStatus,
  observedAt: string,
): CodexRequestJournalEntry | undefined {
  const requestId = nonBlankString(candidate.requestId);
  const inputItems = jsonObjectArray(candidate.inputItems);
  const acceptedInputItems = candidate.acceptedInputItems === undefined
    ? undefined
    : jsonObjectArray(candidate.acceptedInputItems);
  const committedInputItems = candidate.committedInputItems === undefined
    ? undefined
    : jsonObjectArray(candidate.committedInputItems);
  const model = optionalString(candidate.model);
  const previousResponseId = optionalString(candidate.previousResponseId);
  const promptCacheKey = optionalString(candidate.promptCacheKey);
  const error = optionalString(candidate.error);
  if (candidate.kind !== "request"
    || !requestId
    || !Number.isInteger(candidate.turnOrdinal)
    || (candidate.turnOrdinal as number) <= 0
    || typeof candidate.stream !== "boolean"
    || !inputItems
    || (candidate.acceptedInputItems !== undefined && !acceptedInputItems)
    || (candidate.committedInputItems !== undefined && !committedInputItems)
    || (candidate.model !== undefined && !model)
    || (candidate.previousResponseId !== undefined && !previousResponseId)
    || (candidate.promptCacheKey !== undefined && !promptCacheKey)
    || (candidate.error !== undefined && !error)) {
    return undefined;
  }
  return {
    schema: CODEX_CONTEXT_HISTORY_REQUEST_SCHEMA,
    kind: "request",
    requestId,
    sessionId,
    turnOrdinal: candidate.turnOrdinal as number,
    ...(model ? { model } : {}),
    stream: candidate.stream,
    ...(previousResponseId ? { previousResponseId } : {}),
    ...(promptCacheKey ? { promptCacheKey } : {}),
    inputItems,
    ...(acceptedInputItems ? { acceptedInputItems } : {}),
    ...(committedInputItems ? { committedInputItems } : {}),
    status,
    ...(error ? { error } : {}),
    observedAt,
  };
}

function canonicalResponseEntry(
  candidate: Record<string, unknown>,
  sessionId: string,
  status: CodexJournalStatus,
  observedAt: string,
): CodexResponseJournalEntry | undefined {
  const requestId = optionalString(candidate.requestId);
  const responseId = optionalString(candidate.responseId);
  const previousResponseId = candidate.previousResponseId === null
    ? null
    : optionalString(candidate.previousResponseId);
  const outputItems = jsonObjectArray(candidate.outputItems);
  const refs = outputRefs(candidate.outputItemRefs);
  const eventTypeCounts = countMap(candidate.eventTypeCounts);
  const malformedEventCount = candidate.malformedEventCount === undefined
    ? undefined
    : nonNegativeInteger(candidate.malformedEventCount);
  const malformedEventTypeCounts = countMap(candidate.malformedEventTypeCounts);
  const error = optionalString(candidate.error);
  if (candidate.kind !== "response"
    || typeof candidate.stream !== "boolean"
    || !outputItems
    || !refs
    || (status === "completed" && !responseId)
    || (candidate.requestId !== undefined && !requestId)
    || (candidate.responseId !== undefined && !responseId)
    || (candidate.previousResponseId !== undefined
      && candidate.previousResponseId !== null
      && previousResponseId === undefined)
    || (candidate.eventTypeCounts !== undefined && !eventTypeCounts)
    || (candidate.malformedEventCount !== undefined && malformedEventCount === undefined)
    || (candidate.malformedEventTypeCounts !== undefined && !malformedEventTypeCounts)
    || (candidate.error !== undefined && !error)) {
    return undefined;
  }
  return {
    schema: CODEX_CONTEXT_HISTORY_RESPONSE_SCHEMA,
    kind: "response",
    ...(requestId ? { requestId } : {}),
    sessionId,
    ...(responseId ? { responseId } : {}),
    ...(previousResponseId !== undefined ? { previousResponseId } : {}),
    stream: candidate.stream,
    outputItems,
    outputItemRefs: refs,
    ...(eventTypeCounts ? { eventTypeCounts } : {}),
    ...(malformedEventCount !== undefined ? { malformedEventCount } : {}),
    ...(malformedEventTypeCounts ? { malformedEventTypeCounts } : {}),
    status,
    ...(error ? { error } : {}),
    observedAt,
  };
}

function canonicalContextHistoryJournalEntry(
  entry: unknown,
  expectedSessionId: string,
): CodexContextHistoryJournalEntry | undefined {
  if (!isRecord(entry)) return undefined;
  const sessionId = nonBlankString(entry.sessionId);
  const status = canonicalStatus(entry.status);
  const observedAt = canonicalTimestamp(entry.observedAt);
  if (!sessionId || sessionId !== expectedSessionId || !status || !observedAt) return undefined;
  if (isCodexContextHistoryRequestSchema(entry.schema)) {
    return canonicalRequestEntry(entry, sessionId, status, observedAt);
  }
  if (isCodexContextHistoryResponseSchema(entry.schema)) {
    return canonicalResponseEntry(entry, sessionId, status, observedAt);
  }
  return undefined;
}

export function parseCodexContextHistoryJournalLine(
  line: string,
  expectedSessionId: string,
): CodexContextHistoryJournalLineParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    return { status: "invalid_json" };
  }
  const entry = canonicalContextHistoryJournalEntry(parsed, expectedSessionId);
  return entry
    ? { status: "valid", entry }
    : { status: "invalid_record" };
}

export function parseCodexContextHistoryJournalText(
  raw: string,
  sessionId: string,
): CodexContextHistoryJournalReadResult {
  const entries: CodexContextHistoryJournalEntry[] = [];
  let malformedLineCount = 0;
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    const parsed = parseCodexContextHistoryJournalLine(line, sessionId);
    if (parsed.status === "valid") entries.push(parsed.entry);
    else malformedLineCount += 1;
  }
  return { entries, malformedLineCount };
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function fileIdentity(metadata: { dev: number; ino: number; birthtimeMs: number }): string {
  return `${metadata.dev}:${metadata.ino}:${metadata.birthtimeMs}`;
}

function cacheBytes(): number {
  let total = 0;
  for (const entry of journalCache.values()) total += entry.size;
  return total;
}

function cacheJournal(path: string, value: Omit<JournalCacheEntry, "lastAccess">): void {
  if (value.size > MAX_JOURNAL_CACHE_BYTES) {
    journalCache.delete(path);
    return;
  }
  journalCache.set(path, { ...value, lastAccess: Date.now() });
  while (journalCache.size > MAX_JOURNAL_CACHE_SESSIONS || cacheBytes() > MAX_JOURNAL_CACHE_BYTES) {
    const oldest = [...journalCache.entries()].sort((left, right) => left[1].lastAccess - right[1].lastAccess)[0];
    if (!oldest) break;
    journalCache.delete(oldest[0]);
  }
}

function cachedRead(entry: JournalCacheEntry): CodexContextHistoryJournalReadResult {
  entry.lastAccess = Date.now();
  return {
    entries: entry.entries,
    malformedLineCount: entry.malformedLineCount,
  };
}

async function readJournalAppend(path: string, offset: number, size: number): Promise<string | undefined> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(size - offset);
    await handle.read(buffer, 0, buffer.length, offset);
    try {
      return JOURNAL_UTF8_DECODER.decode(buffer);
    } catch {
      return undefined;
    }
  } finally {
    await handle.close();
  }
}

export async function readCodexContextHistoryJournal(
  stateDir: string,
  sessionId: string,
): Promise<CodexContextHistoryJournalReadResult> {
  const path = codexContextHistoryJournalPath(stateDir, sessionId);
  let metadata: Awaited<ReturnType<typeof stat>>;
  try {
    metadata = await stat(path);
    if (metadata.size > MAX_CODEX_CONTEXT_HISTORY_JOURNAL_BYTES) {
      journalCache.delete(path);
      return {
        entries: [],
        malformedLineCount: 0,
        oversized: true,
        readError: `Codex context-history journal exceeds ${MAX_CODEX_CONTEXT_HISTORY_JOURNAL_BYTES} bytes`,
      };
    }
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      return {
        entries: [],
        malformedLineCount: 0,
        readError: error instanceof Error ? error.message : String(error),
      };
    }
    journalCache.delete(path);
    return { entries: [], malformedLineCount: 0 };
  }

  const identity = fileIdentity(metadata);
  const cached = journalCache.get(path);
  if (cached && cached.identity === identity && cached.malformedLineCount === 0) {
    if (metadata.size === cached.size) return cachedRead(cached);
    if (metadata.size > cached.size) {
      const appended = await readJournalAppend(path, cached.size, metadata.size);
      if (appended !== undefined && appended.endsWith("\n")) {
        const parsed = parseCodexContextHistoryJournalText(appended, sessionId);
        if (parsed.malformedLineCount === 0) {
          cached.entries.push(...parsed.entries);
          cached.size = metadata.size;
          return cachedRead(cached);
        }
      }
      journalCache.delete(path);
    } else {
      journalCache.delete(path);
    }
  }

  try {
    const raw = await readFile(path, "utf8");
    const parsed = parseCodexContextHistoryJournalText(raw, sessionId);
    if (parsed.malformedLineCount === 0) {
      cacheJournal(path, {
        identity,
        size: metadata.size,
        entries: parsed.entries,
        malformedLineCount: 0,
      });
    } else {
      journalCache.delete(path);
    }
    return parsed;
  } catch (error) {
    return {
      entries: [],
      malformedLineCount: 0,
      readError: errorCode(error) === "ENOENT"
        ? undefined
        : error instanceof Error ? error.message : String(error),
    };
  }
}

export async function readCodexContextHistoryJournalEntries(
  stateDir: string,
  sessionId: string,
): Promise<CodexContextHistoryJournalEntry[]> {
  return (await readCodexContextHistoryJournal(stateDir, sessionId)).entries;
}

export async function loadCodexContextHistoryJournal(
  stateDir: string,
  sessionId: string,
): Promise<CodexContextHistoryJournalEntry[]> {
  return readCodexContextHistoryJournalEntries(stateDir, sessionId);
}
