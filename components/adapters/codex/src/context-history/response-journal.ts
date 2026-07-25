import { appendJsonl } from "@lightmem2/host-adapter";
import { codexContextHistoryJournalPath } from "./journal-store.js";
import { asJsonObject, cloneJson, normalizeStatus, sanitizeValue } from "./shared.js";
import {
  CODEX_CONTEXT_HISTORY_RESPONSE_SCHEMA,
  type CodexJournalStatus,
  type CodexResponseJournalEntry,
  type JsonObject,
} from "./types.js";

type StreamEvent = {
  event: string;
  data: JsonObject;
};

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function parseSseEvents(rawStreamText: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const chunk of rawStreamText.split(/\r?\n\r?\n/)) {
    const lines = chunk.split(/\r?\n/);
    const eventLine = lines.find((line) => line.startsWith("event:"));
    const event = eventLine?.slice("event:".length).trim() || "message";
    const dataLines = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter(Boolean);
    for (const dataText of dataLines) {
      if (dataText === "[DONE]") continue;
      const data = asJsonObject(safeJsonParse(dataText));
      if (data) events.push({ event, data });
    }
  }
  return events;
}

function outputItemKeyFromEvent(data: JsonObject, fallbackIndex: number): string {
  const item = asJsonObject(data.item);
  if (typeof item?.id === "string") return item.id;
  if (typeof data.item_id === "string") return data.item_id;
  if (typeof data.output_index === "number") return `output_index:${data.output_index}`;
  return `event:${fallbackIndex}`;
}

function deltaText(data: JsonObject): string {
  const nestedDelta = asJsonObject(data.delta);
  if (typeof data.delta === "string") return data.delta;
  if (typeof nestedDelta?.output_text === "string") return nestedDelta.output_text;
  if (typeof nestedDelta?.text === "string") return nestedDelta.text;
  return "";
}

function mergeOutputTextDelta(item: JsonObject, data: JsonObject): void {
  const delta = deltaText(data);
  if (!delta) return;
  if (!Array.isArray(item.content)) {
    item.content = [{ type: "output_text", text: "" }];
  }
  const content = item.content as unknown[];
  const first = asJsonObject(content[0]);
  if (!first) {
    content[0] = { type: "output_text", text: delta };
    return;
  }
  first.text = `${typeof first.text === "string" ? first.text : ""}${delta}`;
}

function mergeFunctionArgumentsDelta(item: JsonObject, data: JsonObject): void {
  const delta = typeof data.delta === "string" ? data.delta : "";
  if (!delta) return;
  item.arguments = `${typeof item.arguments === "string" ? item.arguments : ""}${delta}`;
}

function responseMetadata(data: JsonObject): {
  responseId?: string;
  previousResponseId?: string;
  output?: unknown[];
} {
  const response = asJsonObject(data.response);
  return {
    responseId: typeof response?.id === "string"
      ? response.id
      : typeof data.id === "string"
        ? data.id
        : undefined,
    previousResponseId: typeof response?.previous_response_id === "string"
      ? response.previous_response_id
      : typeof data.previous_response_id === "string"
        ? data.previous_response_id
        : undefined,
    output: Array.isArray(response?.output) ? response.output : undefined,
  };
}

export function collectCodexResponseItemsFromStream(rawStreamText: string): {
  outputItems: JsonObject[];
  eventTypeCounts: Record<string, number>;
  responseId?: string;
  previousResponseId?: string;
  status: CodexJournalStatus;
} {
  const events = parseSseEvents(rawStreamText);
  const outputItems = new Map<string, JsonObject>();
  const eventTypeCounts: Record<string, number> = {};
  let responseId: string | undefined;
  let previousResponseId: string | undefined;
  let status: CodexJournalStatus = "incomplete";

  events.forEach(({ event, data }, index) => {
    eventTypeCounts[event] = (eventTypeCounts[event] ?? 0) + 1;

    const metadata = responseMetadata(data);
    responseId = metadata.responseId ?? responseId;
    previousResponseId = metadata.previousResponseId ?? previousResponseId;
    if (event === "response.completed") status = "completed";
    if (event === "response.failed") status = "failed";
    if (event === "response.incomplete") status = "incomplete";

    for (const item of metadata.output ?? []) {
      const cloned = asJsonObject(cloneJson(item));
      if (!cloned) continue;
      outputItems.set(typeof cloned.id === "string" ? cloned.id : `response-output:${outputItems.size}`, cloned);
    }

    const addedItem = asJsonObject(data.item);
    if (addedItem) {
      const key = outputItemKeyFromEvent(data, index);
      outputItems.set(key, {
        ...(outputItems.get(key) ?? {}),
        ...cloneJson(addedItem),
      });
      return;
    }

    if (event === "response.output_text.delta") {
      const key = outputItemKeyFromEvent(data, index);
      const item = outputItems.get(key) ?? {
        id: typeof data.item_id === "string" ? data.item_id : undefined,
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "" }],
      };
      mergeOutputTextDelta(item, data);
      outputItems.set(key, item);
      return;
    }

    if (event === "response.function_call_arguments.delta") {
      const key = outputItemKeyFromEvent(data, index);
      const item = outputItems.get(key) ?? {
        id: typeof data.item_id === "string" ? data.item_id : undefined,
        type: "function_call",
      };
      mergeFunctionArgumentsDelta(item, data);
      outputItems.set(key, item);
    }
  });

  return {
    outputItems: Array.from(outputItems.values()).map((item) => cloneJson(sanitizeValue(item)) as JsonObject),
    eventTypeCounts,
    responseId,
    previousResponseId,
    status,
  };
}

function outputRefs(outputItems: JsonObject[]): CodexResponseJournalEntry["outputItemRefs"] {
  return outputItems.map((item) => ({
    type: typeof item.type === "string" ? item.type : undefined,
    itemId: typeof item.id === "string" ? item.id : undefined,
    callId: typeof item.call_id === "string" ? item.call_id : undefined,
  }));
}

export async function appendCodexResponseJournalEntry(params: {
  stateDir: string;
  sessionId: string;
  requestId?: string;
  response?: JsonObject;
  rawStreamText?: string;
  status?: CodexJournalStatus;
  error?: string;
  observedAt?: string;
}): Promise<CodexResponseJournalEntry> {
  const streamCollected = typeof params.rawStreamText === "string"
    ? collectCodexResponseItemsFromStream(params.rawStreamText)
    : undefined;
  const response = params.response ?? {};
  const outputItems = streamCollected
    ? streamCollected.outputItems
    : Array.isArray(response.output)
      ? cloneJson(sanitizeValue(response.output)) as JsonObject[]
      : [];
  const entry: CodexResponseJournalEntry = {
    schema: CODEX_CONTEXT_HISTORY_RESPONSE_SCHEMA,
    kind: "response",
    requestId: params.requestId,
    sessionId: params.sessionId,
    responseId: streamCollected?.responseId ?? (typeof response.id === "string" ? response.id : undefined),
    previousResponseId: streamCollected?.previousResponseId
      ?? (typeof response.previous_response_id === "string" ? response.previous_response_id : undefined),
    stream: typeof params.rawStreamText === "string",
    outputItems,
    outputItemRefs: outputRefs(outputItems),
    eventTypeCounts: streamCollected?.eventTypeCounts,
    status: normalizeStatus(params.status, streamCollected?.status ?? "completed"),
    error: params.error,
    observedAt: params.observedAt ?? new Date().toISOString(),
  };
  await appendJsonl(codexContextHistoryJournalPath(params.stateDir, params.sessionId), entry);
  return entry;
}
