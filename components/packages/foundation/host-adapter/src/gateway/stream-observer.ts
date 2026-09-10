import type {
  HostGatewayStreamObserver,
  HostGatewayStreamSnapshot,
} from "../contracts/gateway-runtime.js";
import { TextDecoder } from "node:util";

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function extractTextParts(value: unknown, sink: string[]): void {
  if (!value) return;
  if (typeof value === "string") {
    sink.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) extractTextParts(item, sink);
    return;
  }
  if (typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  if (typeof obj.text === "string") sink.push(obj.text);
  if (typeof obj.content === "string") sink.push(obj.content);
  if (typeof obj.output_text === "string") sink.push(obj.output_text);
  extractTextParts(obj.delta, sink);
  extractTextParts(obj.output, sink);
  extractTextParts(obj.response, sink);
  extractTextParts(obj.content, sink);
}

export function snapshotSseJsonStream(
  rawStreamText: string,
  options?: {
    responseIdPaths?: string[][];
    previousResponseIdPaths?: string[][];
    usagePaths?: string[][];
  },
): HostGatewayStreamSnapshot {
  const observer = createSseJsonStreamObserver(options);
  observer.feed?.(rawStreamText);
  return observer.finish?.() ?? observer.snapshot(rawStreamText);
}

export function createSseJsonStreamObserver(options?: {
  responseIdPaths?: string[][];
  previousResponseIdPaths?: string[][];
  usagePaths?: string[][];
}): HostGatewayStreamObserver {
  const responseIdPaths = options?.responseIdPaths ?? [["response", "id"], ["id"]];
  const previousResponseIdPaths = options?.previousResponseIdPaths ?? [
    ["response", "previous_response_id"],
    ["previous_response_id"],
  ];
  const usagePaths = options?.usagePaths ?? [["usage"]];
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const assistantParts: string[] = [];
  let usage: Record<string, unknown> | undefined;
  let responseId: string | undefined;
  let previousResponseId: string | undefined;
  let pending = "";
  let rawStreamText = "";
  let finished = false;

  const resolvePath = (value: unknown, path: string[]): unknown => {
    let current = value;
    for (const key of path) {
      if (!current || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  };

  const processBlock = (block: string): void => {
    const dataLines = block
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    for (const data of dataLines) {
      if (data === "[DONE]") continue;
      const payload = safeJsonParse(data);
      if (!payload || typeof payload !== "object") continue;
      for (const path of responseIdPaths) {
        const value = resolvePath(payload, path);
        if (typeof value === "string" && value.trim()) {
          responseId = value.trim();
          break;
        }
      }
      for (const path of previousResponseIdPaths) {
        const value = resolvePath(payload, path);
        if (typeof value === "string" && value.trim()) {
          previousResponseId = value.trim();
          break;
        }
      }
      for (const path of usagePaths) {
        const value = resolvePath(payload, path);
        if (value && typeof value === "object" && !Array.isArray(value)) {
          usage = value as Record<string, unknown>;
          break;
        }
      }
      extractTextParts(payload, assistantParts);
    }
  };

  const snapshot = (text: string): HostGatewayStreamSnapshot => ({
    assistantText: assistantParts.join(""),
    usage,
    rawStreamText: text,
    metadata: { responseId, previousResponseId },
  });

  return {
    snapshot(text: string) {
      return snapshotSseJsonStream(text, options);
    },
    feed(chunk: string | Uint8Array) {
      if (finished) return;
      const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
      let decoded: string;
      try {
        decoded = decoder.decode(bytes, { stream: true });
      } catch {
        decoded = typeof chunk === "string" ? chunk : new TextDecoder().decode(bytes);
      }
      rawStreamText += decoded;
      pending += decoded;
      let boundary = pending.indexOf("\n\n");
      while (boundary >= 0) {
        processBlock(pending.slice(0, boundary));
        pending = pending.slice(boundary + 2);
        boundary = pending.indexOf("\n\n");
      }
    },
    finish() {
      if (!finished) {
        finished = true;
        const tail = decoder.decode();
        rawStreamText += tail;
        pending += tail;
        if (pending.trim()) processBlock(pending);
      }
      return snapshot(rawStreamText);
    },
  };
}
