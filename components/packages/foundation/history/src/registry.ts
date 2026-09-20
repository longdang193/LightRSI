import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  ProcessedTurnRange,
  SessionTaskRegistry,
  SessionTaskRegistryPatch,
  TaskLifecycle,
  TaskState,
} from "./types.js";

function normalizeProcessedTurnRanges(
  ranges: ProcessedTurnRange[] | undefined,
): ProcessedTurnRange[] {
  const sorted = (ranges ?? [])
    .filter((range) => Number.isInteger(range.fromTurnSeqInclusive)
      && Number.isInteger(range.toTurnSeqInclusive)
      && range.fromTurnSeqInclusive > 0
      && range.toTurnSeqInclusive >= range.fromTurnSeqInclusive)
    .map((range) => ({
      fromTurnSeqInclusive: range.fromTurnSeqInclusive,
      toTurnSeqInclusive: range.toTurnSeqInclusive,
    }))
    .sort((left, right) => left.fromTurnSeqInclusive - right.fromTurnSeqInclusive);
  const merged: ProcessedTurnRange[] = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (!previous || range.fromTurnSeqInclusive > previous.toTurnSeqInclusive + 1) {
      merged.push(range);
      continue;
    }
    previous.toTurnSeqInclusive = Math.max(previous.toTurnSeqInclusive, range.toTurnSeqInclusive);
  }
  return merged;
}

export function turnSeqFromAbsId(turnAbsId: string): number | undefined {
  const parsed = Number.parseInt(turnAbsId.split(":t").at(-1) ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function sortTurnAbsIds(turnAbsIds: Iterable<string>): string[] {
  const unique = [...new Set([...turnAbsIds].map((value) => value.trim()).filter(Boolean))];
  return unique.sort((left, right) => {
    const leftSeq = turnSeqFromAbsId(left);
    const rightSeq = turnSeqFromAbsId(right);
    if (leftSeq === undefined || rightSeq === undefined) return 0;
    return leftSeq - rightSeq || left.localeCompare(right);
  });
}

export function turnSeqsToRanges(turnSeqs: Iterable<number>): ProcessedTurnRange[] {
  const sorted = [...new Set(turnSeqs)]
    .filter((turnSeq) => Number.isInteger(turnSeq) && turnSeq > 0)
    .sort((left, right) => left - right);
  const ranges: ProcessedTurnRange[] = [];
  for (const turnSeq of sorted) {
    const previous = ranges.at(-1);
    if (!previous || turnSeq > previous.toTurnSeqInclusive + 1) {
      ranges.push({ fromTurnSeqInclusive: turnSeq, toTurnSeqInclusive: turnSeq });
    } else {
      previous.toTurnSeqInclusive = turnSeq;
    }
  }
  return ranges;
}

export function processedTurnRanges(registry: SessionTaskRegistry): ProcessedTurnRange[] {
  const ranges = normalizeProcessedTurnRanges(registry.processedTurnRanges);
  if (ranges.length > 0 || registry.lastProcessedTurnSeq <= 0) return ranges;
  return [{ fromTurnSeqInclusive: 1, toTurnSeqInclusive: registry.lastProcessedTurnSeq }];
}

export function processedTurnWatermark(registry: SessionTaskRegistry): number {
  return highestContiguousProcessedTurnSeq(processedTurnRanges(registry));
}

export function taskIdsByLifecycle(
  tasks: Record<string, TaskState>,
  lifecycle: TaskLifecycle,
): string[] {
  return Object.values(tasks)
    .filter((task) => task.lifecycle === lifecycle)
    .map((task) => task.taskId);
}

export function mergeProcessedTurnRanges(
  registry: SessionTaskRegistry,
  additions: ProcessedTurnRange[],
): ProcessedTurnRange[] {
  return normalizeProcessedTurnRanges([
    ...processedTurnRanges(registry),
    ...additions,
  ]);
}

export function highestContiguousProcessedTurnSeq(
  ranges: ProcessedTurnRange[],
): number {
  let next = 1;
  for (const range of normalizeProcessedTurnRanges(ranges)) {
    if (range.fromTurnSeqInclusive > next) break;
    next = Math.max(next, range.toTurnSeqInclusive + 1);
  }
  return next - 1;
}

function dedupeOrdered(values: string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function cloneTask(task: TaskState): TaskState {
  return {
    ...task,
    ...(typeof task.evictableReason === "string" && task.evictableReason.trim().length > 0
      ? { evictableReason: task.evictableReason }
      : {}),
    completionEvidence: [...task.completionEvidence],
    unresolvedQuestions: [...task.unresolvedQuestions],
    ...(task.decisionProvenance
      ? {
          decisionProvenance: {
            ...task.decisionProvenance,
            evidenceRefs: [...task.decisionProvenance.evidenceRefs],
            invalidationConditions: [...task.decisionProvenance.invalidationConditions],
          },
        }
      : {}),
    span: {
      ...task.span,
      supportingTurnAbsIds: [...task.span.supportingTurnAbsIds],
    },
  };
}

function cloneRelationMap(map: Record<string, string[]>): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(map)) {
    next[key] = [...values];
  }
  return next;
}

function mergeRelationMap(
  current: Record<string, string[]>,
  patch: Record<string, string[]> | undefined,
): Record<string, string[]> {
  if (!patch) return cloneRelationMap(current);
  const next = cloneRelationMap(current);
  for (const [key, values] of Object.entries(patch)) {
    const normalized = dedupeOrdered(values) ?? [];
    if (normalized.length === 0) {
      delete next[key];
      continue;
    }
    next[key] = normalized;
  }
  return next;
}

function safeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRegistryJson(raw: string): SessionTaskRegistry {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    throw new Error("registry file must contain a JSON object");
  }
  const sessionId = typeof parsed.sessionId === "string" ? parsed.sessionId : "";
  if (!sessionId) {
    throw new Error("registry file missing sessionId");
  }
  const registry = createEmptySessionTaskRegistry(sessionId);
  const parsedRanges = Array.isArray(parsed.processedTurnRanges)
    ? parsed.processedTurnRanges as ProcessedTurnRange[]
    : [];
  const legacyRange = typeof parsed.lastProcessedTurnSeq === "number" && parsed.lastProcessedTurnSeq > 0
    ? [{ fromTurnSeqInclusive: 1, toTurnSeqInclusive: parsed.lastProcessedTurnSeq }]
    : [];
  const processedRanges = normalizeProcessedTurnRanges(
    parsedRanges.length > 0 ? parsedRanges : legacyRange,
  );
  return {
    ...registry,
    ...parsed,
    sessionId,
    version: typeof parsed.version === "number" ? parsed.version : 0,
    tasks: isRecord(parsed.tasks) ? (parsed.tasks as Record<string, TaskState>) : {},
    activeTaskIds: Array.isArray(parsed.activeTaskIds) ? parsed.activeTaskIds.filter((v): v is string => typeof v === "string") : [],
    completedTaskIds: Array.isArray(parsed.completedTaskIds) ? parsed.completedTaskIds.filter((v): v is string => typeof v === "string") : [],
    evictableTaskIds: Array.isArray(parsed.evictableTaskIds) ? parsed.evictableTaskIds.filter((v): v is string => typeof v === "string") : [],
    taskToBlockIds: isRecord(parsed.taskToBlockIds) ? (parsed.taskToBlockIds as Record<string, string[]>) : {},
    blockToTaskIds: isRecord(parsed.blockToTaskIds) ? (parsed.blockToTaskIds as Record<string, string[]>) : {},
    turnToTaskIds: isRecord(parsed.turnToTaskIds) ? (parsed.turnToTaskIds as Record<string, string[]>) : {},
    processedTurnRanges: processedRanges,
    lastProcessedTurnSeq: highestContiguousProcessedTurnSeq(processedRanges),
  };
}

export class SessionTaskRegistryVersionMismatchError extends Error {
  readonly expectedVersion: number;
  readonly actualVersion: number;

  constructor(expectedVersion: number, actualVersion: number) {
    super(`session task registry version mismatch: expected ${expectedVersion}, got ${actualVersion}`);
    this.name = "SessionTaskRegistryVersionMismatchError";
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export type PersistSessionTaskRegistryOptions = {
  expectedVersion?: number;
};

export function sessionTaskRegistryPath(stateDir: string, sessionId: string): string {
  return join(stateDir, "task-state", safeSessionId(sessionId), "registry.json");
}

function sessionTaskRegistryPathCandidates(stateDir: string, sessionId: string): string[] {
  const safeId = safeSessionId(sessionId);
  const trimmed = stateDir.trim();
  return [join(trimmed, "task-state", safeId, "registry.json")];
}

function sessionTaskRegistryWriteTargets(stateDir: string, sessionId: string): string[] {
  return sessionTaskRegistryPathCandidates(stateDir, sessionId);
}

export function createEmptySessionTaskRegistry(sessionId: string): SessionTaskRegistry {
  return {
    sessionId,
    version: 0,
    tasks: {},
    activeTaskIds: [],
    completedTaskIds: [],
    evictableTaskIds: [],
    taskToBlockIds: {},
    blockToTaskIds: {},
    turnToTaskIds: {},
    processedTurnRanges: [],
    lastProcessedTurnSeq: 0,
    attributionSubmissions: {},
  };
}

export function cloneSessionTaskRegistry(registry: SessionTaskRegistry): SessionTaskRegistry {
  const tasks: Record<string, TaskState> = {};
  for (const [taskId, task] of Object.entries(registry.tasks)) {
    tasks[taskId] = cloneTask(task);
  }
  return {
    sessionId: registry.sessionId,
    version: registry.version,
    tasks,
    activeTaskIds: [...registry.activeTaskIds],
    completedTaskIds: [...registry.completedTaskIds],
    evictableTaskIds: [...registry.evictableTaskIds],
    taskToBlockIds: cloneRelationMap(registry.taskToBlockIds),
    blockToTaskIds: cloneRelationMap(registry.blockToTaskIds),
    turnToTaskIds: cloneRelationMap(registry.turnToTaskIds),
    processedTurnRanges: processedTurnRanges(registry),
    lastProcessedTurnSeq: processedTurnWatermark(registry),
    attributionSubmissions: Object.fromEntries(
      Object.entries(registry.attributionSubmissions ?? {}).map(([submissionId, record]) => [
        submissionId,
        { ...record, taskIds: [...record.taskIds] },
      ]),
    ),
  };
}

export function applySessionTaskRegistryPatch(
  registry: SessionTaskRegistry,
  patch: SessionTaskRegistryPatch,
): SessionTaskRegistry {
  const next = cloneSessionTaskRegistry(registry);

  if (patch.upsertTasks) {
    for (const [taskId, task] of Object.entries(patch.upsertTasks)) {
      next.tasks[taskId] = cloneTask(task);
    }
  }

  if (patch.removeTaskIds) {
    for (const taskId of patch.removeTaskIds) {
      delete next.tasks[taskId];
      delete next.taskToBlockIds[taskId];
    }
  }

  if (patch.activeTaskIds) {
    next.activeTaskIds = dedupeOrdered(patch.activeTaskIds) ?? [];
  }
  if (patch.completedTaskIds) {
    next.completedTaskIds = dedupeOrdered(patch.completedTaskIds) ?? [];
  }
  if (patch.evictableTaskIds) {
    next.evictableTaskIds = dedupeOrdered(patch.evictableTaskIds) ?? [];
  }

  next.taskToBlockIds = mergeRelationMap(next.taskToBlockIds, patch.upsertTaskToBlockIds);
  next.blockToTaskIds = mergeRelationMap(next.blockToTaskIds, patch.upsertBlockToTaskIds);
  next.turnToTaskIds = mergeRelationMap(next.turnToTaskIds, patch.upsertTurnToTaskIds);

  if (patch.processedTurnRanges) {
    next.processedTurnRanges = normalizeProcessedTurnRanges(patch.processedTurnRanges);
  } else if (typeof patch.lastProcessedTurnSeq === "number" && (next.processedTurnRanges?.length ?? 0) === 0
    && patch.lastProcessedTurnSeq > 0) {
    next.processedTurnRanges = [{
      fromTurnSeqInclusive: 1,
      toTurnSeqInclusive: patch.lastProcessedTurnSeq,
    }];
  }
  next.lastProcessedTurnSeq = highestContiguousProcessedTurnSeq(
    normalizeProcessedTurnRanges(next.processedTurnRanges ?? []),
  );
  if (patch.attributionSubmissions) {
    next.attributionSubmissions = {
      ...(next.attributionSubmissions ?? {}),
      ...Object.fromEntries(
        Object.entries(patch.attributionSubmissions).map(([submissionId, record]) => [
          submissionId,
          { ...record, taskIds: [...record.taskIds] },
        ]),
      ),
    };
  }

  next.version += 1;
  return next;
}

export async function loadSessionTaskRegistry(
  stateDir: string,
  sessionId: string,
): Promise<SessionTaskRegistry> {
  for (const path of sessionTaskRegistryPathCandidates(stateDir, sessionId)) {
    try {
      const raw = await readFile(path, "utf8");
      return parseRegistryJson(raw);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
  return createEmptySessionTaskRegistry(sessionId);
}

export async function persistSessionTaskRegistry(
  stateDir: string,
  registry: SessionTaskRegistry,
  options: PersistSessionTaskRegistryOptions = {},
): Promise<string> {
  const path = sessionTaskRegistryPath(stateDir, registry.sessionId);
  if (typeof options.expectedVersion === "number") {
    const current = await loadSessionTaskRegistry(stateDir, registry.sessionId);
    if (current.version !== options.expectedVersion) {
      throw new SessionTaskRegistryVersionMismatchError(options.expectedVersion, current.version);
    }
  }
  for (const targetPath of sessionTaskRegistryWriteTargets(stateDir, registry.sessionId)) {
    await mkdir(dirname(targetPath), { recursive: true });
    const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tempPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
    await rename(tempPath, targetPath);
  }
  return path;
}
