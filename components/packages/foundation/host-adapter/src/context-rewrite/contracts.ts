export const MODEL_CONTEXT_REWRITE_SCHEMA_VERSION = 1 as const;

export type ModelContextRewriteMode =
  | "canonical"
  | "request_overlay"
  | "response_chain_rebase"
  | "none";

export type ContextItemKind =
  | "system"
  | "developer"
  | "user"
  | "assistant"
  | "reasoning"
  | "tool_call"
  | "tool_result"
  | "compaction"
  | "unknown";

export type ContextItemRef = {
  stableId: string;
  kind: ContextItemKind;
  role?: string;
  callId?: string;
  responseId?: string;
  taskIds?: string[];
  fingerprint: string;
  chars: number;
};

/**
 * Adapter metadata may retain host-native values in memory. Shared persistence
 * must omit raw payloads and preserve only explicitly safe metadata.
 */
export type ModelContextSnapshot = {
  schemaVersion: typeof MODEL_CONTEXT_REWRITE_SCHEMA_VERSION;
  hostId: string;
  sessionId: string;
  revision: string;
  items: ContextItemRef[];
  adapterMetadata?: Record<string, unknown>;
};

export type ContextMutationOperation = {
  id: string;
  type: "remove" | "replace";
  targetItemIds: string[];
  replacementItems?: unknown[];
  taskIds?: string[];
  rationale: string;
  estimatedSavedChars: number;
  archiveRefs?: string[];
};

/** Persisted readers must ignore unknown fields from newer schema revisions. */
export type ContextMutationPlan = {
  schemaVersion: typeof MODEL_CONTEXT_REWRITE_SCHEMA_VERSION;
  planId: string;
  hostId: string;
  sessionId: string;
  baseRevision: string;
  sourceModuleId: string;
  sourcePresetId?: string;
  operations: ContextMutationOperation[];
  createdAt: string;
};

export type ContextRewriteValidation = {
  valid: boolean;
  applicableOperationIds: string[];
  deferredOperationIds: string[];
  reasons: string[];
};

export type ContextRewriteResult = {
  schemaVersion: typeof MODEL_CONTEXT_REWRITE_SCHEMA_VERSION;
  mode: ModelContextRewriteMode;
  planId: string;
  applied: boolean;
  changed: boolean;
  previousRevision: string;
  nextRevision: string;
  appliedOperationIds: string[];
  deferredOperationIds: string[];
  removedItemIds: string[];
  savedChars: number;
  fallbackUsed: boolean;
  details?: Record<string, unknown>;
};

export interface ModelContextRewriteBackend<TRequest = unknown> {
  readonly hostId: string;
  readonly mode: ModelContextRewriteMode;

  readSnapshot(params: {
    sessionId: string;
    request: TRequest;
  }): Promise<ModelContextSnapshot>;

  validate(params: {
    snapshot: ModelContextSnapshot;
    plan: ContextMutationPlan;
  }): Promise<ContextRewriteValidation>;

  apply(params: {
    snapshot: ModelContextSnapshot;
    plan: ContextMutationPlan;
    request: TRequest;
  }): Promise<{
    request: TRequest;
    result: ContextRewriteResult;
  }>;
}
