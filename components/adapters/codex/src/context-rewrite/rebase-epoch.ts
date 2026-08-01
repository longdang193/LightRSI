import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { appendJsonl } from "@lightmem2/host-adapter";
import {
  CODEX_REBASE_EPOCH_SCHEMA,
  type CodexRebaseEpoch,
  type CodexRebaseAccounting,
  type CodexRebaseEpochStatus,
} from "./types.js";

export type CodexRebaseEpochJournalReadResult = {
  entries: CodexRebaseEpoch[];
  epochs: CodexRebaseEpoch[];
  malformedLineCount: number;
  readError?: string;
};

export type CodexRebaseSessionLock = {
  lockPath: string;
  release(): Promise<void>;
};

type CodexRebaseLockOwner = {
  token: string;
  pid: number;
  hostname: string;
  createdAt: string;
};

const DEFAULT_REBASE_LOCK_STALE_MS = 30 * 60 * 1000;

function encodedSessionId(sessionId: string): string {
  return encodeURIComponent(sessionId.trim() || "unknown-session");
}

export function codexRebaseEpochJournalPath(stateDir: string, sessionId: string): string {
  return join(stateDir, "context-rewrite", "codex", "sessions", encodedSessionId(sessionId), "rebase-epochs.jsonl");
}

export function codexRebaseSessionLockPath(stateDir: string, sessionId: string): string {
  return join(stateDir, "context-rewrite", "codex", "sessions", encodedSessionId(sessionId), "rebase.lock");
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function isStatus(value: unknown): value is CodexRebaseEpochStatus {
  return value === "pending" || value === "committed" || value === "failed" || value === "rolled_back";
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function timestampMs(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) === "EPERM";
  }
}

function asLockOwner(value: unknown): CodexRebaseLockOwner | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const owner = value as Record<string, unknown>;
  return typeof owner.token === "string" && owner.token.length > 0
    && typeof owner.pid === "number" && Number.isInteger(owner.pid) && owner.pid > 0
    && typeof owner.hostname === "string" && owner.hostname.length > 0
    && timestampMs(owner.createdAt) !== undefined
    ? owner as CodexRebaseLockOwner
    : undefined;
}

async function readLockOwner(lockPath: string): Promise<CodexRebaseLockOwner | undefined> {
  try {
    return asLockOwner(JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")) as unknown);
  } catch {
    return undefined;
  }
}

async function lockIsStale(params: {
  lockPath: string;
  staleAfterMs: number;
  nowMs: number;
}): Promise<boolean> {
  const owner = await readLockOwner(params.lockPath);
  if (owner) {
    if (owner.hostname === hostname()) return !isProcessAlive(owner.pid);
    return params.nowMs - (timestampMs(owner.createdAt) ?? params.nowMs) > params.staleAfterMs;
  }
  try {
    const lockStat = await stat(params.lockPath);
    return params.nowMs - lockStat.mtimeMs > params.staleAfterMs;
  } catch {
    return true;
  }
}

export async function acquireCodexRebaseSessionLock(params: {
  stateDir: string;
  sessionId: string;
  staleAfterMs?: number;
  nowMs?: number;
}): Promise<CodexRebaseSessionLock | undefined> {
  const lockPath = codexRebaseSessionLockPath(params.stateDir, params.sessionId);
  const staleAfterMs = Math.max(1_000, params.staleAfterMs ?? DEFAULT_REBASE_LOCK_STALE_MS);
  const nowMs = params.nowMs ?? Date.now();
  await mkdir(dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await mkdir(lockPath);
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
      if (!await lockIsStale({ lockPath, staleAfterMs, nowMs })) return undefined;
      await rm(lockPath, { recursive: true, force: true });
      continue;
    }

    const owner: CodexRebaseLockOwner = {
      token: randomUUID(),
      pid: process.pid,
      hostname: hostname(),
      createdAt: new Date(nowMs).toISOString(),
    };
    try {
      await writeFile(join(lockPath, "owner.json"), JSON.stringify(owner), { encoding: "utf8", flag: "wx" });
    } catch (error) {
      await rm(lockPath, { recursive: true, force: true });
      throw error;
    }
    return {
      lockPath,
      async release() {
        try {
          const current = await readLockOwner(lockPath);
          if (current?.token === owner.token) {
            await rm(lockPath, { recursive: true, force: true });
          }
        } catch {
          // A stale lock is safer than deleting a lock that may have changed ownership.
        }
      },
    };
  }
  return undefined;
}

function isCodexRebaseAccounting(value: unknown): value is CodexRebaseAccounting {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return isNonNegativeNumber(entry.plannedSavedChars)
    && isNonNegativeNumber(entry.plannedSavedTokens)
    && isNonNegativeNumber(entry.actuallyRemovedChars)
    && isNonNegativeNumber(entry.actuallyRemovedTokens)
    && isNonNegativeNumber(entry.rebaseReplayCostChars)
    && isNonNegativeNumber(entry.rebaseReplayCostTokens)
    && isNonNegativeNumber(entry.subsequentSavedCharsPerTurn)
    && isNonNegativeNumber(entry.subsequentSavedTokensPerTurn)
    && isNonNegativeNumber(entry.estimatorCostChars)
    && isNonNegativeNumber(entry.estimatorCostTokens)
    && isNonNegativeNumber(entry.fallbackExtraRequestCount)
    && isNonNegativeNumber(entry.cacheColdMissCount)
    && (entry.breakEvenTurn === undefined || isNonNegativeNumber(entry.breakEvenTurn));
}

function isCodexRebaseEpoch(value: unknown): value is CodexRebaseEpoch {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return entry.schema === CODEX_REBASE_EPOCH_SCHEMA
    && typeof entry.epochId === "string"
    && typeof entry.sessionId === "string"
    && typeof entry.planId === "string"
    && typeof entry.oldPreviousResponseId === "string"
    && typeof entry.oldRevision === "string"
    && isStatus(entry.status)
    && timestampMs(entry.createdAt) !== undefined
    && timestampMs(entry.updatedAt) !== undefined
    && (entry.newResponseId === undefined || typeof entry.newResponseId === "string")
    && (entry.newRevision === undefined || typeof entry.newRevision === "string")
    && (entry.failureReason === undefined || typeof entry.failureReason === "string")
    && (entry.accounting === undefined || isCodexRebaseAccounting(entry.accounting));
}

function collapseLatestEpochs(entries: CodexRebaseEpoch[]): CodexRebaseEpoch[] {
  const latest = new Map<string, CodexRebaseEpoch>();
  for (const entry of entries) {
    latest.delete(entry.epochId);
    latest.set(entry.epochId, entry);
  }
  return Array.from(latest.values());
}

function latestEpochById(entries: CodexRebaseEpoch[], epochId: string): CodexRebaseEpoch | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.epochId === epochId) return entry;
  }
  return undefined;
}

function latestEpoch(epochs: CodexRebaseEpoch[]): CodexRebaseEpoch | undefined {
  return epochs.at(-1);
}

function throwIfReadFailed(journal: CodexRebaseEpochJournalReadResult): void {
  if (journal.readError) throw new Error(`Unable to read Codex rebase epoch journal: ${journal.readError}`);
}

export async function readCodexRebaseEpochJournal(
  stateDir: string,
  sessionId: string,
): Promise<CodexRebaseEpochJournalReadResult> {
  let raw: string;
  try {
    raw = await readFile(codexRebaseEpochJournalPath(stateDir, sessionId), "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { entries: [], epochs: [], malformedLineCount: 0 };
    }
    return {
      entries: [],
      epochs: [],
      malformedLineCount: 0,
      readError: error instanceof Error ? error.message : String(error),
    };
  }

  const entries: CodexRebaseEpoch[] = [];
  let malformedLineCount = 0;
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isCodexRebaseEpoch(parsed) && parsed.sessionId === sessionId) entries.push(parsed);
      else malformedLineCount += 1;
    } catch {
      malformedLineCount += 1;
    }
  }
  return {
    entries,
    epochs: collapseLatestEpochs(entries),
    malformedLineCount,
  };
}

export async function appendPendingCodexRebaseEpoch(params: {
  stateDir: string;
  sessionId: string;
  planId: string;
  oldPreviousResponseId: string;
  oldRevision: string;
  epochId?: string;
  accounting?: CodexRebaseAccounting;
  createdAt?: string;
}): Promise<CodexRebaseEpoch> {
  const epochId = params.epochId ?? `epoch-${randomUUID()}`;
  const current = await readCodexRebaseEpochJournal(params.stateDir, params.sessionId);
  throwIfReadFailed(current);
  const existing = latestEpochById(current.entries, epochId);
  if (existing) {
    if (existing.status !== "pending") throw new Error(`Codex rebase epoch already terminal: ${epochId}`);
    if (
      existing.sessionId !== params.sessionId
    || existing.planId !== params.planId
      || existing.oldPreviousResponseId !== params.oldPreviousResponseId
      || existing.oldRevision !== params.oldRevision
    ) {
      throw new Error(`Codex rebase epoch mismatch: ${epochId}`);
    }
    return existing;
  }

  const createdAt = params.createdAt ?? new Date().toISOString();
  if (timestampMs(createdAt) === undefined) throw new Error("Codex rebase epoch requires a valid create time");
  const entry: CodexRebaseEpoch = {
    schema: CODEX_REBASE_EPOCH_SCHEMA,
    epochId,
    sessionId: params.sessionId,
    planId: params.planId,
    oldPreviousResponseId: params.oldPreviousResponseId,
    oldRevision: params.oldRevision,
    status: "pending",
    accounting: params.accounting,
    createdAt,
    updatedAt: createdAt,
  };
  await appendJsonl(codexRebaseEpochJournalPath(params.stateDir, params.sessionId), entry);
  return entry;
}

async function transitionCodexRebaseEpoch(params: {
  stateDir: string;
  sessionId: string;
  epochId: string;
  status: Exclude<CodexRebaseEpochStatus, "pending">;
  newResponseId?: string;
  newRevision?: string;
  failureReason?: string;
  accounting?: CodexRebaseAccounting;
  updatedAt?: string;
}): Promise<CodexRebaseEpoch> {
  const current = await readCodexRebaseEpochJournal(params.stateDir, params.sessionId);
  throwIfReadFailed(current);
  const existing = latestEpochById(current.entries, params.epochId);
  if (!existing) throw new Error(`Unknown Codex rebase epoch: ${params.epochId}`);
  if (existing.status !== "pending") return existing;
  const updatedAt = params.updatedAt ?? new Date().toISOString();
  if (timestampMs(updatedAt) === undefined) throw new Error("Codex rebase epoch requires a valid update time");

  const entry: CodexRebaseEpoch = {
    ...existing,
    status: params.status,
    newResponseId: params.newResponseId,
    newRevision: params.newRevision,
    failureReason: params.failureReason,
    accounting: params.accounting ?? existing.accounting,
    updatedAt,
  };
  await appendJsonl(codexRebaseEpochJournalPath(params.stateDir, params.sessionId), entry);
  return entry;
}

export async function commitCodexRebaseEpoch(params: {
  stateDir: string;
  sessionId: string;
  epochId: string;
  newResponseId: string;
  newRevision?: string;
  accounting?: CodexRebaseAccounting;
  updatedAt?: string;
}): Promise<CodexRebaseEpoch> {
  if (!params.newResponseId) throw new Error("Codex rebase epoch commit requires a response id");
  return transitionCodexRebaseEpoch({
    ...params,
    status: "committed",
  });
}

export async function failCodexRebaseEpoch(params: {
  stateDir: string;
  sessionId: string;
  epochId: string;
  failureReason: string;
  accounting?: CodexRebaseAccounting;
  updatedAt?: string;
}): Promise<CodexRebaseEpoch> {
  return transitionCodexRebaseEpoch({
    ...params,
    status: "failed",
  });
}

export async function rollbackCodexRebaseEpoch(params: {
  stateDir: string;
  sessionId: string;
  epochId: string;
  failureReason: string;
  accounting?: CodexRebaseAccounting;
  updatedAt?: string;
}): Promise<CodexRebaseEpoch> {
  return transitionCodexRebaseEpoch({
    ...params,
    status: "rolled_back",
  });
}

export async function readPendingCodexRebaseEpochs(params: {
  stateDir: string;
  sessionId: string;
}): Promise<CodexRebaseEpoch[]> {
  const journal = await readCodexRebaseEpochJournal(params.stateDir, params.sessionId);
  throwIfReadFailed(journal);
  return journal.epochs.filter((entry) => entry.status === "pending");
}

export async function failPendingCodexRebaseEpochsAfterRestart(params: {
  stateDir: string;
  sessionId: string;
  updatedAt?: string;
}): Promise<CodexRebaseEpoch[]> {
  const pending = await readPendingCodexRebaseEpochs(params);
  const failed: CodexRebaseEpoch[] = [];
  for (const entry of pending) {
    failed.push(await failCodexRebaseEpoch({
      stateDir: params.stateDir,
      sessionId: params.sessionId,
      epochId: entry.epochId,
      failureReason: "process_restarted",
      updatedAt: params.updatedAt,
    }));
  }
  return failed;
}

export async function readLatestCodexRebaseEpoch(params: {
  stateDir: string;
  sessionId: string;
}): Promise<CodexRebaseEpoch | undefined> {
  const journal = await readCodexRebaseEpochJournal(params.stateDir, params.sessionId);
  return latestEpoch(journal.epochs);
}
