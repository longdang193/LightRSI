import type { ContextSegment } from "@lightrsi/kernel";
import type { DeepReadonly } from "./types.js";

type ReadonlyContextSegment = DeepReadonly<ContextSegment>;

export type ReadState = "fresh" | "superseded" | "stale";
export type ReadStateReason = "later_read" | "later_mutation" | "none";

export type ReadStateClassification = {
  segmentId: string;
  dataKey: string;
  readKey: string;
  state: ReadState;
  reason: ReadStateReason;
  triggeringIndex?: number;
};

type ReadEvent = {
  kind: "read";
  segmentId: string;
  index: number;
  dataKey: string;
  readKey: string;
};

type FileEvent =
  | {
      kind: "read";
      index: number;
      dataKey: string;
      readKey: string;
      segmentId: string;
    }
  | {
      kind: "mutate";
      index: number;
      dataKey: string;
    };

const MUTATING_TOOL_NAMES = new Set([
  "write",
  "edit",
  "apply_patch",
  "file_write",
  "file_edit",
  "str_replace",
  "replace",
]);

const asObject = (value: unknown): Record<string, unknown> | undefined =>
  !value || typeof value !== "object" || Array.isArray(value) ? undefined : value as Record<string, unknown>;

export const normalizeToolName = (metadata: Record<string, unknown> | undefined): string | undefined => {
  const toolPayload = asObject(metadata?.toolPayload);
  const directToolName = typeof metadata?.toolName === "string" ? metadata.toolName : undefined;
  const payloadToolName =
    typeof toolPayload?.toolName === "string" ? (toolPayload.toolName as string) : undefined;
  const raw = directToolName ?? payloadToolName;
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
};

export const extractDataKey = (metadata: Record<string, unknown> | undefined): string | undefined => {
  const toolPayload = asObject(metadata?.toolPayload);
  const candidates = [
    metadata?.path,
    metadata?.file_path,
    metadata?.filePath,
    toolPayload?.path,
    toolPayload?.file_path,
    toolPayload?.filePath,
  ];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    return trimmed;
  }
  return undefined;
};

type ReadWindow = {
  offset?: number;
  limit?: number;
};

const extractReadWindow = (metadata: Record<string, unknown> | undefined): ReadWindow | undefined => {
  const toolPayload = asObject(metadata?.toolPayload);
  const candidate =
    asObject(metadata?.readWindow)
    ?? asObject(toolPayload?.readWindow);
  if (!candidate) return undefined;
  const offset =
    typeof candidate.offset === "number" && Number.isFinite(candidate.offset) && candidate.offset >= 0
      ? Math.floor(candidate.offset)
      : undefined;
  const limit =
    typeof candidate.limit === "number" && Number.isFinite(candidate.limit) && candidate.limit > 0
      ? Math.floor(candidate.limit)
      : undefined;
  if (offset == null && limit == null) return undefined;
  return { offset, limit };
};

const buildReadKey = (dataKey: string, window: ReadWindow | undefined): string => {
  const offset = window?.offset;
  const limit = window?.limit;
  if (offset == null && limit == null) return `${dataKey}#full`;
  return `${dataKey}#offset=${offset ?? "?"}:limit=${limit ?? "?"}`;
};

export const isReadOutputSegment = (segment: ContextSegment | ReadonlyContextSegment): boolean => {
  const meta = asObject(segment.metadata);
  const toolName = normalizeToolName(meta);
  if (toolName !== "read" && toolName !== "file_read") return false;

  const fieldName =
    typeof meta?.fieldName === "string" ? meta.fieldName.trim().toLowerCase() : undefined;
  if (fieldName === "arguments") return false;
  if (fieldName === "output" || fieldName === "result" || fieldName === "content") return true;

  const segmentId = segment.id.trim().toLowerCase();
  if (segmentId.endsWith("-arguments")) return false;
  if (
    segmentId.endsWith("-output") ||
    segmentId.endsWith("-result") ||
    segmentId.includes("-content")
  ) {
    return true;
  }

  return fieldName === undefined;
};

export const isMutatingToolSegment = (segment: ContextSegment | ReadonlyContextSegment): boolean => {
  const meta = asObject(segment.metadata);
  const toolName = normalizeToolName(meta);
  if (!toolName || !MUTATING_TOOL_NAMES.has(toolName)) return false;
  return Boolean(extractDataKey(meta));
};

function collectFileEvents(segments: ReadonlyArray<ContextSegment | ReadonlyContextSegment>): FileEvent[] {
  const events: FileEvent[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const meta = asObject(segment.metadata);
    const dataKey = extractDataKey(meta);
    if (!dataKey) continue;
    const readKey = buildReadKey(dataKey, extractReadWindow(meta));

    if (isReadOutputSegment(segment)) {
      events.push({
        kind: "read",
        index,
        dataKey,
        readKey,
        segmentId: segment.id,
      });
      continue;
    }

    if (isMutatingToolSegment(segment)) {
      events.push({
        kind: "mutate",
        index,
        dataKey,
      });
    }
  }
  return events;
}

export function analyzeReadStateCompaction(
  segments: ReadonlyArray<ContextSegment | ReadonlyContextSegment>,
): Map<string, ReadStateClassification> {
  const events = collectFileEvents(segments);
  const stateBySegmentId = new Map<string, ReadStateClassification>();
  const nearestMutationByDataKey = new Map<string, number>();
  const nearestReadByReadKey = new Map<string, number>();

  for (let eventIndex = events.length - 1; eventIndex >= 0; eventIndex -= 1) {
    const event = events[eventIndex];
    if (event.kind === "mutate") {
      nearestMutationByDataKey.set(event.dataKey, event.index);
      continue;
    }

    const mutationIndex = nearestMutationByDataKey.get(event.dataKey);
    const laterReadIndex = nearestReadByReadKey.get(event.readKey);
    const state = mutationIndex != null && (laterReadIndex == null || mutationIndex < laterReadIndex)
      ? "stale"
      : laterReadIndex != null
        ? "superseded"
        : "fresh";
    stateBySegmentId.set(event.segmentId, {
      segmentId: event.segmentId,
      dataKey: event.dataKey,
      readKey: event.readKey,
      state,
      reason: state === "stale" ? "later_mutation" : state === "superseded" ? "later_read" : "none",
      triggeringIndex: state === "stale" ? mutationIndex : laterReadIndex,
    });
    nearestReadByReadKey.set(event.readKey, event.index);
  }

  return stateBySegmentId;
}

export function classifyReadStates(
  segments: ReadonlyArray<ContextSegment | ReadonlyContextSegment>,
): Map<string, ReadState> {
  const analyzed = analyzeReadStateCompaction(segments);
  const states = new Map<string, ReadState>();
  for (const [segmentId, entry] of analyzed.entries()) {
    states.set(segmentId, entry.state);
  }
  return states;
}
