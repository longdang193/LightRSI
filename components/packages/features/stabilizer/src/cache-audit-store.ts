import { createHash } from "node:crypto";
import { mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  appendJsonl,
  readCachedInputTokens,
  readCacheWriteTokens,
  readInputTokens,
  readRecentJsonlEntries,
} from "@lightmem2/host-adapter";
import {
  extractStablePrefixContract,
  fingerprintStablePrefixEnvelope,
  serializeStablePrefixContract,
} from "./stable-prefix-contract.js";
import {
  auditStablePrefixEntropy,
  diffStablePrefixSerialized,
} from "./stable-prefix-audit.js";
import type { StabilizerRequestEnvelope } from "./contracts.js";

export type CacheAuditBaselineKind = "identity" | "request_key" | "session" | "none";

export const DEFAULT_CACHE_AUDIT_ROTATE_BYTES = 32 * 1024 * 1024;

const auditFileLocks = new Map<string, Promise<void>>();

async function withAuditFileLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const previous = auditFileLocks.get(path) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  auditFileLocks.set(path, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (auditFileLocks.get(path) === current) auditFileLocks.delete(path);
  }
}

export async function rotateCacheAuditFileIfNeeded(
  path: string,
  maxBytes = DEFAULT_CACHE_AUDIT_ROTATE_BYTES,
): Promise<string | null> {
  try {
    if ((await stat(path)).size < maxBytes) return null;
    const rotatedPath = `${path}.${Date.now()}.jsonl`;
    await rename(path, rotatedPath);
    return rotatedPath;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function compactStablePrefix(stablePrefix: ReturnType<typeof serializeStablePrefixContract>) {
  const compact = (segments: typeof stablePrefix.stableCore) => segments.map((segment) => {
    const text = String(segment.text ?? "");
    const existingTextLength = (segment as typeof segment & { textLength?: number }).textLength;
    const isCompact = text.startsWith("sha256:") && typeof existingTextLength === "number";
    return {
      key: segment.key,
      role: segment.role,
      source: segment.source,
      text: isCompact ? text : `sha256:${createHash("sha256").update(text).digest("hex")}`,
      textLength: isCompact ? existingTextLength : text.length,
    };
  });
  return {
    schemaVersion: stablePrefix.schemaVersion,
    stableCore: compact(stablePrefix.stableCore),
    semiStableContext: compact(stablePrefix.semiStableContext),
  };
}

function compactUsage(usage: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!usage) return null;
  const compacted: Record<string, unknown> = {
    input_tokens: readInputTokens(usage),
    cached_input_tokens: readCachedInputTokens(usage),
    cache_write_tokens: readCacheWriteTokens(usage),
  };
  const outputTokens = usage.output_tokens;
  if (typeof outputTokens === "number" && Number.isFinite(outputTokens)) {
    compacted.output_tokens = outputTokens;
  }
  return compacted;
}
export type CacheAuditRecord = {
  at: string;
  sessionId: string;
  model: string;
  stream: boolean;
  stablePrefixFingerprint: string;
  stablePrefix: ReturnType<typeof serializeStablePrefixContract>;
  entropyFindings: ReturnType<typeof auditStablePrefixEntropy>;
  driftReasons: ReturnType<typeof diffStablePrefixSerialized>;
  originalRequestPromptCacheKey: string | null;
  requestPromptCacheKey: string | null;
  responsePromptCacheKey: string | null;
  cachedInputTokens: number;
  inputTokens: number;
  cacheWriteTokens: number;
  providerWirePrefixHash?: string;
  cacheFamilyId?: string;
  usage: Record<string, unknown> | null;
  status: number;
  baselineKind?: CacheAuditBaselineKind;
};

export type CacheAuditSnapshot = Omit<
  CacheAuditRecord,
  | "at"
  | "responsePromptCacheKey"
  | "cachedInputTokens"
  | "inputTokens"
  | "cacheWriteTokens"
  | "usage"
  | "status"
>;

export type CacheAuditSummary = {
  totalRecords: number;
  /**
   * Warm-cache identity is requestPromptCacheKey + stablePrefixFingerprint when available,
   * otherwise sessionId + stablePrefixFingerprint.
   * responsePromptCacheKey is intentionally excluded because some providers rewrite it.
   */
  warmCandidates: number;
  warmHits: number;
  warmMisses: number;
  hitRatePercent: number;
  familyWarmCandidates: number;
  familyWarmHits: number;
  familyWarmMisses: number;
  familyHitRatePercent: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  cachedInputTokenRatioPercent: number;
  latestSessionId?: string;
  latestFingerprint?: string;
  topEntropyKinds: Array<{ key: string; count: number }>;
  topDriftKeys: Array<{ key: string; count: number }>;
  /**
   * Compatibility signal only: upstream accepted the request but returned a different
   * responsePromptCacheKey. This does not affect warm-hit classification.
   */
  responsePromptCacheKeyRewriteCount: number;
  /**
   * Back-compat alias for responsePromptCacheKeyRewriteCount.
   * Keep until all downstream surfaces stop reading the old name.
   */
  promptCacheKeyMismatchCount: number;
};

function cacheAuditPath(stateDir: string): string {
  return join(stateDir, "cache-audit.jsonl");
}

function cacheAuditSessionPath(stateDir: string, sessionId: string): string {
  return join(stateDir, "cache-audit-sessions", `${encodeURIComponent(sessionId)}.jsonl`);
}

function isCacheAuditRecord(value: unknown): value is CacheAuditRecord {
  return Boolean(
    value
    && typeof value === "object"
    && typeof (value as Record<string, unknown>).sessionId === "string"
    && typeof (value as Record<string, unknown>).stablePrefixFingerprint === "string",
  );
}

function cacheIdentity(record: {
  sessionId: string;
  stablePrefixFingerprint: string;
  requestPromptCacheKey: string | null;
}): string | null {
  const fingerprint = record.stablePrefixFingerprint.trim();
  if (!fingerprint) return null;
  const requestPromptCacheKey = record.requestPromptCacheKey?.trim();
  if (requestPromptCacheKey) {
    return `prompt_cache_key:${requestPromptCacheKey}::fingerprint:${fingerprint}`;
  }
  const sessionId = record.sessionId.trim();
  if (sessionId) {
    return `session:${sessionId}::fingerprint:${fingerprint}`;
  }
  return null;
}

function cacheFamilyIdentity(record: {
  cacheFamilyId?: string;
  providerWirePrefixHash?: string;
}): string | null {
  const familyId = record.cacheFamilyId?.trim();
  if (familyId) return `family:${familyId}`;
  const wirePrefixHash = record.providerWirePrefixHash?.trim();
  return wirePrefixHash ? `wire:${wirePrefixHash}` : null;
}

function countWarmReuse(
  records: CacheAuditRecord[],
  identityFor: (record: CacheAuditRecord) => string | null,
): { candidates: number; hits: number; misses: number } {
  const seen = new Set<string>();
  let candidates = 0;
  let hits = 0;
  let misses = 0;
  for (const record of records) {
    const identity = identityFor(record);
    if (identity && seen.has(identity)) {
      candidates += 1;
      if (record.cachedInputTokens > 0) hits += 1;
      else misses += 1;
    }
    if (identity) seen.add(identity);
  }
  return { candidates, hits, misses };
}

function topCounts(counts: Map<string, number>, limit = 5): Array<{ key: string; count: number }> {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

export async function readRecentCacheAuditRecords<T extends CacheAuditRecord>(
  stateDir: string,
  limit = 32,
): Promise<T[]> {
  return readRecentJsonlEntries<T>(
    cacheAuditPath(stateDir),
    limit,
    (value): value is T => isCacheAuditRecord(value),
  );
}

export async function readRecentCacheAuditRecordsForSession<T extends CacheAuditRecord>(
  stateDir: string,
  sessionId: string,
  limit = 32,
): Promise<T[]> {
  const target = String(sessionId ?? "").trim();
  if (!target) return [];
  const sessionRecords = await readRecentJsonlEntries<T>(
    cacheAuditSessionPath(stateDir, target),
    Math.max(1, limit),
    (value): value is T => isCacheAuditRecord(value),
  );
  if (sessionRecords.length > 0) return sessionRecords;
  const records = await readRecentJsonlEntries<T>(
    cacheAuditPath(stateDir),
    Number.MAX_SAFE_INTEGER,
    (value): value is T => isCacheAuditRecord(value),
  );
  return records.filter((record) => record.sessionId === target).slice(0, Math.max(1, limit));
}

export function summarizeCacheAudit<T extends CacheAuditRecord>(
  records: T[],
): CacheAuditSummary {
  const ordered = records.slice().reverse();
  const identityReuse = countWarmReuse(ordered, cacheIdentity);
  const familyReuse = countWarmReuse(ordered, cacheFamilyIdentity);
  let promptCacheKeyMismatchCount = 0;
  const entropyCounts = new Map<string, number>();
  const driftCounts = new Map<string, number>();

  for (const record of ordered) {
    if (
      record.requestPromptCacheKey
      && record.responsePromptCacheKey
      && record.requestPromptCacheKey !== record.responsePromptCacheKey
    ) {
      promptCacheKeyMismatchCount += 1;
    }
    for (const finding of record.entropyFindings ?? []) {
      entropyCounts.set(finding.kind, (entropyCounts.get(finding.kind) ?? 0) + 1);
    }
    for (const reason of record.driftReasons ?? []) {
      driftCounts.set(reason.key, (driftCounts.get(reason.key) ?? 0) + 1);
    }
  }

  const identityDenominator = identityReuse.hits + identityReuse.misses;
  const familyDenominator = familyReuse.hits + familyReuse.misses;
  const inputTokens = ordered.reduce((sum, record) => sum + Math.max(0, record.inputTokens ?? 0), 0);
  const cachedInputTokens = ordered.reduce((sum, record) => sum + Math.max(0, record.cachedInputTokens ?? 0), 0);
  const cacheWriteTokens = ordered.reduce((sum, record) => sum + Math.max(0, record.cacheWriteTokens ?? 0), 0);
  const latest = ordered[ordered.length - 1];
  return {
    totalRecords: ordered.length,
    warmCandidates: identityReuse.candidates,
    warmHits: identityReuse.hits,
    warmMisses: identityReuse.misses,
    hitRatePercent: identityDenominator > 0
      ? Math.round((identityReuse.hits / identityDenominator) * 1000) / 10
      : 0,
    familyWarmCandidates: familyReuse.candidates,
    familyWarmHits: familyReuse.hits,
    familyWarmMisses: familyReuse.misses,
    familyHitRatePercent: familyDenominator > 0
      ? Math.round((familyReuse.hits / familyDenominator) * 1000) / 10
      : 0,
    inputTokens,
    cachedInputTokens,
    cacheWriteTokens,
    cachedInputTokenRatioPercent: inputTokens > 0
      ? Math.round((cachedInputTokens / inputTokens) * 1000) / 10
      : 0,
    latestSessionId: latest?.sessionId,
    latestFingerprint: latest?.stablePrefixFingerprint,
    topEntropyKinds: topCounts(entropyCounts),
    topDriftKeys: topCounts(driftCounts),
    responsePromptCacheKeyRewriteCount: promptCacheKeyMismatchCount,
    promptCacheKeyMismatchCount,
  };
}

export function buildCacheAuditSnapshot(params: {
  envelope: StabilizerRequestEnvelope;
  sessionId: string;
  model: string;
  stream: boolean;
  originalRequestPromptCacheKey?: string | null;
  requestPromptCacheKey?: string | null;
  providerWirePrefixHash?: string | null;
  cacheFamilyId?: string | null;
}): CacheAuditSnapshot {
  const stablePrefixContract = extractStablePrefixContract(params.envelope);
  const serialized = serializeStablePrefixContract(stablePrefixContract);
  return {
    sessionId: params.sessionId,
    model: params.model,
    stream: params.stream,
    stablePrefixFingerprint: fingerprintStablePrefixEnvelope(params.envelope),
    stablePrefix: serialized,
    providerWirePrefixHash: typeof params.providerWirePrefixHash === "string"
      ? params.providerWirePrefixHash
      : undefined,
    cacheFamilyId: typeof params.cacheFamilyId === "string"
      ? params.cacheFamilyId
      : undefined,
    entropyFindings: auditStablePrefixEntropy(serialized),
    driftReasons: [],
    originalRequestPromptCacheKey:
      typeof params.originalRequestPromptCacheKey === "string" && params.originalRequestPromptCacheKey.trim()
        ? params.originalRequestPromptCacheKey
        : null,
    requestPromptCacheKey: typeof params.requestPromptCacheKey === "string" && params.requestPromptCacheKey.trim()
      ? params.requestPromptCacheKey
      : null,
  };
}

export async function appendCacheAuditRecord<T extends CacheAuditRecord>(params: {
  stateDir: string;
  snapshot: CacheAuditSnapshot;
  responsePromptCacheKey?: string | null;
  usage?: Record<string, unknown> | null;
  status: number;
}): Promise<T> {
  await mkdir(params.stateDir, { recursive: true });
  const previousEntries = await readRecentCacheAuditRecordsForSession<T>(
    params.stateDir,
    params.snapshot.sessionId,
    32,
  );
  const identity = cacheIdentity(params.snapshot);
  const previousByIdentity = previousEntries.find((entry) => {
    if (!identity) return false;
    return cacheIdentity(entry) === identity;
  });
  const normalizedRequestPromptCacheKey = params.snapshot.requestPromptCacheKey?.trim() || "";
  const previousByRequestPromptCacheKey = normalizedRequestPromptCacheKey
    ? previousEntries.find((entry) => entry.requestPromptCacheKey?.trim() === normalizedRequestPromptCacheKey)
    : undefined;
  const previousBySession = previousEntries.find((entry) => entry.sessionId === params.snapshot.sessionId);
  const previous = previousByIdentity
    ?? previousByRequestPromptCacheKey
    ?? (normalizedRequestPromptCacheKey ? undefined : previousBySession);
  const compactedStablePrefix = compactStablePrefix(params.snapshot.stablePrefix);
  const baselineKind: CacheAuditBaselineKind =
    previousByIdentity
      ? "identity"
      : previousByRequestPromptCacheKey
        ? "request_key"
        : previous
          ? "session"
          : "none";
  const record = {
    at: new Date().toISOString(),
    ...params.snapshot,
    stablePrefix: compactedStablePrefix,
    driftReasons: previous
      ? diffStablePrefixSerialized(compactStablePrefix(previous.stablePrefix), compactedStablePrefix)
      : [],
    responsePromptCacheKey:
      typeof params.responsePromptCacheKey === "string" && params.responsePromptCacheKey.trim()
        ? params.responsePromptCacheKey
        : null,
    cachedInputTokens: readCachedInputTokens(params.usage),
    inputTokens: readInputTokens(params.usage),
    cacheWriteTokens: readCacheWriteTokens(params.usage),
    usage: compactUsage(params.usage),
    status: params.status,
    baselineKind,
  } satisfies CacheAuditRecord;
  const auditPath = cacheAuditPath(params.stateDir);
  const sessionPath = cacheAuditSessionPath(params.stateDir, params.snapshot.sessionId);
  await Promise.all([
    withAuditFileLock(auditPath, async () => {
      await rotateCacheAuditFileIfNeeded(auditPath);
      await appendJsonl(auditPath, record);
    }),
    withAuditFileLock(sessionPath, () => appendJsonl(sessionPath, record)),
  ]);
  return record as unknown as T;
}
