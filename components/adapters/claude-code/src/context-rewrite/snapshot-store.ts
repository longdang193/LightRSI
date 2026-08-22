import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  writeJsonFileAtomic,
  type ContextItemKind,
  type ModelContextSnapshot,
} from "@lightrsi/host-adapter";

const SNAPSHOT_STORE_SCHEMA_VERSION = 1 as const;
const CLAUDE_HOST_ID = "claude-code";

function sessionDir(stateDir: string, sessionId: string): string {
  const digest = createHash("sha256").update(sessionId).digest("hex");
  return join(stateDir, "claude-context", "sessions", `session-${digest}`);
}

function legacySessionDir(stateDir: string, sessionId: string): string | undefined {
  if (!sessionId
    || sessionId === "."
    || sessionId === ".."
    || isAbsolute(sessionId)
    || sessionId.includes("/")
    || sessionId.includes("\\")) return undefined;
  const sessionsRoot = resolve(stateDir, "claude-context", "sessions");
  const candidate = resolve(sessionsRoot, sessionId);
  const relativePath = relative(sessionsRoot, candidate);
  if (!relativePath
    || relativePath === ".."
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)) return undefined;
  return candidate;
}

function latestSnapshotPath(stateDir: string, sessionId: string): string {
  return join(sessionDir(stateDir, sessionId), "latest-snapshot.json");
}
function itemFingerprintsPath(stateDir: string, sessionId: string): string {
  return join(sessionDir(stateDir, sessionId), "item-fingerprints.json");
}

export type StoredClaudeSnapshotFile = {
  schemaVersion: typeof SNAPSHOT_STORE_SCHEMA_VERSION;
  storedAt: string;
  snapshot: ModelContextSnapshot;
  model?: string;
};

type ItemFingerprintsFile = {
  schemaVersion: typeof SNAPSHOT_STORE_SCHEMA_VERSION;
  storedAt: string;
  revision: string;
  fingerprints: Record<string, string>;
};

export type ClaudeSnapshotSaveResult =
  | { saved: true }
  | { saved: false; reason: "invalid_snapshot" | "write_failed" };

const CONTEXT_ITEM_KINDS = new Set<ContextItemKind>([
  "system",
  "developer",
  "user",
  "assistant",
  "reasoning",
  "tool_call",
  "tool_result",
  "compaction",
  "unknown",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function validTaskIds(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value)) return false;
  const normalized = value.map((taskId) => (
    typeof taskId === "string" ? taskId.trim() : ""
  ));
  return normalized.every(Boolean) && new Set(normalized).size === normalized.length;
}

function validSnapshot(value: unknown, sessionId: string): value is ModelContextSnapshot {
  if (!sessionId.trim()
    || !isRecord(value)
    || value.schemaVersion !== MODEL_CONTEXT_REWRITE_SCHEMA_VERSION
    || value.hostId !== CLAUDE_HOST_ID
    || value.sessionId !== sessionId
    || typeof value.revision !== "string"
    || !value.revision.trim()
    || Object.prototype.hasOwnProperty.call(value, "adapterMetadata")
    || !Array.isArray(value.items)) return false;

  const stableIds = new Set<string>();
  for (const item of value.items) {
    if (!isRecord(item)
      || typeof item.stableId !== "string"
      || !item.stableId.trim()
      || stableIds.has(item.stableId)
      || !CONTEXT_ITEM_KINDS.has(item.kind as ContextItemKind)
      || !isOptionalString(item.role)
      || !isOptionalString(item.callId)
      || !isOptionalString(item.responseId)
      || !validTaskIds(item.taskIds)
      || typeof item.fingerprint !== "string"
      || !item.fingerprint.trim()
      || !Number.isSafeInteger(item.chars)
      || Number(item.chars) < 0) return false;
    stableIds.add(item.stableId);
  }
  return true;
}

function validStoredSnapshot(
  value: unknown,
  sessionId: string,
): value is StoredClaudeSnapshotFile {
  return isRecord(value)
    && value.schemaVersion === SNAPSHOT_STORE_SCHEMA_VERSION
    && canonicalTimestamp(value.storedAt)
    && validSnapshot(value.snapshot, sessionId)
    && (value.model === undefined
      || (typeof value.model === "string" && Boolean(value.model.trim())));
}

function validFingerprintsFile(
  value: unknown,
  snapshotRecord: StoredClaudeSnapshotFile,
): value is ItemFingerprintsFile {
  if (!isRecord(value)
    || value.schemaVersion !== SNAPSHOT_STORE_SCHEMA_VERSION
    || !canonicalTimestamp(value.storedAt)
    || value.storedAt !== snapshotRecord.storedAt
    || value.revision !== snapshotRecord.snapshot.revision
    || !isRecord(value.fingerprints)) return false;

  const expected = new Map(
    snapshotRecord.snapshot.items.map((item) => [item.stableId, item.fingerprint] as const),
  );
  const entries = Object.entries(value.fingerprints);
  return entries.length === expected.size
    && entries.every(([stableId, fingerprint]) => (
      typeof fingerprint === "string"
      && Boolean(fingerprint.trim())
      && expected.get(stableId) === fingerprint
    ));
}

async function readStoredFile(
  stateDir: string,
  sessionId: string,
  filename: "latest-snapshot.json" | "item-fingerprints.json",
): Promise<string> {
  try {
    return await readFile(join(sessionDir(stateDir, sessionId), filename), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const legacyDirectory = legacySessionDir(stateDir, sessionId);
    if (!legacyDirectory) throw error;
    return readFile(join(legacyDirectory, filename), "utf8");
  }
}

/**
 * Persist the latest complete snapshot for a session, overwriting any previous
 * one (we keep only the latest, never accumulate duplicate history — CLA-01).
 * Also writes an item-fingerprints map so the overlay can prove item identity
 * across restarts without re-reading the whole snapshot. Fails open: a write
 * error never throws, so it cannot break request handling.
 */
export async function saveLatestClaudeSnapshot(
  stateDir: string,
  sessionId: string,
  snapshot: ModelContextSnapshot,
  metadata?: { model?: string },
): Promise<ClaudeSnapshotSaveResult> {
  if (!validSnapshot(snapshot, sessionId)
    || (metadata?.model !== undefined
      && (typeof metadata.model !== "string" || !metadata.model.trim()))) {
    return { saved: false, reason: "invalid_snapshot" };
  }
  try {
    await mkdir(sessionDir(stateDir, sessionId), { recursive: true });
    const storedAt = new Date().toISOString();
    const fingerprints: Record<string, string> = {};
    for (const item of snapshot.items) {
      fingerprints[item.stableId] = item.fingerprint;
    }
    // Write the sidecar first and the snapshot last. The snapshot is the commit
    // point; readers reject a sidecar that does not match its stored revision.
    await writeJsonFileAtomic(itemFingerprintsPath(stateDir, sessionId), {
      schemaVersion: SNAPSHOT_STORE_SCHEMA_VERSION,
      storedAt,
      revision: snapshot.revision,
      fingerprints,
    } satisfies ItemFingerprintsFile);
    await writeJsonFileAtomic(latestSnapshotPath(stateDir, sessionId), {
      schemaVersion: SNAPSHOT_STORE_SCHEMA_VERSION,
      storedAt,
      snapshot,
      ...(metadata?.model ? { model: metadata.model } : {}),
    } satisfies StoredClaudeSnapshotFile);
    return { saved: true };
  } catch {
    return { saved: false, reason: "write_failed" };
  }
}

/**
 * Read back the latest persisted snapshot for a session, or undefined when it
 * is missing or corrupted (fail-open).
 */
export async function readLatestClaudeSnapshot(
  stateDir: string,
  sessionId: string,
): Promise<ModelContextSnapshot | undefined> {
  return (await readLatestClaudeSnapshotRecord(stateDir, sessionId))?.snapshot;
}

export async function readLatestClaudeSnapshotRecord(
  stateDir: string,
  sessionId: string,
): Promise<StoredClaudeSnapshotFile | undefined> {
  try {
    const parsed = JSON.parse(await readStoredFile(
      stateDir,
      sessionId,
      "latest-snapshot.json",
    )) as unknown;
    return validStoredSnapshot(parsed, sessionId) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read the persisted item-fingerprints map for a session, or an empty map when
 * missing or corrupted (fail-open).
 */
export async function readClaudeItemFingerprints(
  stateDir: string,
  sessionId: string,
): Promise<Record<string, string>> {
  try {
    const [raw, snapshotRecord] = await Promise.all([
      readStoredFile(stateDir, sessionId, "item-fingerprints.json"),
      readLatestClaudeSnapshotRecord(stateDir, sessionId),
    ]);
    if (!snapshotRecord) return {};
    const parsed = JSON.parse(raw) as unknown;
    return validFingerprintsFile(parsed, snapshotRecord)
      ? { ...parsed.fingerprints }
      : {};
  } catch {
    return {};
  }
}
