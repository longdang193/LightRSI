import type {
  CodexEffectiveHistory,
  CodexEffectiveHistoryItem,
  JsonObject,
} from "../context-history/types.js";

export type {
  CodexEffectiveHistory,
  CodexEffectiveHistoryItem,
  JsonObject,
} from "../context-history/types.js";

export type CodexContextRewriteConfig = {
  enabled: boolean;
  mode: "response_chain_rebase";
  failureMode: "bypass";
  retryOriginalRequest: boolean;
  cooldownMs: number;
};

export type CodexMutationPlan = {
  operations: Array<{
    type: string;
    stableItemId?: string;
  }>;
};

export type CodexRebaseValidation = {
  valid: boolean;
  reasons: string[];
  evictedStableItemIds: string[];
};

export type CodexRebaseRequestResult = {
  payload: JsonObject;
  oldRevision: string;
  rebaseRevision: string;
};

export type CodexUpstreamResponse = {
  status: number;
  headers: Record<string, string>;
  text: string;
};

export type CodexRebaseFallbackResult = {
  response: CodexUpstreamResponse;
  outcome: "committed" | "bypassed" | "failed";
  newResponseId?: string;
  rebaseResponse?: CodexUpstreamResponse;
  cooldown?: {
    planId: string;
    startedAt: string;
    reason: string;
  };
};

export type CodexContextRewriteResult = {
  payload: JsonObject;
  outcome: "disabled" | "deferred";
  rebaseAttempted: boolean;
};

export type CodexUpstreamSender = (payload: JsonObject) => Promise<CodexUpstreamResponse>;
