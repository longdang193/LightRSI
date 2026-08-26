import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { appendJsonl } from "@lightrsi/host-adapter";

import {
  acquireCodexRebaseSessionLock,
  codexRebaseEpochJournalPath,
} from "../context-rewrite/rebase-epoch.js";

export const CODEX_CLEANER_SCHEDULE_SCHEMA = "lightrsi.codex.cleaner-schedule/v1" as const;

type CodexCleanerScheduleIdentity = {
  schema: typeof CODEX_CLEANER_SCHEDULE_SCHEMA;
  hostId: "codex";
  sessionId: string;
  cleanPlanId: string;
  baseRevision: string;
  selectedTaskIds: string[];
  scheduledAt: string;
  updatedAt: string;
};

export type CodexCleanerScheduledRecord = CodexCleanerScheduleIdentity & {
  status: "scheduled";
};

/** Adapter-local commit marker. This is not a shared Cleaner applied receipt. */
export type CodexCleanerCommittedRecord = CodexCleanerScheduleIdentity & {
  status: "committed";
  mutationPlanId: string;
  epochId: string;
};

export type CodexCleanerTerminalRecord = CodexCleanerScheduleIdentity & {
  status: "terminal";
  receiptStatus: "stale" | "cancelled" | "failed";
  reasons: string[];
};

export type CodexCleanerScheduleRecord =
  | CodexCleanerScheduledRecord
  | CodexCleanerCommittedRecord
  | CodexCleanerTerminalRecord;

export type CodexCleanerScheduleReadResult =
  | { outcome: "missing"; reasons: [] }
  | { outcome: "ready"; record: CodexCleanerScheduledRecord; reasons: [] }
  | { outcome: "committed"; record: CodexCleanerCommittedRecord; reasons: [] }
  | { outcome: "terminal"; record: CodexCleanerTerminalRecord; reasons: [] }
  | { outcome: "bypassed"; reasons: string[] };

export type CodexCleanerScheduleWriteResult = {
  outcome: "stored" | "transitioned" | "unchanged" | "missing" | "conflict" | "bypassed";
  record?: CodexCleanerScheduleRecord;
  reasons: string[];
};

type CodexCleanerScheduleJournal = {
  entries: CodexCleanerScheduleRecord[];
  records: CodexCleanerScheduleRecord[];
  malformedLineCount: number;
  readError?: string;
};

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    && typeof error.code === "string"
    ? error.code
    : undefined;
}

function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function nonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueNonBlankStrings(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every(nonBlankString)
    && new Set(value).size === value.length;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function sameIdentity(
  left: CodexCleanerScheduleIdentity,
  right: CodexCleanerScheduleIdentity,
): boolean {
  return left.hostId === right.hostId
    && left.sessionId === right.sessionId
    && left.cleanPlanId === right.cleanPlanId
    && left.baseRevision === right.baseRevision
    && left.scheduledAt === right.scheduledAt
    && sameStringSet(left.selectedTaskIds, right.selectedTaskIds);
}

function canonicalRecord(value: unknown): CodexCleanerScheduleRecord | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record.schema !== CODEX_CLEANER_SCHEDULE_SCHEMA
    || record.hostId !== "codex"
    || !nonBlankString(record.sessionId)
    || !nonBlankString(record.cleanPlanId)
    || !nonBlankString(record.baseRevision)
    || !uniqueNonBlankStrings(record.selectedTaskIds)
    || !canonicalTimestamp(record.scheduledAt)
    || !canonicalTimestamp(record.updatedAt)) {
    return undefined;
  }
  const identity: CodexCleanerScheduleIdentity = {
    schema: CODEX_CLEANER_SCHEDULE_SCHEMA,
    hostId: "codex",
    sessionId: record.sessionId,
    cleanPlanId: record.cleanPlanId,
    baseRevision: record.baseRevision,
    selectedTaskIds: [...record.selectedTaskIds],
    scheduledAt: record.scheduledAt,
    updatedAt: record.updatedAt,
  };
  if (record.status === "scheduled") {
    return { ...identity, status: "scheduled" };
  }
  if (record.status === "committed"
    && nonBlankString(record.mutationPlanId)
    && nonBlankString(record.epochId)) {
    return {
      ...identity,
      status: "committed",
      mutationPlanId: record.mutationPlanId,
      epochId: record.epochId,
    };
  }
  if (record.status === "terminal"
    && (record.receiptStatus === "stale"
      || record.receiptStatus === "cancelled"
      || record.receiptStatus === "failed")
    && uniqueNonBlankStrings(record.reasons)) {
    return {
      ...identity,
      status: "terminal",
      receiptStatus: record.receiptStatus,
      reasons: [...record.reasons],
    };
  }
  return undefined;
}

function validTransition(
  previous: CodexCleanerScheduleRecord | undefined,
  next: CodexCleanerScheduleRecord,
): boolean {
  if (!previous) return next.status === "scheduled";
  if (!sameIdentity(previous, next)) return false;
  if (previous.status === "scheduled") return true;
  return JSON.stringify(previous) === JSON.stringify(next);
}

function collapseLatest(
  entries: readonly CodexCleanerScheduleRecord[],
): CodexCleanerScheduleRecord[] {
  const latest = new Map<string, CodexCleanerScheduleRecord>();
  for (const entry of entries) {
    latest.delete(entry.cleanPlanId);
    latest.set(entry.cleanPlanId, entry);
  }
  return [...latest.values()];
}

export function codexCleanerScheduleJournalPath(
  stateDir: string,
  sessionId: string,
): string {
  return join(
    dirname(codexRebaseEpochJournalPath(stateDir, sessionId)),
    "cleaner-schedule.jsonl",
  );
}

async function readScheduleJournal(
  stateDir: string,
  sessionId: string,
): Promise<CodexCleanerScheduleJournal> {
  let raw: string;
  try {
    raw = await readFile(codexCleanerScheduleJournalPath(stateDir, sessionId), "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { entries: [], records: [], malformedLineCount: 0 };
    }
    return {
      entries: [],
      records: [],
      malformedLineCount: 0,
      readError: error instanceof Error ? error.message : String(error),
    };
  }

  const entries: CodexCleanerScheduleRecord[] = [];
  const latestByPlanId = new Map<string, CodexCleanerScheduleRecord>();
  let malformedLineCount = 0;
  for (const line of raw.split(/\r?\n/u).filter(Boolean)) {
    try {
      const entry = canonicalRecord(JSON.parse(line) as unknown);
      const previous = entry ? latestByPlanId.get(entry.cleanPlanId) : undefined;
      if (!entry
        || entry.sessionId !== sessionId
        || !validTransition(previous, entry)) {
        malformedLineCount += 1;
        continue;
      }
      entries.push(entry);
      latestByPlanId.set(entry.cleanPlanId, entry);
    } catch {
      malformedLineCount += 1;
    }
  }
  return {
    entries,
    records: collapseLatest(entries),
    malformedLineCount,
  };
}

function journalFailureReasons(
  journal: CodexCleanerScheduleJournal,
): string[] | undefined {
  if (journal.readError) {
    return ["cleaner_schedule_journal_unavailable"];
  }
  if (journal.malformedLineCount > 0) {
    return ["cleaner_schedule_journal_malformed"];
  }
  return undefined;
}

export async function readCodexCleanerSchedule(params: {
  stateDir: string;
  sessionId: string;
}): Promise<CodexCleanerScheduleReadResult> {
  if (!params.stateDir.trim() || !params.sessionId.trim()) {
    return { outcome: "bypassed", reasons: ["cleaner_schedule_request_invalid"] };
  }
  const journal = await readScheduleJournal(params.stateDir, params.sessionId);
  const failureReasons = journalFailureReasons(journal);
  if (failureReasons) return { outcome: "bypassed", reasons: failureReasons };
  const scheduled = journal.records.filter(
    (record): record is CodexCleanerScheduledRecord => record.status === "scheduled",
  );
  if (scheduled.length > 1) {
    return { outcome: "bypassed", reasons: ["cleaner_schedule_pending_conflict"] };
  }
  if (scheduled[0]) return { outcome: "ready", record: scheduled[0], reasons: [] };
  const latest = journal.records.at(-1);
  if (!latest) return { outcome: "missing", reasons: [] };
  if (latest.status === "committed") {
    return { outcome: "committed", record: latest, reasons: [] };
  }
  if (latest.status === "terminal") {
    return { outcome: "terminal", record: latest, reasons: [] };
  }
  return { outcome: "bypassed", reasons: ["cleaner_schedule_pending_conflict"] };
}

function validScheduleParams(params: {
  stateDir: string;
  sessionId: string;
  cleanPlanId: string;
  baseRevision: string;
  selectedTaskIds: string[];
  scheduledAt: string;
}): boolean {
  return nonBlankString(params.stateDir)
    && nonBlankString(params.sessionId)
    && nonBlankString(params.cleanPlanId)
    && nonBlankString(params.baseRevision)
    && uniqueNonBlankStrings(params.selectedTaskIds)
    && canonicalTimestamp(params.scheduledAt);
}

export async function scheduleCodexCleanerPlan(params: {
  stateDir: string;
  sessionId: string;
  cleanPlanId: string;
  baseRevision: string;
  selectedTaskIds: string[];
  scheduledAt?: string;
}): Promise<CodexCleanerScheduleWriteResult> {
  const scheduledAt = params.scheduledAt ?? new Date().toISOString();
  const normalized = { ...params, scheduledAt };
  if (!validScheduleParams(normalized)) {
    return { outcome: "bypassed", reasons: ["cleaner_schedule_request_invalid"] };
  }
  const record: CodexCleanerScheduledRecord = {
    schema: CODEX_CLEANER_SCHEDULE_SCHEMA,
    hostId: "codex",
    sessionId: params.sessionId,
    cleanPlanId: params.cleanPlanId,
    baseRevision: params.baseRevision,
    selectedTaskIds: [...params.selectedTaskIds],
    status: "scheduled",
    scheduledAt,
    updatedAt: scheduledAt,
  };

  const lock = await acquireCodexRebaseSessionLock({
    stateDir: params.stateDir,
    sessionId: params.sessionId,
  });
  if (!lock) {
    return { outcome: "bypassed", reasons: ["cleaner_schedule_lock_busy"] };
  }
  try {
    const journal = await readScheduleJournal(params.stateDir, params.sessionId);
    const failureReasons = journalFailureReasons(journal);
    if (failureReasons) return { outcome: "bypassed", reasons: failureReasons };
    const existing = journal.records.find(
      (entry) => entry.cleanPlanId === params.cleanPlanId,
    );
    if (existing) {
      if (existing.status === "scheduled" && sameIdentity(existing, record)) {
        return { outcome: "unchanged", record: existing, reasons: [] };
      }
      return {
        outcome: "conflict",
        record: existing,
        reasons: ["cleaner_schedule_identity_conflict"],
      };
    }
    if (journal.records.some((entry) => entry.status === "scheduled")) {
      return { outcome: "conflict", reasons: ["cleaner_schedule_pending_conflict"] };
    }
    await appendJsonl(codexCleanerScheduleJournalPath(params.stateDir, params.sessionId), record);
    return { outcome: "stored", record, reasons: [] };
  } finally {
    await lock.release();
  }
}

async function transitionSchedule(params: {
  stateDir: string;
  sessionId: string;
  cleanPlanId: string;
  updatedAt: string;
  build(previous: CodexCleanerScheduledRecord): CodexCleanerScheduleRecord;
  matchesExisting(existing: CodexCleanerScheduleRecord): boolean;
}): Promise<CodexCleanerScheduleWriteResult> {
  if (!nonBlankString(params.stateDir)
    || !nonBlankString(params.sessionId)
    || !nonBlankString(params.cleanPlanId)
    || !canonicalTimestamp(params.updatedAt)) {
    return { outcome: "bypassed", reasons: ["cleaner_schedule_request_invalid"] };
  }
  const lock = await acquireCodexRebaseSessionLock({
    stateDir: params.stateDir,
    sessionId: params.sessionId,
  });
  if (!lock) return { outcome: "bypassed", reasons: ["cleaner_schedule_lock_busy"] };
  try {
    const journal = await readScheduleJournal(params.stateDir, params.sessionId);
    const failureReasons = journalFailureReasons(journal);
    if (failureReasons) return { outcome: "bypassed", reasons: failureReasons };
    const existing = journal.records.find(
      (record) => record.cleanPlanId === params.cleanPlanId,
    );
    if (!existing) return { outcome: "missing", reasons: ["cleaner_schedule_missing"] };
    if (existing.status !== "scheduled") {
      return params.matchesExisting(existing)
        ? { outcome: "unchanged", record: existing, reasons: [] }
        : {
            outcome: "conflict",
            record: existing,
            reasons: ["cleaner_schedule_terminal_conflict"],
          };
    }
    const next = params.build(existing);
    const canonical = canonicalRecord(next);
    if (!canonical || !validTransition(existing, canonical)) {
      return { outcome: "bypassed", reasons: ["cleaner_schedule_transition_invalid"] };
    }
    await appendJsonl(
      codexCleanerScheduleJournalPath(params.stateDir, params.sessionId),
      canonical,
    );
    return { outcome: "transitioned", record: canonical, reasons: [] };
  } finally {
    await lock.release();
  }
}

export async function appendCodexCleanerCommitted(params: {
  stateDir: string;
  sessionId: string;
  cleanPlanId: string;
  mutationPlanId: string;
  epochId: string;
  updatedAt?: string;
}): Promise<CodexCleanerScheduleWriteResult> {
  if (!nonBlankString(params.mutationPlanId) || !nonBlankString(params.epochId)) {
    return { outcome: "bypassed", reasons: ["cleaner_schedule_request_invalid"] };
  }
  const updatedAt = params.updatedAt ?? new Date().toISOString();
  return transitionSchedule({
    ...params,
    updatedAt,
    build(previous) {
      return {
        ...previous,
        status: "committed",
        mutationPlanId: params.mutationPlanId,
        epochId: params.epochId,
        updatedAt,
      };
    },
    matchesExisting(existing) {
      return existing.status === "committed"
        && existing.mutationPlanId === params.mutationPlanId
        && existing.epochId === params.epochId;
    },
  });
}

export async function appendCodexCleanerTerminal(params: {
  stateDir: string;
  sessionId: string;
  cleanPlanId: string;
  receiptStatus: "stale" | "cancelled" | "failed";
  reasons: string[];
  updatedAt?: string;
}): Promise<CodexCleanerScheduleWriteResult> {
  if (!uniqueNonBlankStrings(params.reasons)) {
    return { outcome: "bypassed", reasons: ["cleaner_schedule_request_invalid"] };
  }
  const updatedAt = params.updatedAt ?? new Date().toISOString();
  return transitionSchedule({
    ...params,
    updatedAt,
    build(previous) {
      return {
        ...previous,
        status: "terminal",
        receiptStatus: params.receiptStatus,
        reasons: [...params.reasons],
        updatedAt,
      };
    },
    matchesExisting(existing) {
      return existing.status === "terminal"
        && existing.receiptStatus === params.receiptStatus
        && sameStrings(existing.reasons, params.reasons);
    },
  });
}
