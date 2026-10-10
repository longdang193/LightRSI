import type { HostRequestEnvelope } from "@lightrsi/host-adapter";
import type { JsonObject } from "./context-history/types.js";
import { codexForwardingFingerprint, codexWireFingerprint } from "./context-history/replayability.js";
import { dedupeCodexStableDeveloperMessages } from "./stable-prefix.js";
import {
  appendCacheAuditRecord,
  buildCacheAuditSnapshot,
  readRecentCacheAuditRecords,
  readRecentCacheAuditRecordsForSession,
  summarizeCacheAudit,
  type CacheAuditRecord,
  type CacheAuditSnapshot,
  type CacheAuditSummary,
  type CacheFrontierAggregate,
} from "@lightrsi/stabilizer";

export type CodexCacheAuditRecord = CacheAuditRecord;
export type CodexCacheAuditSummary = CacheAuditSummary;

type FrontierHistoryEntry = {
  compatibilityDigest: string;
  attemptId: string;
  items: JsonObject[];
  bytes: number;
};

const frontierHistory = new Map<string, FrontierHistoryEntry>();
const MAX_FRONTIER_ENTRIES = 128;
const MAX_FRONTIER_BYTES = 1_048_576;
let frontierHistoryBytes = 0;

function itemBytes(item: JsonObject): number {
  return Buffer.byteLength(JSON.stringify(item), "utf8");
}

function rememberFrontier(sessionId: string, entry: FrontierHistoryEntry): void {
  const previous = frontierHistory.get(sessionId);
  if (previous) frontierHistoryBytes -= previous.bytes;
  frontierHistory.delete(sessionId);
  frontierHistory.set(sessionId, entry);
  frontierHistoryBytes += entry.bytes;
  while (frontierHistory.size > MAX_FRONTIER_ENTRIES || frontierHistoryBytes > MAX_FRONTIER_BYTES) {
    const oldestSessionId = frontierHistory.keys().next().value;
    if (oldestSessionId === undefined) break;
    const oldest = frontierHistory.get(oldestSessionId);
    frontierHistoryBytes -= oldest?.bytes ?? 0;
    frontierHistory.delete(oldestSessionId);
  }
}

export function buildCodexCacheFrontier(params: {
  sessionId: string;
  attemptId?: string | null;
  compatibilityDigest?: string | null;
  inputItems?: JsonObject[];
  eligible: boolean;
}): CacheFrontierAggregate {
  const compatibilityDigest = params.compatibilityDigest ?? null;
  const inputItems = params.inputItems ?? [];
  const inputBytes = inputItems.reduce((sum, item) => sum + itemBytes(item), 0);
  if (!params.eligible || !compatibilityDigest || !params.attemptId) {
    return {
      status: "unknown",
      compatibilityDigest,
      currentAttemptId: params.attemptId ?? null,
      currentItemCount: inputItems.length,
      currentInputDigest: codexWireFingerprint(inputItems),
      changeClass: "unknown",
    };
  }
  if (inputBytes > MAX_FRONTIER_BYTES) {
    return {
      status: "unknown",
      compatibilityDigest,
      currentAttemptId: params.attemptId,
      currentItemCount: inputItems.length,
      currentInputDigest: codexWireFingerprint(inputItems),
      changeClass: "unknown",
    };
  }
  const previous = frontierHistory.get(params.sessionId);
  if (!previous) {
    rememberFrontier(params.sessionId, {
      compatibilityDigest,
      attemptId: params.attemptId,
      items: structuredClone(inputItems),
      bytes: inputBytes,
    });
    return {
      status: "none",
      compatibilityDigest,
      currentAttemptId: params.attemptId,
      currentItemCount: inputItems.length,
      currentInputDigest: codexWireFingerprint(inputItems),
      changeClass: "none",
    };
  }
  if (previous.compatibilityDigest !== compatibilityDigest) {
    rememberFrontier(params.sessionId, {
      compatibilityDigest,
      attemptId: params.attemptId,
      items: structuredClone(inputItems),
      bytes: inputBytes,
    });
    return {
      status: "unmatched",
      compatibilityDigest,
      previousAttemptId: previous.attemptId,
      currentAttemptId: params.attemptId,
      previousItemCount: previous.items.length,
      currentItemCount: inputItems.length,
      firstChangedIndex: 0,
      appendOnly: false,
      unchangedBytes: 0,
      unchangedChars: 0,
      currentInputDigest: codexForwardingFingerprint(inputItems),
      changeClass: "incompatible",
      componentDrift: ["compatibility"],
    };
  }
  const previousDigests = previous.items.map(codexWireFingerprint);
  const currentDigests = inputItems.map(codexWireFingerprint);
  let firstChangedIndex = 0;
  while (firstChangedIndex < previousDigests.length
    && firstChangedIndex < currentDigests.length
    && previousDigests[firstChangedIndex] === currentDigests[firstChangedIndex]) {
    firstChangedIndex += 1;
  }
  const unchanged = firstChangedIndex === previous.items.length
    && inputItems.length === previous.items.length;
  const appendOnly = firstChangedIndex === previous.items.length
    && inputItems.length > previous.items.length;
  const unchangedBytes = inputItems
    .slice(0, firstChangedIndex)
    .reduce((sum, item) => sum + itemBytes(item), 0);
  const unchangedChars = inputItems
    .slice(0, firstChangedIndex)
    .reduce((sum, item) => sum + JSON.stringify(item).length, 0);
  rememberFrontier(params.sessionId, {
    compatibilityDigest,
    attemptId: params.attemptId,
    items: structuredClone(inputItems),
    bytes: inputBytes,
  });
  return {
    status: "matched",
    compatibilityDigest,
    previousAttemptId: previous.attemptId,
    currentAttemptId: params.attemptId,
    previousItemCount: previous.items.length,
    currentItemCount: inputItems.length,
    firstChangedIndex,
    appendOnly,
    unchangedBytes,
    unchangedChars,
    currentInputDigest: codexWireFingerprint(inputItems),
    changeClass: unchanged ? "none" : appendOnly ? "append" : "mutation",
    componentDrift: unchanged ? [] : appendOnly ? ["history_append"] : ["history"],
  };
}

export async function readRecentCodexCacheAuditRecords(
  stateDir: string,
  limit = 32,
): Promise<CodexCacheAuditRecord[]> {
  return readRecentCacheAuditRecords<CodexCacheAuditRecord>(stateDir, limit);
}

export async function readRecentCodexCacheAuditRecordsForSession(
  stateDir: string,
  sessionId: string,
  limit = 32,
): Promise<CodexCacheAuditRecord[]> {
  return readRecentCacheAuditRecordsForSession<CodexCacheAuditRecord>(stateDir, sessionId, limit);
}

export function summarizeCodexCacheAudit(
  records: CodexCacheAuditRecord[],
): CodexCacheAuditSummary {
  return summarizeCacheAudit(records);
}

export function buildCodexCacheAuditSnapshot(params: {
  envelope: HostRequestEnvelope;
  sessionId: string;
  model: string;
  stream: boolean;
  originalRequestPromptCacheKey?: string | null;
  requestPromptCacheKey?: string | null;
  providerWirePrefixHash?: string | null;
  cacheFamilyId?: string | null;
  frontier?: CacheFrontierAggregate;
}): CacheAuditSnapshot {
  return buildCacheAuditSnapshot({
    ...params,
    envelope: dedupeCodexStableDeveloperMessages(params.envelope),
    ...(params.frontier ? { frontier: params.frontier } : {}),
  });
}

export async function appendCodexCacheAuditRecord(params: {
  stateDir: string;
  snapshot: CacheAuditSnapshot;
  responsePromptCacheKey?: string | null;
  usage?: Record<string, unknown> | null;
  status: number;
  requestSuccess?: boolean;
  attempt?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number | null;
}): Promise<CodexCacheAuditRecord> {
  return appendCacheAuditRecord<CodexCacheAuditRecord>(params);
}
