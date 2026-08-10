import { readFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonFileAtomic } from "@lightmem2/host-adapter";

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
};

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
      return 0;
    }
    return Math.max(0, Math.floor((parsed as TurnCounterFile).turnSeq));
  } catch {
    return 0;
  }
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
