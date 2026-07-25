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
  return Boolean(entry && typeof entry === "object" && (
    (entry as { schema?: unknown }).schema === CODEX_CONTEXT_HISTORY_REQUEST_SCHEMA
    || (entry as { schema?: unknown }).schema === CODEX_CONTEXT_HISTORY_RESPONSE_SCHEMA
  ));
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
