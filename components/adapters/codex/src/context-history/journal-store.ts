import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CODEX_CONTEXT_HISTORY_REQUEST_SCHEMA,
  CODEX_CONTEXT_HISTORY_RESPONSE_SCHEMA,
  type CodexContextHistoryJournalEntry,
} from "./types.js";

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

export async function readCodexContextHistoryJournalEntries(
  stateDir: string,
  sessionId: string,
): Promise<CodexContextHistoryJournalEntry[]> {
  try {
    const raw = await readFile(codexContextHistoryJournalPath(stateDir, sessionId), "utf8");
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown)
      .filter(isContextHistoryJournalEntry);
  } catch {
    return [];
  }
}

export async function loadCodexContextHistoryJournal(
  stateDir: string,
  sessionId: string,
): Promise<CodexContextHistoryJournalEntry[]> {
  return readCodexContextHistoryJournalEntries(stateDir, sessionId);
}
