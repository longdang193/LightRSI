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
  baseRevision?: string;
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
  accounting: CodexRebaseAccounting;
};

export const CODEX_REBASE_EPOCH_SCHEMA = "lightmem2.codex.rebase-epoch/v1";

export type CodexRebaseEpochStatus = "pending" | "committed" | "failed" | "rolled_back";

export type CodexRebaseAccounting = {
  plannedSavedChars: number;
  plannedSavedTokens: number;
  actuallyRemovedChars: number;
  actuallyRemovedTokens: number;
  rebaseReplayCostChars: number;
  rebaseReplayCostTokens: number;
  subsequentSavedCharsPerTurn: number;
  subsequentSavedTokensPerTurn: number;
  estimatorCostChars: number;
  estimatorCostTokens: number;
  fallbackExtraRequestCount: number;
  cacheColdMissCount: number;
  breakEvenTurn?: number;
};

export type CodexRebaseEpoch = {
  schema: typeof CODEX_REBASE_EPOCH_SCHEMA;
  epochId: string;
  sessionId: string;
  planId: string;
  oldPreviousResponseId: string;
  newResponseId?: string;
  oldRevision: string;
  newRevision?: string;
  status: CodexRebaseEpochStatus;
  failureReason?: string;
  accounting?: CodexRebaseAccounting;
  createdAt: string;
  updatedAt: string;
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
  epoch?: CodexRebaseEpoch;
  cooldown?: CodexRebaseCooldownNotice;
  capability?: CodexRebaseCapabilityNotice;
};

export type CodexRebaseEpochStoreParams = {
  stateDir: string;
  oldPreviousResponseId: string;
  oldRevision: string;
  newRevision?: string;
};

export const CODEX_REBASE_COOLDOWN_SCHEMA = "lightmem2.codex.rebase-cooldown/v1";

export type CodexRebaseCooldown = {
  schema: typeof CODEX_REBASE_COOLDOWN_SCHEMA;
  sessionId: string;
  planId: string;
  reason: string;
  startedAt: string;
  expiresAt: string;
};

export type CodexRebaseCooldownNotice = {
  planId: string;
  startedAt: string;
  expiresAt?: string;
  reason: string;
};

export type CodexRebaseCooldownStoreParams = {
  stateDir: string;
  cooldownMs: number;
  now?: string;
};

export const CODEX_REBASE_CAPABILITY_SCHEMA = "lightmem2.codex.rebase-capability/v1";

export type CodexRebaseCapabilityStatus = "supported" | "unsupported";

export type CodexRebaseCapability = {
  schema: typeof CODEX_REBASE_CAPABILITY_SCHEMA;
  provider: string;
  model: string;
  itemType: string;
  status: CodexRebaseCapabilityStatus;
  reason?: string;
  responseStatus?: number;
  errorCode?: string;
  observedAt: string;
};

export type CodexRebaseCapabilityNotice = {
  provider: string;
  model: string;
  itemTypes: string[];
  skippedItemTypes?: string[];
  supportedItemTypes?: string[];
  unsupportedItemTypes?: string[];
  reason?: string;
};

export type CodexRebaseCapabilityStoreParams = {
  stateDir: string;
  provider: string;
  model: string;
  now?: string;
};

export type CodexContextRewriteResult = {
  payload: JsonObject;
  outcome: "disabled" | "deferred";
  rebaseAttempted: boolean;
};

export type CodexUpstreamSender = (payload: JsonObject) => Promise<CodexUpstreamResponse>;
