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

export async function executeCodexRebaseWithFallback(params: {
  sessionId: string;
  planId: string;
  epochId: string;
  originalPayload: JsonObject;
  rebasedPayload: JsonObject;
  sendUpstream: CodexUpstreamSender;
}): Promise<CodexRebaseFallbackResult> {
  const rebaseResponse = await params.sendUpstream(cloneJson(params.rebasedPayload));
  if (isSuccessfulResponse(rebaseResponse)) {
    return {
      response: rebaseResponse,
      outcome: "committed",
      rebaseResponse,
    };
  }

  const fallbackResponse = await params.sendUpstream(cloneJson(params.originalPayload));
  return {
    response: fallbackResponse,
    outcome: isSuccessfulResponse(fallbackResponse) ? "bypassed" : "failed",
    rebaseResponse,
    cooldown: {
      planId: params.planId,
      startedAt: new Date().toISOString(),
      reason: "rebase_upstream_rejected",
    },
  };
}
