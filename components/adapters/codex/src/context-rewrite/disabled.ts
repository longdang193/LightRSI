import { cloneJson } from "./shared.js";
import type {
  CodexContextRewriteConfig,
  CodexContextRewriteResult,
  CodexEffectiveHistory,
  CodexMutationPlan,
  JsonObject,
} from "./types.js";

export async function applyCodexContextRewrite(params: {
  config: CodexContextRewriteConfig;
  sessionId: string;
  payload: JsonObject;
  effectiveHistory: CodexEffectiveHistory;
  mutationPlan: CodexMutationPlan;
}): Promise<CodexContextRewriteResult> {
  if (!params.config.enabled) {
    return {
      payload: cloneJson(params.payload),
      outcome: "disabled",
      rebaseAttempted: false,
    };
  }

  return {
    payload: cloneJson(params.payload),
    outcome: "deferred",
    rebaseAttempted: false,
  };
}
