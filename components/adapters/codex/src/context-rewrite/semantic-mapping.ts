import {
  buildTurnAbsId,
  createTurnAnchor,
  type RawSemanticMessageRecord,
  type RawSemanticToolCallRecord,
  type RawSemanticToolResultRecord,
  type RawSemanticTurnRecord,
} from "@lightmem2/history";

import type {
  CodexEffectiveHistoryItem,
  CodexEffectiveHistoryReasonCode,
  CodexEffectiveHistoryTurn,
  CodexEffectiveHistoryView,
  JsonObject,
} from "../context-history/types.js";

const ARGUMENT_SUMMARY_MAX_CHARS = 400;
const RESULT_SUMMARY_MAX_CHARS = 800;

export type CodexRawSemanticReasonCode =
  | CodexEffectiveHistoryReasonCode
  | "semantic_source_incomplete"
  | "semantic_turn_identity_invalid"
  | "semantic_turn_sequence_duplicate"
  | "semantic_item_attribution_unknown"
  | "semantic_item_attribution_ambiguous"
  | "semantic_message_role_unsupported"
  | "semantic_message_content_unsupported"
  | "semantic_item_unsupported"
  | "semantic_tool_call_invalid"
  | "semantic_tool_result_invalid"
  | "semantic_tool_closure_incomplete"
  | "semantic_tool_closure_ambiguous"
  | "semantic_tool_result_precedes_call"
  | "semantic_tool_protocol_mismatch";

export type CodexRawSemanticTurnsResult = {
  turns: RawSemanticTurnRecord[];
  complete: boolean;
  reasonCodes: CodexRawSemanticReasonCode[];
};

type SupportedToolKind = "function" | "custom";

type AttributedItem = {
  effective: CodexEffectiveHistoryItem;
  turn: CodexEffectiveHistoryTurn;
  order: number;
};

type ToolCallCandidate = AttributedItem & {
  callId: string;
  kind: SupportedToolKind;
};

type ToolResultCandidate = AttributedItem & {
  callId: string;
  kind: SupportedToolKind;
};

function asRecord(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function nonBlankString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function originalNonBlankString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function itemType(item: JsonObject): string {
  return typeof item.type === "string" ? item.type.toLowerCase() : "";
}

function summarize(text: string, maxChars: number): string {
  const trimmed = text.trim();
  return trimmed.length <= maxChars
    ? trimmed
    : `${trimmed.slice(0, maxChars)}...`;
}

function appendReason(
  reasons: CodexRawSemanticReasonCode[],
  reason: CodexRawSemanticReasonCode,
): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function sessionIdFromTurn(turn: CodexEffectiveHistoryTurn): string | undefined {
  if (!Number.isInteger(turn.turnSeq) || turn.turnSeq <= 0) return undefined;
  const suffix = `:t${turn.turnSeq}`;
  if (!turn.turnAbsId.endsWith(suffix)) return undefined;
  const sessionId = turn.turnAbsId.slice(0, -suffix.length);
  return sessionId && buildTurnAbsId(sessionId, turn.turnSeq) === turn.turnAbsId
    ? sessionId
    : undefined;
}

function safeTextParts(content: unknown): { texts: string[]; unsupported: boolean } {
  if (typeof content === "string") {
    return { texts: content.trim().length > 0 ? [content] : [], unsupported: false };
  }
  if (content === undefined || content === null) return { texts: [], unsupported: false };
  if (!Array.isArray(content)) return { texts: [], unsupported: true };

  const texts: string[] = [];
  let unsupported = false;
  for (const rawPart of content) {
    if (typeof rawPart === "string") {
      // String message content is a supported Responses shape, but array
      // members must carry an explicit safe text-part type. Treat bare array
      // strings as unknown provider payload instead of guessing their meaning.
      unsupported = true;
      continue;
    }
    const part = asRecord(rawPart);
    if (!part) {
      unsupported = true;
      continue;
    }
    const type = typeof part.type === "string" ? part.type.toLowerCase() : "";
    if (
      (type === "input_text" || type === "output_text" || type === "text")
      && typeof part.text === "string"
    ) {
      if (part.text.trim().length > 0) texts.push(part.text);
      continue;
    }
    unsupported = true;
  }
  return { texts, unsupported };
}

function messageTexts(item: JsonObject): { texts: string[]; unsupported: boolean } {
  if ("content" in item) return safeTextParts(item.content);
  if (typeof item.text === "string") {
    return { texts: item.text.trim().length > 0 ? [item.text] : [], unsupported: false };
  }
  return { texts: [], unsupported: false };
}

function toolKindAndSide(item: JsonObject): {
  kind: SupportedToolKind;
  side: "call" | "result";
} | undefined {
  switch (itemType(item)) {
    case "function_call":
      return { kind: "function", side: "call" };
    case "function_call_output":
      return { kind: "function", side: "result" };
    case "custom_tool_call":
      return { kind: "custom", side: "call" };
    case "custom_tool_call_output":
      return { kind: "custom", side: "result" };
    default:
      return undefined;
  }
}

function isIgnorableNonSemanticItem(item: JsonObject): boolean {
  const type = itemType(item);
  if (type === "reasoning" || type === "compaction") return true;
  if (type === "event_msg" || type === "turn_context") return true;
  if (
    type === "web_search_call"
    || type === "file_search_call"
    || type === "code_interpreter_call"
    || type === "image_generation_call"
    || type === "mcp_call"
    || type === "mcp_list_tools"
    || type === "mcp_approval_request"
    || type === "mcp_approval_response"
    || type === "additional_tools"
  ) return true;
  return (type === "tool_search_call" || type === "tool_search_output")
    && String(item.execution ?? "").toLowerCase() !== "client";
}

function toolArgumentsText(item: JsonObject, kind: SupportedToolKind): {
  text?: string;
  valid: boolean;
} {
  const value = kind === "function" ? item.arguments : item.input;
  return typeof value === "string"
    ? { text: value, valid: true }
    : { valid: false };
}

function toolResultText(item: JsonObject): { text?: string; valid: boolean } {
  if (!("output" in item)) return { valid: false };
  if (typeof item.output === "string") return { text: item.output, valid: true };
  const extracted = safeTextParts(item.output);
  if (extracted.unsupported) return { valid: false };
  return { text: extracted.texts.join("\n"), valid: true };
}

function toolResultStatus(item: JsonObject): "success" | "error" {
  const status = typeof item.status === "string" ? item.status.toLowerCase() : "";
  return item.is_error === true || status === "error" || status === "failed" || status === "incomplete"
    ? "error"
    : "success";
}

function allEffectiveItems(view: CodexEffectiveHistoryView): CodexEffectiveHistoryItem[] {
  return [
    ...view.history.replayableItems,
    ...view.history.observationOnlyItems,
    ...view.history.deferredItems,
  ];
}

/**
 * Purely maps a provenance-complete Codex effective-history view to the shared
 * raw semantic turn contract. System/developer, reasoning, compaction and
 * provider-owned items stay out of semantic messages. Function/custom results
 * are anchored to the turn containing their paired call so shared consumers
 * always observe an original-call turn closure.
 */
export function buildCodexRawSemanticTurns(
  view: CodexEffectiveHistoryView,
): CodexRawSemanticTurnsResult {
  const reasonCodes: CodexRawSemanticReasonCode[] = [];
  for (const reason of view.reasonCodes) appendReason(reasonCodes, reason);
  if (
    !view.semanticComplete
    || view.history.incomplete
    || view.history.deferredItems.length > 0
    || view.history.unresolvedCallIds.length > 0
  ) {
    appendReason(reasonCodes, "semantic_source_incomplete");
  }

  const effectiveById = new Map<string, CodexEffectiveHistoryItem>();
  for (const effective of allEffectiveItems(view)) {
    if (effectiveById.has(effective.stableItemId)) {
      appendReason(reasonCodes, "semantic_item_attribution_ambiguous");
      continue;
    }
    effectiveById.set(effective.stableItemId, effective);
  }

  const orderedTurns = [...view.turns].sort((left, right) => left.turnSeq - right.turnSeq);
  const records: RawSemanticTurnRecord[] = [];
  const recordByTurnSeq = new Map<number, RawSemanticTurnRecord>();
  const attributedById = new Map<string, AttributedItem>();
  let sessionId: string | undefined;
  let itemOrder = 0;

  for (const turn of orderedTurns) {
    const derivedSessionId = sessionIdFromTurn(turn);
    if (!derivedSessionId || (sessionId !== undefined && derivedSessionId !== sessionId)) {
      appendReason(reasonCodes, "semantic_turn_identity_invalid");
      continue;
    }
    sessionId ??= derivedSessionId;
    if (recordByTurnSeq.has(turn.turnSeq)) {
      appendReason(reasonCodes, "semantic_turn_sequence_duplicate");
      continue;
    }

    const record: RawSemanticTurnRecord = {
      sessionId,
      turnSeq: turn.turnSeq,
      turnAbsId: turn.turnAbsId,
      messages: [],
      toolCalls: [],
      toolResults: [],
    };
    records.push(record);
    recordByTurnSeq.set(turn.turnSeq, record);

    for (const stableItemId of [...turn.inputItemIds, ...turn.outputItemIds]) {
      const effective = effectiveById.get(stableItemId);
      if (!effective) {
        appendReason(reasonCodes, "semantic_item_attribution_unknown");
        continue;
      }
      if (attributedById.has(stableItemId)) {
        appendReason(reasonCodes, "semantic_item_attribution_ambiguous");
        continue;
      }
      attributedById.set(stableItemId, { effective, turn, order: itemOrder });
      itemOrder += 1;
    }
  }

  for (const [stableItemId, effective] of effectiveById) {
    if (
      !attributedById.has(stableItemId)
      && !isIgnorableNonSemanticItem(effective.item)
    ) {
      appendReason(reasonCodes, "semantic_item_attribution_unknown");
    }
  }

  const toolCallsById = new Map<string, ToolCallCandidate[]>();
  const toolResultsById = new Map<string, ToolResultCandidate[]>();
  const attributedItems = Array.from(attributedById.values())
    .sort((left, right) => left.order - right.order);

  for (const attributed of attributedItems) {
    const item = attributed.effective.item;
    const type = itemType(item);
    const role = typeof item.role === "string" ? item.role.toLowerCase() : "";
    if (type === "message" || (!type && role.length > 0)) {
      if (role === "system" || role === "developer") continue;
      if (role !== "user" && role !== "assistant") {
        appendReason(reasonCodes, "semantic_message_role_unsupported");
        continue;
      }
      const extracted = messageTexts(item);
      if (extracted.unsupported) {
        appendReason(reasonCodes, "semantic_message_content_unsupported");
      }
      const record = recordByTurnSeq.get(attributed.turn.turnSeq);
      if (!record || !sessionId) continue;
      const anchor = createTurnAnchor(sessionId, attributed.turn.turnSeq, role);
      for (const text of extracted.texts) {
        const message: RawSemanticMessageRecord = { anchor, role, text };
        record.messages.push(message);
      }
      continue;
    }

    const tool = toolKindAndSide(item);
    if (!tool) {
      if (!isIgnorableNonSemanticItem(item)) {
        appendReason(reasonCodes, "semantic_item_unsupported");
      }
      continue;
    }
    const callId = originalNonBlankString(item.call_id);
    if (!callId) {
      appendReason(
        reasonCodes,
        tool.side === "call" ? "semantic_tool_call_invalid" : "semantic_tool_result_invalid",
      );
      appendReason(reasonCodes, "semantic_tool_closure_incomplete");
      continue;
    }
    const candidate = { ...attributed, callId, kind: tool.kind };
    const target = tool.side === "call" ? toolCallsById : toolResultsById;
    const values = target.get(callId) ?? [];
    values.push(candidate);
    target.set(callId, values);
  }

  const callIds = Array.from(new Set([
    ...toolCallsById.keys(),
    ...toolResultsById.keys(),
  ])).sort((left, right) => {
    const leftOrder = toolCallsById.get(left)?.[0]?.order
      ?? toolResultsById.get(left)?.[0]?.order
      ?? 0;
    const rightOrder = toolCallsById.get(right)?.[0]?.order
      ?? toolResultsById.get(right)?.[0]?.order
      ?? 0;
    return leftOrder - rightOrder || left.localeCompare(right);
  });
  const mappedToolCalls: Array<{
    order: number;
    turnSeq: number;
    value: RawSemanticToolCallRecord;
  }> = [];
  const mappedToolResults: Array<{
    order: number;
    turnSeq: number;
    value: RawSemanticToolResultRecord;
  }> = [];

  for (const callId of callIds) {
    const calls = toolCallsById.get(callId) ?? [];
    const results = toolResultsById.get(callId) ?? [];
    if (calls.length !== 1 || results.length !== 1) {
      appendReason(
        reasonCodes,
        calls.length > 1 || results.length > 1
          ? "semantic_tool_closure_ambiguous"
          : "semantic_tool_closure_incomplete",
      );
      continue;
    }

    const call = calls[0]!;
    const result = results[0]!;
    if (call.kind !== result.kind) {
      appendReason(reasonCodes, "semantic_tool_protocol_mismatch");
      continue;
    }
    if (result.order < call.order) {
      appendReason(reasonCodes, "semantic_tool_result_precedes_call");
      continue;
    }
    const toolName = nonBlankString(call.effective.item.name);
    const argumentsValue = toolArgumentsText(call.effective.item, call.kind);
    const resultValue = toolResultText(result.effective.item);
    if (!toolName || !argumentsValue.valid) {
      appendReason(reasonCodes, "semantic_tool_call_invalid");
      continue;
    }
    if (!resultValue.valid || resultValue.text === undefined) {
      appendReason(reasonCodes, "semantic_tool_result_invalid");
      continue;
    }

    const record = recordByTurnSeq.get(call.turn.turnSeq);
    if (!record || !sessionId) {
      appendReason(reasonCodes, "semantic_item_attribution_unknown");
      continue;
    }
    const anchor = createTurnAnchor(sessionId, call.turn.turnSeq, "tool");
    const toolCall: RawSemanticToolCallRecord = {
      anchor,
      toolCallId: callId,
      toolName,
      ...(argumentsValue.text === undefined ? {} : { argumentsText: argumentsValue.text }),
      argumentsSummary: summarize(argumentsValue.text ?? toolName, ARGUMENT_SUMMARY_MAX_CHARS),
    };
    const toolResult: RawSemanticToolResultRecord = {
      anchor,
      toolCallId: callId,
      toolName,
      status: toolResultStatus(result.effective.item),
      fullText: resultValue.text,
      summary: summarize(resultValue.text, RESULT_SUMMARY_MAX_CHARS),
    };
    mappedToolCalls.push({
      order: call.order,
      turnSeq: call.turn.turnSeq,
      value: toolCall,
    });
    mappedToolResults.push({
      order: result.order,
      turnSeq: call.turn.turnSeq,
      value: toolResult,
    });
  }

  for (const mapped of mappedToolCalls.sort((left, right) => left.order - right.order)) {
    recordByTurnSeq.get(mapped.turnSeq)?.toolCalls.push(mapped.value);
  }
  for (const mapped of mappedToolResults.sort((left, right) => left.order - right.order)) {
    recordByTurnSeq.get(mapped.turnSeq)?.toolResults.push(mapped.value);
  }

  return {
    turns: records,
    complete: reasonCodes.length === 0,
    reasonCodes,
  };
}
