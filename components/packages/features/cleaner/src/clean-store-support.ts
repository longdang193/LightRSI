import { createHash } from "node:crypto";
import { mkdir, open, readFile, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  CONTEXT_CLEAN_EXECUTION_CLAIM_SCHEMA_VERSION,
  CONTEXT_CLEAN_SCHEMA_VERSION,
  CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
  type ContextCleanAttributionStatus,
  type ContextCleanDispatchState,
  type ContextCleanExecutionClaim,
  type ContextCleanPlan,
  type ContextCleanPlanRecord,
  type ContextCleanReceipt,
  type ContextCleanStatus,
} from "./contracts.js";

export type ContextCleanStoredReceipt = {
  storeSchemaVersion: typeof CONTEXT_CLEAN_STORE_SCHEMA_VERSION;
  receipt: ContextCleanReceipt;
};

export type ContextCleanStoredExecutionClaim = {
  storeSchemaVersion: typeof CONTEXT_CLEAN_STORE_SCHEMA_VERSION;
  claim: import("./contracts.js").ContextCleanExecutionClaim;
};

export type ContextCleanTransactionIntent = {
  storeSchemaVersion: typeof CONTEXT_CLEAN_STORE_SCHEMA_VERSION;
  planId: string;
  fromStatus: ContextCleanStatus;
  receipt: ContextCleanReceipt;
  createdAt: string;
};

function fileKey(planId: string): string {
  return createHash("sha256").update(planId).digest("hex");
}

export function contextCleanPlanFilePath(stateDir: string, planId: string): string {
  return join(stateDir, "context-cleaner", "plans", `${fileKey(planId)}.json`);
}

export function contextCleanReceiptFilePath(stateDir: string, planId: string): string {
  return join(stateDir, "context-cleaner", "receipts", `${fileKey(planId)}.json`);
}

export function contextCleanTransactionFilePath(stateDir: string, planId: string): string {
  return join(stateDir, "context-cleaner", "transactions", `${fileKey(planId)}.json`);
}

export function contextCleanLockFilePath(stateDir: string, planId: string): string {
  return join(stateDir, "context-cleaner", "locks", `${fileKey(planId)}.lock`);
}

const LOCK_TIMEOUT_MS = 1_000;
const LOCK_RETRY_MS = 10;
const LOCK_STALE_MS = 30 * 60 * 1_000;

export async function withContextCleanStoreLock<T>(params: {
  stateDir: string;
  planId: string;
  action: () => Promise<T>;
}): Promise<T> {
  const path = contextCleanLockFilePath(params.stateDir, params.planId);
  const token = `${process.pid}:${Date.now()}:${Math.random()}`;
  const startedAt = Date.now();
  await mkdir(dirname(path), { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  while (!handle) {
    try {
      handle = await open(path, "wx");
      await handle.writeFile(token, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const info = await stat(path);
        if (Date.now() - info.mtimeMs > LOCK_STALE_MS) await unlink(path);
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code !== "ENOENT") throw statError;
      }
      if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) throw new Error("clean_store_lock_timeout");
      await delay(LOCK_RETRY_MS);
    }
  }
  try {
    return await params.action();
  } finally {
    await handle.close().catch(() => undefined);
    try {
      if (await readFile(path, "utf8") === token) await unlink(path);
    } catch {
      // A missing/replaced lock belongs to recovery or another owner.
    }
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nullableCount(value: unknown): value is number | null {
  return value === null || finiteNonNegative(value);
}

function uniqueStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonBlankString)
    && new Set(value).size === value.length;
}

function optionalUniqueStrings(value: unknown): value is string[] | undefined {
  return value === undefined || uniqueStrings(value);
}

const STATUSES = new Set<ContextCleanStatus>([
  "analyzed", "approved", "scheduled", "applied", "stale", "cancelled", "failed",
]);

const DISPATCH_STATES = new Set<ContextCleanDispatchState>([
  "dispatch_not_started",
  "dispatch_started",
  "host_committed",
  "recovery_required",
]);
const COUNT_MODES = new Set(["exact", "estimated", "chars_only"]);
const ATTRIBUTION_STATUSES = new Set<ContextCleanAttributionStatus>([
  "disabled", "waiting", "failing", "empty", "available",
]);

function parseTask(value: unknown): ContextCleanPlan["tasks"][number] | undefined {
  if (!isRecord(value) || !isNonBlankString(value.taskId)
    || !isNonBlankString(value.label) || !isNonBlankString(value.description)
    || !isNonBlankString(value.summary) || !uniqueStrings(value.itemIds)
    || !isRecord(value.itemDigests) || !nullableCount(value.tokenCount)
    || !finiteNonNegative(value.charCount) || !nullableCount(value.tokenPercent)
    || !uniqueStrings(value.reasonCodes) || typeof value.selectable !== "boolean"
    || !["active", "unresolved", "completed", "aborted", "unknown"].includes(String(value.lifecycleState))
    || !["clean", "keep", "protected"].includes(String(value.recommendation))) return undefined;
  const itemIds = value.itemIds;
  const itemDigests = value.itemDigests;
  if (itemIds.some((id) => !isNonBlankString(itemDigests[id]))) return undefined;
  if (Object.keys(itemDigests).some((id) => !itemIds.includes(id))) return undefined;
  if (value.recallCount !== undefined
    && (!finiteNonNegative(value.recallCount) || !Number.isInteger(value.recallCount))) return undefined;
  return {
    taskId: value.taskId, label: value.label, description: value.description,
    summary: value.summary, lifecycleState: value.lifecycleState as ContextCleanPlan["tasks"][number]["lifecycleState"],
    itemIds: [...itemIds],
    itemDigests: Object.fromEntries(itemIds.map((id) => [id, itemDigests[id] as string])),
    tokenCount: value.tokenCount, charCount: value.charCount, tokenPercent: value.tokenPercent,
    ...(value.recallCount !== undefined ? { recallCount: value.recallCount } : {}),
    recommendation: value.recommendation as ContextCleanPlan["tasks"][number]["recommendation"],
    reasonCodes: [...value.reasonCodes], selectable: value.selectable,
  };
}

export function parseContextCleanPlan(value: unknown): ContextCleanPlan | undefined {
  if (!isRecord(value) || value.schemaVersion !== CONTEXT_CLEAN_SCHEMA_VERSION
    || !isNonBlankString(value.planId) || !isNonBlankString(value.hostId)
    || !isNonBlankString(value.sessionId) || !isNonBlankString(value.baseRevision)
    || !nullableCount(value.usedTokens) || !finiteNonNegative(value.usedChars)
    || !nullableCount(value.protectedTokens) || !finiteNonNegative(value.protectedChars)
    || !nullableCount(value.unassignedTokens) || !finiteNonNegative(value.unassignedChars)
    || !COUNT_MODES.has(String(value.tokenCountMode)) || !isNonBlankString(value.tokenCountMethod)
    || !Array.isArray(value.tasks) || !isIsoTimestamp(value.createdAt)) return undefined;
  if (value.analysisRevision !== undefined && !isNonBlankString(value.analysisRevision)) return undefined;
  if (value.model !== undefined && !isNonBlankString(value.model)) return undefined;
  if (value.contextWindowTokens !== undefined && !finiteNonNegative(value.contextWindowTokens)) return undefined;
  if (value.attributionStatus !== undefined && !ATTRIBUTION_STATUSES.has(value.attributionStatus as ContextCleanAttributionStatus)) return undefined;
  const tasks = value.tasks.map(parseTask);
  if (tasks.some((task) => task === undefined)) return undefined;
  if (new Set(tasks.map((task) => task!.taskId)).size !== tasks.length) return undefined;
  return {
    schemaVersion: CONTEXT_CLEAN_SCHEMA_VERSION, planId: value.planId, hostId: value.hostId,
    sessionId: value.sessionId, baseRevision: value.baseRevision,
    ...(value.analysisRevision !== undefined ? { analysisRevision: value.analysisRevision } : {}),
    ...(value.model !== undefined ? { model: value.model } : {}),
    ...(value.contextWindowTokens !== undefined ? { contextWindowTokens: value.contextWindowTokens } : {}),
    ...(value.attributionStatus !== undefined ? { attributionStatus: value.attributionStatus as ContextCleanAttributionStatus } : {}),
    usedTokens: value.usedTokens, usedChars: value.usedChars,
    protectedTokens: value.protectedTokens, protectedChars: value.protectedChars,
    unassignedTokens: value.unassignedTokens, unassignedChars: value.unassignedChars,
    tokenCountMode: value.tokenCountMode as ContextCleanPlan["tokenCountMode"],
    tokenCountMethod: value.tokenCountMethod, tasks: tasks as ContextCleanPlan["tasks"],
    createdAt: value.createdAt,
  };
}

export function contextCleanExecutionClaimFilePath(stateDir: string, planId: string): string {
  return join(stateDir, "context-cleaner", "claims", `${fileKey(planId)}.json`);
}

export function parseContextCleanExecutionClaim(
  value: unknown,
): ContextCleanExecutionClaim | undefined {
  if (!isRecord(value) || value.schemaVersion !== CONTEXT_CLEAN_EXECUTION_CLAIM_SCHEMA_VERSION
    || !isNonBlankString(value.claimId) || !isNonBlankString(value.planId)
    || !isNonBlankString(value.hostId) || !isNonBlankString(value.sessionId)
    || !uniqueStrings(value.selectedTaskIds) || !isNonBlankString(value.mutationPlanId)
    || !isNonBlankString(value.analysisRevision) || !isNonBlankString(value.executionRevision)
    || !isNonBlankString(value.ownerToken) || !isIsoTimestamp(value.claimedAt)
    || !DISPATCH_STATES.has(value.dispatchState as ContextCleanDispatchState)) return undefined;
  return {
    schemaVersion: CONTEXT_CLEAN_EXECUTION_CLAIM_SCHEMA_VERSION,
    claimId: value.claimId,
    planId: value.planId,
    hostId: value.hostId,
    sessionId: value.sessionId,
    selectedTaskIds: [...value.selectedTaskIds],
    mutationPlanId: value.mutationPlanId,
    analysisRevision: value.analysisRevision,
    executionRevision: value.executionRevision,
    ownerToken: value.ownerToken,
    claimedAt: value.claimedAt,
    dispatchState: value.dispatchState as ContextCleanDispatchState,
  };
}

function parseEvidence(value: unknown, applied: boolean): ContextCleanReceipt["evidence"] | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return undefined;
  for (const field of ["operationIds", "itemIds", "eventIds", "archiveRefs"] as const) {
    if (!optionalUniqueStrings(value[field])) return undefined;
  }
  for (const field of ["claimId", "previousRevision", "nextRevision", "providerResponseId"] as const) {
    if (value[field] !== undefined && !isNonBlankString(value[field])) return undefined;
  }
  if (applied && (!isNonBlankString(value.previousRevision) || !isNonBlankString(value.nextRevision)
    || !uniqueStrings(value.operationIds) || !uniqueStrings(value.itemIds))) return undefined;
  return {
    ...(value.claimId ? { claimId: value.claimId as string } : {}),
    ...(value.previousRevision ? { previousRevision: value.previousRevision as string } : {}),
    ...(value.nextRevision ? { nextRevision: value.nextRevision as string } : {}),
    ...(value.operationIds ? { operationIds: [...value.operationIds as string[]] } : {}),
    ...(value.itemIds ? { itemIds: [...value.itemIds as string[]] } : {}),
    ...(value.eventIds ? { eventIds: [...value.eventIds as string[]] } : {}),
    ...(value.archiveRefs ? { archiveRefs: [...value.archiveRefs as string[]] } : {}),
    ...(value.providerResponseId ? { providerResponseId: value.providerResponseId as string } : {}),
  };
}

export function parseContextCleanReceipt(value: unknown): ContextCleanReceipt | undefined {
  if (!isRecord(value) || value.schemaVersion !== CONTEXT_CLEAN_SCHEMA_VERSION
    || !isNonBlankString(value.planId) || !isNonBlankString(value.hostId)
    || !isNonBlankString(value.sessionId) || !STATUSES.has(value.status as ContextCleanStatus)
    || !uniqueStrings(value.selectedTaskIds) || !nullableCount(value.estimatedSavedTokens)
    || !finiteNonNegative(value.estimatedSavedChars) || !COUNT_MODES.has(String(value.tokenCountMode))
    || !uniqueStrings(value.deferredTaskIds) || !uniqueStrings(value.reasons)
    || typeof value.fallbackUsed !== "boolean" || !isIsoTimestamp(value.updatedAt)) return undefined;
  const status = value.status as ContextCleanStatus;
  const applied = status === "applied";
  const hasAppliedTokens = Object.hasOwn(value, "appliedSavedTokens");
  const hasAppliedChars = Object.hasOwn(value, "appliedSavedChars");
  if (applied) {
    if (!hasAppliedTokens || !hasAppliedChars || !nullableCount(value.appliedSavedTokens)
      || !finiteNonNegative(value.appliedSavedChars) || value.fallbackUsed) return undefined;
  } else if (hasAppliedTokens || hasAppliedChars) return undefined;
  const evidence = parseEvidence(value.evidence, applied);
  if (value.evidence !== undefined && evidence === undefined) return undefined;
  if (applied && evidence === undefined) return undefined;
  const base = {
    schemaVersion: CONTEXT_CLEAN_SCHEMA_VERSION, planId: value.planId, hostId: value.hostId,
    sessionId: value.sessionId, status, selectedTaskIds: [...value.selectedTaskIds],
    estimatedSavedTokens: value.estimatedSavedTokens, estimatedSavedChars: value.estimatedSavedChars,
    tokenCountMode: value.tokenCountMode as ContextCleanReceipt["tokenCountMode"],
    deferredTaskIds: [...value.deferredTaskIds], fallbackUsed: value.fallbackUsed,
    reasons: [...value.reasons], updatedAt: value.updatedAt, ...(evidence ? { evidence } : {}),
  };
  return applied
    ? { ...base, status: "applied", fallbackUsed: false, appliedSavedTokens: value.appliedSavedTokens as number | null,
        appliedSavedChars: value.appliedSavedChars as number, evidence: evidence! as Extract<ContextCleanReceipt, {status:"applied"}>["evidence"] }
    : base as ContextCleanReceipt;
}

export function parseContextCleanPlanRecord(value: unknown): ContextCleanPlanRecord | undefined {
  if (!isRecord(value) || value.storeSchemaVersion !== CONTEXT_CLEAN_STORE_SCHEMA_VERSION
    || !STATUSES.has(value.status as ContextCleanStatus) || !isIsoTimestamp(value.updatedAt)) return undefined;
  const plan = parseContextCleanPlan(value.plan);
  return plan ? { storeSchemaVersion: CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
    status: value.status as ContextCleanStatus, plan, updatedAt: value.updatedAt } : undefined;
}

export function parseContextCleanStoredReceipt(value: unknown): ContextCleanStoredReceipt | undefined {
  if (!isRecord(value) || value.storeSchemaVersion !== CONTEXT_CLEAN_STORE_SCHEMA_VERSION) return undefined;
  const receipt = parseContextCleanReceipt(value.receipt);
  return receipt ? { storeSchemaVersion: CONTEXT_CLEAN_STORE_SCHEMA_VERSION, receipt } : undefined;
}

export function parseContextCleanStoredExecutionClaim(
  value: unknown,
): ContextCleanStoredExecutionClaim | undefined {
  if (!isRecord(value) || value.storeSchemaVersion !== CONTEXT_CLEAN_STORE_SCHEMA_VERSION) return undefined;
  const claim = parseContextCleanExecutionClaim(value.claim);
  return claim ? { storeSchemaVersion: CONTEXT_CLEAN_STORE_SCHEMA_VERSION, claim } : undefined;
}

export async function readStoredJson(path: string): Promise<
  { kind: "ok"; value: unknown } | { kind: "missing" } | { kind: "unreadable" }
> {
  try { return { kind: "ok", value: JSON.parse(await readFile(path, "utf8")) as unknown }; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT"
    ? { kind: "missing" } : { kind: "unreadable" }; }
}

export function sameCanonicalValue(left: unknown, right: unknown): boolean {
  const canonicalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!isRecord(value)) return value;
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  };
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}
