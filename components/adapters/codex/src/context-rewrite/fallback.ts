import { cloneJson } from "./shared.js";
import type {
  CodexRebaseFallbackResult,
  CodexUpstreamResponse,
  CodexUpstreamSender,
  JsonObject,
} from "./types.js";

function isSuccessfulResponse(response: CodexUpstreamResponse): boolean {
  return response.status >= 200 && response.status < 300;
}

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function responseIdFromObject(value: unknown): string | undefined {
  const object = asObject(value);
  if (!object) return undefined;
  if (typeof object.id === "string" && object.id) return object.id;
  const response = asObject(object.response);
  return typeof response?.id === "string" && response.id ? response.id : undefined;
}

function responseIdFromText(text: string): string | undefined {
  try {
    const responseId = responseIdFromObject(JSON.parse(text) as unknown);
    if (responseId) return responseId;
  } catch {
    // Streaming Responses use SSE rather than one JSON document.
  }

  for (const chunk of text.split(/\r?\n\r?\n/)) {
    const dataText = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n")
      .trim();
    if (!dataText || dataText === "[DONE]") continue;
    try {
      const responseId = responseIdFromObject(JSON.parse(dataText) as unknown);
      if (responseId) return responseId;
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function executeCodexRebaseWithFallback(params: {
  sessionId: string;
  planId: string;
  epochId: string;
  originalPayload: JsonObject;
  rebasedPayload: JsonObject;
  sendUpstream: CodexUpstreamSender;
}): Promise<CodexRebaseFallbackResult> {
  let rebaseResponse: CodexUpstreamResponse | undefined;
  let failureReason = "rebase_upstream_error";
  try {
    rebaseResponse = await params.sendUpstream(cloneJson(params.rebasedPayload));
    const newResponseId = isSuccessfulResponse(rebaseResponse)
      ? responseIdFromText(rebaseResponse.text)
      : undefined;
    if (newResponseId) {
      return {
        response: rebaseResponse,
        outcome: "committed",
        newResponseId,
        rebaseResponse,
      };
    }
    failureReason = isSuccessfulResponse(rebaseResponse)
      ? "rebase_response_id_missing"
      : "rebase_upstream_rejected";
  } catch {
    failureReason = "rebase_upstream_error";
  }

  const fallbackResponse = await params.sendUpstream(cloneJson(params.originalPayload));
  return {
    response: fallbackResponse,
    outcome: isSuccessfulResponse(fallbackResponse) ? "bypassed" : "failed",
    rebaseResponse,
    cooldown: {
      planId: params.planId,
      startedAt: new Date().toISOString(),
      reason: failureReason,
    },
  };
}
