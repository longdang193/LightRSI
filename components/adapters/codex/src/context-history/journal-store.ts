import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CODEX_CONTEXT_HISTORY_REQUEST_SCHEMA,
  CODEX_CONTEXT_HISTORY_RESPONSE_SCHEMA,
  type CodexContextHistoryJournalEntry,
} from "./types.js";

export type CodexContextHistoryJournalReadResult = {
  entries: CodexContextHistoryJournalEntry[];
  malformedLineCount: number;
  readError?: string;
};

function encodedSessionId(sessionId: string): string {
  return encodeURIComponent(sessionId.trim() || "unknown-session");
}

export function codexContextHistoryJournalPath(stateDir: string, sessionId: string): string {
  return join(stateDir, "context-history", "codex", "sessions", encodedSessionId(sessionId), "journal.jsonl");
}

function isContextHistoryJournalEntry(entry: unknown): entry is CodexContextHistoryJournalEntry {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
  const candidate = entry as Record<string, unknown>;
  const validStatus = candidate.status === "pending"
    || candidate.status === "completed"
    || candidate.status === "failed"
    || candidate.status === "incomplete";
  if (!validStatus || typeof candidate.sessionId !== "string" || typeof candidate.observedAt !== "string") {
    return false;
  }
  if (candidate.schema === CODEX_CONTEXT_HISTORY_REQUEST_SCHEMA) {
    return candidate.kind === "request"
      && typeof candidate.requestId === "string"
      && typeof candidate.turnOrdinal === "number"
      && typeof candidate.stream === "boolean"
      && Array.isArray(candidate.inputItems);
  }
  if (candidate.schema === CODEX_CONTEXT_HISTORY_RESPONSE_SCHEMA) {
    return candidate.kind === "response"
      && typeof candidate.stream === "boolean"
      && Array.isArray(candidate.outputItems)
      && Array.isArray(candidate.outputItemRefs);
  }
  return false;
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

export async function readCodexContextHistoryJournal(
  stateDir: string,
  sessionId: string,
): Promise<CodexContextHistoryJournalReadResult> {
  let raw: string;
  try {
    raw = await readFile(codexContextHistoryJournalPath(stateDir, sessionId), "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { entries: [], malformedLineCount: 0 };
    }
    return {
      entries: [],
      malformedLineCount: 0,
      readError: error instanceof Error ? error.message : String(error),
    };
  }

  const entries: CodexContextHistoryJournalEntry[] = [];
  let malformedLineCount = 0;
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isContextHistoryJournalEntry(parsed)) entries.push(parsed);
      else malformedLineCount += 1;
    } catch {
      malformedLineCount += 1;
    }
  }
  return { entries, malformedLineCount };
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
