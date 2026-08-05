import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";

import {
  codexContextHistoryJournalPath,
  readCodexContextHistoryJournal,
} from "./journal-store.js";

type CodexContextHistoryJournalLockOwner = {
  token: string;
  pid: number;
  hostname: string;
  createdAt: string;
};

export type CodexContextHistoryJournalLock = {
  lockPath: string;
  release(): Promise<void>;
};

const DEFAULT_LOCK_STALE_MS = 30 * 60 * 1000;
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;
const DEFAULT_LOCK_RETRY_MS = 10;
const LOCK_REMOVE_MAX_RETRIES = 5;
const LOCK_REMOVE_RETRY_MS = 20;

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function isTransientWindowsLockError(error: unknown): boolean {
  if (process.platform !== "win32") return false;
  const code = errorCode(error);
  return code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function removeLockPath(path: string): Promise<void> {
  await rm(path, {
    recursive: true,
    force: true,
    maxRetries: LOCK_REMOVE_MAX_RETRIES,
    retryDelay: LOCK_REMOVE_RETRY_MS,
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (errorCode(error) === "ENOENT") return false;
    throw error;
  }
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

function asLockOwner(value: unknown): CodexContextHistoryJournalLockOwner | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const owner = value as Record<string, unknown>;
  return typeof owner.token === "string" && owner.token.length > 0
    && typeof owner.pid === "number" && Number.isInteger(owner.pid) && owner.pid > 0
    && typeof owner.hostname === "string" && owner.hostname.length > 0
    && timestampMs(owner.createdAt) !== undefined
    ? owner as CodexContextHistoryJournalLockOwner
    : undefined;
}

async function readLockOwner(lockPath: string): Promise<CodexContextHistoryJournalLockOwner | undefined> {
  for (let attempt = 0; attempt <= LOCK_REMOVE_MAX_RETRIES; attempt += 1) {
    try {
      return asLockOwner(JSON.parse(await readFile(lockPath, "utf8")) as unknown);
    } catch (error) {
      if (isTransientWindowsLockError(error) && attempt < LOCK_REMOVE_MAX_RETRIES) {
        await wait(LOCK_REMOVE_RETRY_MS);
        continue;
      }
      return undefined;
    }
  }
  return undefined;
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
  } catch (error) {
    // The owner may have released the lock between our failed exclusive open
    // and this stat. Treat a missing path as contention and retry creation;
    // claiming it as stale could rename a replacement lock created meanwhile.
    if (errorCode(error) === "ENOENT") return false;
    if (isTransientWindowsLockError(error)) return false;
    throw error;
  }
}

export function codexContextHistoryJournalLockPath(stateDir: string, sessionId: string): string {
  return `${codexContextHistoryJournalPath(stateDir, sessionId)}.lock`;
}

async function tryAcquireJournalLock(params: {
  stateDir: string;
  sessionId: string;
  staleAfterMs: number;
}): Promise<CodexContextHistoryJournalLock | undefined> {
  const lockPath = codexContextHistoryJournalLockPath(params.stateDir, params.sessionId);
  const recoveryPath = `${lockPath}.recovery`;
  await mkdir(dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (await pathExists(recoveryPath)) return undefined;
    let lockHandle: Awaited<ReturnType<typeof open>>;
    try {
      lockHandle = await open(lockPath, "wx");
    } catch (error) {
      if (isTransientWindowsLockError(error)) return undefined;
      if (errorCode(error) !== "EEXIST") throw error;
      if (await pathExists(recoveryPath)) return undefined;
      if (!await lockIsStale({
        lockPath,
        staleAfterMs: params.staleAfterMs,
        nowMs: Date.now(),
      })) return undefined;

      let recoveryHandle: Awaited<ReturnType<typeof open>>;
      try {
        recoveryHandle = await open(recoveryPath, "wx");
      } catch (recoveryError) {
        if (isTransientWindowsLockError(recoveryError)
          || errorCode(recoveryError) === "EEXIST") return undefined;
        throw recoveryError;
      }
      try {
        await recoveryHandle.writeFile(randomUUID(), "utf8");
        await recoveryHandle.sync();
      } finally {
        await recoveryHandle.close();
      }

      const claimedStaleLockPath = `${lockPath}.stale-${randomUUID()}`;
      try {
        if (await lockIsStale({
          lockPath,
          staleAfterMs: params.staleAfterMs,
          nowMs: Date.now(),
        })) {
          try {
            await rename(lockPath, claimedStaleLockPath);
            await removeLockPath(claimedStaleLockPath);
          } catch (claimError) {
            if (!isTransientWindowsLockError(claimError)) {
              const claimErrorCode = errorCode(claimError);
              if (claimErrorCode !== "ENOENT" && claimErrorCode !== "EEXIST") {
                throw claimError;
              }
            }
          }
        }
      } finally {
        await removeLockPath(recoveryPath);
      }
      continue;
    }

    const owner: CodexContextHistoryJournalLockOwner = {
      token: randomUUID(),
      pid: process.pid,
      hostname: hostname(),
      createdAt: new Date().toISOString(),
    };
    try {
      await lockHandle.writeFile(JSON.stringify(owner), "utf8");
      await lockHandle.sync();
    } catch (error) {
      const failedLockPath = `${lockPath}.failed-${owner.token}`;
      try {
        await rename(lockPath, failedLockPath);
        await removeLockPath(failedLockPath);
      } catch {
        // A missing or replaced path is no longer this failed acquisition's lock.
      }
      throw error;
    } finally {
      await lockHandle.close();
    }

    return {
      lockPath,
      async release() {
        try {
          const current = await readLockOwner(lockPath);
          if (current?.token === owner.token) {
            const releasedLockPath = `${lockPath}.released-${owner.token}`;
            await rename(lockPath, releasedLockPath);
            await removeLockPath(releasedLockPath);
          }
        } catch {
          // Leaving a stale lock is safer than deleting a lock whose owner may have changed.
        }
      },
    };
  }
  return undefined;
}

export async function acquireCodexContextHistoryJournalLock(params: {
  stateDir: string;
  sessionId: string;
  staleAfterMs?: number;
  timeoutMs?: number;
  retryMs?: number;
}): Promise<CodexContextHistoryJournalLock> {
  const staleAfterMs = Math.max(1_000, params.staleAfterMs ?? DEFAULT_LOCK_STALE_MS);
  const timeoutMs = Math.max(0, params.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS);
  const retryMs = Math.max(1, params.retryMs ?? DEFAULT_LOCK_RETRY_MS);
  const deadline = Date.now() + timeoutMs;

  do {
    const lock = await tryAcquireJournalLock({
      stateDir: params.stateDir,
      sessionId: params.sessionId,
      staleAfterMs,
    });
    if (lock) return lock;
    if (Date.now() >= deadline) break;
    await wait(Math.min(retryMs, Math.max(1, deadline - Date.now())));
  } while (true);

  throw new Error(`Timed out acquiring Codex context-history journal lock for session ${params.sessionId}`);
}

export async function withCodexContextHistoryJournalLock<T>(params: {
  stateDir: string;
  sessionId: string;
}, action: () => Promise<T>): Promise<T> {
  const lock = await acquireCodexContextHistoryJournalLock(params);
  try {
    return await action();
  } finally {
    await lock.release();
  }
}

export async function appendCodexContextHistoryJournalEntryLocked(
  stateDir: string,
  sessionId: string,
  payload: unknown,
): Promise<void> {
  const path = codexContextHistoryJournalPath(stateDir, sessionId);
  await mkdir(dirname(path), { recursive: true });
  const current = await readCodexContextHistoryJournal(stateDir, sessionId);
  if (current.readError || current.malformedLineCount > 0) {
    throw new Error(`Refusing to append to invalid Codex context-history journal for session ${sessionId}`);
  }
  const handle = await open(path, "a");
  try {
    await handle.appendFile(`${JSON.stringify(payload)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function appendCodexContextHistoryJournalEntry(
  stateDir: string,
  sessionId: string,
  payload: unknown,
): Promise<void> {
  await withCodexContextHistoryJournalLock({ stateDir, sessionId }, async () => {
    await appendCodexContextHistoryJournalEntryLocked(stateDir, sessionId, payload);
  });
}
