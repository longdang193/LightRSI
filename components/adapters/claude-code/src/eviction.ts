import type { ContextSegment, RuntimeTurnContext } from "@lightmem2/kernel";
import {
  buildHistoryBlocks,
  collectRuleSignals,
  deriveHistoryLifecycle,
  type HistoryBlock,
  type HistorySignalType,
} from "@lightmem2/history";

// Signal-driven eviction for the stateless Anthropic Messages model. Unlike the
// task-registry analyzer (which needs an LLM estimator to mark completed tasks),
// this selects blocks purely from rule signals available within a single request:
// repeated tool reads and oversized blocks.
const EVICTABLE_SIGNALS: HistorySignalType[] = ["REPEATED_READ", "LARGE_BLOCK"];

export type ClaudeEvictionConfig = {
  enabled: boolean;
  minBlockChars?: number;
};

export type ClaudeEvictionSelection = {
  blockId: string;
  segmentIds: string[];
  chars: number;
  reasons: HistorySignalType[];
};

export type ClaudeEvictionResult = {
  enabled: boolean;
  changed: boolean;
  evictedBlockIds: string[];
  savedChars: number;
  selections: ClaudeEvictionSelection[];
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      const record = asRecord(block);
      if (!record) return "";
      if (typeof record.text === "string") return record.text;
      if (typeof record.content === "string") return record.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

// Anthropic delivers tool results under the user role as a tool_result block.
// Surface the first such block so the chunker recognizes it as a tool result
// and the signal pass can detect repeated reads by its call id.
function firstToolResult(content: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(content)) return undefined;
  for (const block of content) {
    const record = asRecord(block);
    if (record?.type === "tool_result") return record;
  }
  return undefined;
}

function messageToSegment(message: unknown, index: number): ContextSegment {
  const record = asRecord(message) ?? {};
  const role = typeof record.role === "string" ? record.role : "unknown";
  const toolResult = firstToolResult(record.content);
  const text = toolResult
    ? contentToText(toolResult.content)
    : contentToText(record.content);
  const metadata: Record<string, unknown> = { messageIndex: index, role };
  if (toolResult) {
    metadata.toolName = "tool_result";
    metadata.toolPayload = { toolName: "tool_result", path: toolResult.tool_use_id };
  }
  return {
    id: `msg-${index}`,
    kind: "volatile",
    text,
    priority: index,
    source: `anthropic.messages.${role}`,
    metadata,
  };
}

function buildTurnContext(
  sessionId: string,
  model: string,
  messages: unknown[],
): RuntimeTurnContext {
  return {
    sessionId,
    sessionMode: "single",
    provider: "anthropic",
    model,
    apiFamily: "anthropic-messages",
    prompt: "",
    segments: messages.map((message, index) => messageToSegment(message, index)),
    budget: { maxInputTokens: 0, reserveOutputTokens: 0 },
  };
}

function selectEvictableBlocks(
  blocks: HistoryBlock[],
  minBlockChars: number,
): ClaudeEvictionSelection[] {
  const selections: ClaudeEvictionSelection[] = [];
  for (const block of blocks) {
    if (block.charCount < minBlockChars) continue;
    const signalTypes = block.signalTypes ?? [];
    const reasons = EVICTABLE_SIGNALS.filter((signal) => signalTypes.includes(signal));
    const evictableByLifecycle = block.lifecycleState === "EVICTABLE";
    if (reasons.length === 0 && !evictableByLifecycle) continue;
    selections.push({
      blockId: block.blockId,
      segmentIds: [...block.segmentIds],
      chars: block.charCount,
      reasons,
    });
  }
  return selections;
}

// Analyze the current request's messages and return which blocks should be
// evicted. Does not mutate anything; the caller applies the selection to the
// outbound envelope.
export function analyzeClaudeEviction(params: {
  sessionId: string;
  model: string;
  messages: unknown[];
  config: ClaudeEvictionConfig;
}): ClaudeEvictionResult {
  if (!params.config.enabled) {
    return { enabled: false, changed: false, evictedBlockIds: [], savedChars: 0, selections: [] };
  }

  const ctx = buildTurnContext(params.sessionId, params.model, params.messages);
  const { blocks } = buildHistoryBlocks(ctx);
  const signals = collectRuleSignals(blocks);
  const lifecycle = deriveHistoryLifecycle(blocks, signals);

  const selections = selectEvictableBlocks(
    lifecycle.blocks,
    params.config.minBlockChars ?? 256,
  );
  const savedChars = selections.reduce((sum, selection) => sum + selection.chars, 0);

  return {
    enabled: true,
    changed: selections.length > 0,
    evictedBlockIds: selections.map((selection) => selection.blockId),
    savedChars,
    selections,
  };
}

export type ClaudeEvictionApplySummary = {
  enabled: boolean;
  changed: boolean;
  evictedMessageCount: number;
  savedChars: number;
  evictedBlockIds: string[];
};

function segmentIdToMessageIndex(segmentId: string): number | undefined {
  const match = /^msg-(\d+)$/.exec(segmentId);
  return match ? Number(match[1]) : undefined;
}

// Apply eviction to the outbound payload in place. Evicted messages are replaced
// with a short pointer stub rather than removed, so message indices and
// tool_use/tool_result pairing stay intact for the upstream API.
export function applyClaudeEviction(params: {
  payload: { messages?: unknown[] };
  sessionId: string;
  model: string;
  config: ClaudeEvictionConfig;
}): ClaudeEvictionApplySummary {
  const messages = params.payload.messages;
  if (!params.config.enabled || !Array.isArray(messages)) {
    return {
      enabled: Boolean(params.config.enabled),
      changed: false,
      evictedMessageCount: 0,
      savedChars: 0,
      evictedBlockIds: [],
    };
  }

  const analysis = analyzeClaudeEviction({
    sessionId: params.sessionId,
    model: params.model,
    messages,
    config: params.config,
  });
  if (!analysis.changed) {
    return {
      enabled: true,
      changed: false,
      evictedMessageCount: 0,
      savedChars: 0,
      evictedBlockIds: [],
    };
  }

  const targetIndices = new Set<number>();
  for (const selection of analysis.selections) {
    for (const segmentId of selection.segmentIds) {
      const index = segmentIdToMessageIndex(segmentId);
      if (index !== undefined) targetIndices.add(index);
    }
  }

  let savedChars = 0;
  let evictedMessageCount = 0;
  for (const index of targetIndices) {
    const message = messages[index];
    const record = asRecord(message);
    if (!record) continue;
    const before = contentToText(record.content).length;
    const role = typeof record.role === "string" ? record.role : "user";
    messages[index] = {
      role,
      content: "[evicted: earlier content removed to save context]",
    };
    savedChars += Math.max(0, before - String((messages[index] as { content: string }).content).length);
    evictedMessageCount += 1;
  }

  return {
    enabled: true,
    changed: evictedMessageCount > 0,
    evictedMessageCount,
    savedChars,
    evictedBlockIds: analysis.evictedBlockIds,
  };
}
