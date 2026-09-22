import { createHash } from "node:crypto";
import type { ContextSegment } from "@lightrsi/kernel";
import type { ReductionDecision, ReductionInstruction } from "../decision-types.js";
import {
  analyzeReadStateCompaction as classifyReadStates,
  extractDataKey,
  isReadOutputSegment,
  normalizeToolName,
  type ReadState,
  type ReadStateReason,
} from "../reduction/read-state-compaction.js";

type ReadSegmentInfo = {
  index: number;
  segmentId: string;
  toolName: string;
  dataKey: string;
  readKey: string;
  contentHash: string;
  chars: number;
  state: ReadState;
  reason: ReadStateReason;
  triggeringIndex?: number;
};

export type ReadStateCompactionAnalyzerConfig = {
  enabled?: boolean;
  minChars?: number;
  minSavedChars?: number;
};

const DEFAULT_CONFIG: Required<ReadStateCompactionAnalyzerConfig> = {
  enabled: true,
  minChars: 500,
  minSavedChars: 200,
};

const asObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

const hashText = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export function analyzeReadStateCompaction(
  segments: ContextSegment[],
  config: ReadStateCompactionAnalyzerConfig = DEFAULT_CONFIG,
): ReductionDecision {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!cfg.enabled) {
    return {
      enabled: false,
      instructions: [],
      estimatedSavedChars: 0,
      notes: ["read_state_compaction_analyzer_disabled"],
    };
  }

  const classifications = classifyReadStates(segments);
  const readsByKey = new Map<string, ReadSegmentInfo[]>();

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!isReadOutputSegment(segment)) continue;

    const dataKey = extractDataKey(asObject(segment.metadata));
    const classification = classifications.get(segment.id);
    if (!dataKey || !classification || classification.state === "fresh") continue;
    if (segment.text.length < cfg.minChars) continue;

    const read: ReadSegmentInfo = {
      index,
      segmentId: segment.id,
      toolName: normalizeToolName(asObject(segment.metadata)) ?? "read",
      dataKey,
      readKey: classification.readKey,
      contentHash: hashText(segment.text),
      chars: segment.text.length,
      state: classification.state,
      reason: classification.reason,
      triggeringIndex: classification.triggeringIndex,
    };
    const key = read.state === "stale"
      ? `${read.dataKey}:stale`
      : `${read.readKey}:superseded`;
    const existing = readsByKey.get(key) ?? [];
    existing.push(read);
    readsByKey.set(key, existing);
  }

  const instructions: ReductionInstruction[] = [];
  let estimatedSavedChars = 0;

  for (const reads of readsByKey.values()) {
    const savedChars = reads.reduce((sum, read) => sum + read.chars, 0);
    if (savedChars < cfg.minSavedChars) continue;

    const first = reads[0];
    if (!first) continue;
    const segmentIds = reads
      .sort((a, b) => a.index - b.index)
      .map((read) => read.segmentId);
    if (segmentIds.length === 0) continue;

    instructions.push({
      strategy: "read_state_compaction",
      segmentIds,
      confidence: first.state === "stale" ? 0.98 : 0.95,
      priority: first.state === "stale" ? 11 : 10,
      rationale: first.state === "stale"
        ? `Read content for "${first.dataKey}" became stale after a later mutation; compacting ${segmentIds.length} stale read segment(s)`
        : `Read content for "${first.dataKey}" was superseded by a later read; compacting ${segmentIds.length} superseded read segment(s)`,
      parameters: {
        readPath: first.dataKey,
        state: first.state,
        reason: first.reason,
        triggeringIndices: reads
          .map((read) => read.triggeringIndex)
          .filter((value): value is number => typeof value === "number"),
        contentHashes: reads.map((read) => read.contentHash),
      },
    });
    estimatedSavedChars += savedChars;
  }

  return {
    enabled: true,
    instructions,
    estimatedSavedChars,
    notes: [
      `analyzed_segments=${segments.length}`,
      `read_state_groups=${instructions.length}`,
      `estimated_saved_chars=${estimatedSavedChars}`,
    ],
  };
}
