export type JsonObject = Record<string, unknown>;

export type CodexContextRewriteConfig = {
  enabled: boolean;
  mode: "response_chain_rebase";
  failureMode: "bypass";
  retryOriginalRequest: boolean;
  cooldownMs: number;
};

export type CodexEffectiveHistoryItem = {
  stableItemId: string;
  nativeId?: string;
  item: JsonObject;
};

export type CodexEffectiveHistory = {
  revision: string;
  replayableItems: CodexEffectiveHistoryItem[];
  observationOnlyItems?: CodexEffectiveHistoryItem[];
};

export type CodexMutationPlan = {
  operations: Array<{
    type: string;
    stableItemId?: string;
  }>;
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
