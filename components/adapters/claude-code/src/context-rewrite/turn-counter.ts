import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonFileAtomic } from "@lightmem2/host-adapter";
import { listRawSemanticTurnSeqs } from "@lightmem2/history";

const TURN_COUNTER_SCHEMA_VERSION = 1 as const;

function sessionDir(stateDir: string, sessionId: string): string {
  return join(stateDir, "claude-context", "sessions", sessionId);
}
function turnCounterPath(stateDir: string, sessionId: string): string {
  return join(sessionDir(stateDir, sessionId), "turn-counter.json");
}

type TurnCounterFile = {
  schemaVersion: typeof TURN_COUNTER_SCHEMA_VERSION;
  storedAt: string;
  sessionId: string;
  turnSeq: number;
  lastRequestFingerprint?: string;
};

export type ClaudeSemanticTurnClaim = {
  turnSeq: number;
  isNewRequest: boolean;
};

const pendingSessionOperations = new Map<string, Promise<void>>();

async function withSessionLock<T>(
  stateDir: string,
  sessionId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = `${stateDir}\u0000${sessionId}`;
  const previous = pendingSessionOperations.get(key) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  pendingSessionOperations.set(key, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release?.();
    if (pendingSessionOperations.get(key) === queued) {
      pendingSessionOperations.delete(key);
    }
  }
}

async function readTurnCounterFile(
  stateDir: string,
  sessionId: string,
): Promise<TurnCounterFile | undefined> {
  try {
    const raw = await readFile(turnCounterPath(stateDir, sessionId), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed
      || typeof parsed !== "object"
      || (parsed as TurnCounterFile).schemaVersion !== TURN_COUNTER_SCHEMA_VERSION
      || typeof (parsed as TurnCounterFile).turnSeq !== "number"
      || !Number.isFinite((parsed as TurnCounterFile).turnSeq)
    ) {
      return undefined;
    }
    return parsed as TurnCounterFile;
  } catch {
    return undefined;
  }
}

async function recoverTurnSeqFromRawRecords(
  stateDir: string,
  sessionId: string,
): Promise<number> {
  const turnSeqs = await listRawSemanticTurnSeqs(stateDir, sessionId);
  return turnSeqs.length > 0 ? turnSeqs[turnSeqs.length - 1]! : 0;
}

/**
 * Read the last persisted turnSeq for a session, or 0 when missing/corrupted
 * (fail-open). turnSeq is a per-session, monotonically increasing real turn
 * number used by the semantic-delta pipeline — never derived from the message
 * array (which is resent whole and rewritten by eviction), so it must be
 * persisted independently.
 */
export async function readClaudeTurnSeq(
  stateDir: string,
  sessionId: string,
): Promise<number> {
  const counter = await readTurnCounterFile(stateDir, sessionId);
  return counter
    ? Math.max(0, Math.floor(counter.turnSeq))
    : recoverTurnSeqFromRawRecords(stateDir, sessionId);
}

/**
 * Claim the semantic turn for one complete Claude request. The fingerprint is
 * based on the complete inbound message array, not only its newest user item,
 * so an HTTP retry reuses the original turn while a later identical user prompt
 * in a different conversation state still receives a new turn.
 */
export async function claimClaudeSemanticTurn(
  stateDir: string,
  sessionId: string,
  requestFingerprint: string,
): Promise<ClaudeSemanticTurnClaim> {
  return withSessionLock(stateDir, sessionId, async () => {
    const current = await readTurnCounterFile(stateDir, sessionId);
    const turnSeq = current
      ? Math.max(0, Math.floor(current.turnSeq))
      : await recoverTurnSeqFromRawRecords(stateDir, sessionId);
    if (current?.lastRequestFingerprint === requestFingerprint) {
      return { turnSeq, isNewRequest: false };
    }
    const next = turnSeq + 1;
    await mkdir(sessionDir(stateDir, sessionId), { recursive: true });
    await writeJsonFileAtomic(turnCounterPath(stateDir, sessionId), {
      schemaVersion: TURN_COUNTER_SCHEMA_VERSION,
      storedAt: new Date().toISOString(),
      sessionId,
      turnSeq: next,
      lastRequestFingerprint: requestFingerprint,
    } satisfies TurnCounterFile);
    return { turnSeq: next, isNewRequest: true };
  });
}

/**
 * Advance the per-session turn counter by one and persist it, returning the new
 * turnSeq. Monotonic: reads the current value (0 if none), increments, writes
 * atomically. On a write error it still returns the incremented value so the
 * caller can proceed for this request; only the durability is best-effort
 * (fail-open — a persistence failure must never break request handling).
 */
export async function bumpClaudeTurnSeq(
  stateDir: string,
  sessionId: string,
): Promise<number> {
  const current = await readClaudeTurnSeq(stateDir, sessionId);
  const next = current + 1;
  try {
    await mkdir(sessionDir(stateDir, sessionId), { recursive: true });
    await writeJsonFileAtomic(turnCounterPath(stateDir, sessionId), {
      schemaVersion: TURN_COUNTER_SCHEMA_VERSION,
      storedAt: new Date().toISOString(),
      sessionId,
      turnSeq: next,
    } satisfies TurnCounterFile);
  } catch {
    // fail-open: persistence errors must not affect request handling
  }
  return next;
}
