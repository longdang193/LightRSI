import type {
  ModelContextRewriteMode,
  ModelContextSnapshot,
} from "@lightrsi/host-adapter";

export const CONTEXT_CLEAN_SCHEMA_VERSION = 1 as const;

export type ContextCleanTokenCountMode = "exact" | "estimated" | "chars_only";

export type ContextCleanLifecycleState =
  | "active"
  | "unresolved"
  | "completed"
  | "aborted"
  | "unknown";

export type ContextCleanRecommendation = "clean" | "keep" | "protected";

export type ContextCleanStatus =
  | "analyzed"
  | "approved"
  | "scheduled"
  | "applied"
  | "stale"
  | "cancelled"
  | "failed";

export type ContextCleanTaskBreakdown = {
  taskId: string;
  label: string;
  description: string;
  summary: string;
  lifecycleState: ContextCleanLifecycleState;
  itemIds: string[];
  /** Digests captured at analysis time, keyed by stable item id. */
  itemDigests: Record<string, string>;
  tokenCount: number | null;
  charCount: number;
  tokenPercent: number | null;
  recallCount?: number;
  recommendation: ContextCleanRecommendation;
  reasonCodes: string[];
  selectable: boolean;
};

export type ContextCleanPlan = {
  schemaVersion: typeof CONTEXT_CLEAN_SCHEMA_VERSION;
  planId: string;
  hostId: string;
  sessionId: string;
  baseRevision: string;
  model?: string;
  contextWindowTokens?: number;
  usedTokens: number | null;
  usedChars: number;
  protectedTokens: number | null;
  protectedChars: number;
  unassignedTokens: number | null;
  unassignedChars: number;
  tokenCountMode: ContextCleanTokenCountMode;
  tokenCountMethod: string;
  tasks: ContextCleanTaskBreakdown[];
  createdAt: string;
};

export type ContextCleanEvidence = {
  previousRevision?: string;
  nextRevision?: string;
  operationIds?: string[];
  itemIds?: string[];
  eventIds?: string[];
  archiveRefs?: string[];
  providerResponseId?: string;
};

export type ContextCleanReceipt = {
  schemaVersion: typeof CONTEXT_CLEAN_SCHEMA_VERSION;
  planId: string;
  hostId: string;
  sessionId: string;
  status: ContextCleanStatus;
  selectedTaskIds: string[];
  estimatedSavedTokens: number | null;
  estimatedSavedChars: number;
  appliedSavedTokens?: number | null;
  appliedSavedChars?: number;
  tokenCountMode: ContextCleanTokenCountMode;
  deferredTaskIds: string[];
  fallbackUsed: boolean;
  reasons: string[];
  evidence?: ContextCleanEvidence;
  updatedAt: string;
};

export type ContextCleanSnapshot = ModelContextSnapshot & {
  capturedAt: string;
  model?: string;
  tokenCountMode: ContextCleanTokenCountMode;
  tokenCountMethod: string;
  itemTokenCounts?: Record<string, number>;
};

export type ContextCleanerSession = {
  sessionId: string;
  updatedAt?: string;
};

export type ExecuteApprovedContextCleanParams = {
  cleanPlanId: string;
  sessionId: string;
  baseRevision: string;
  selectedTaskIds: string[];
};

export interface ContextCleanerHostBridge {
  readonly hostId: string;
  readonly rewriteMode: ModelContextRewriteMode;
  listSessions(): Promise<ContextCleanerSession[]>;
  readCleanSnapshot(sessionId: string): Promise<ContextCleanSnapshot>;
  executeApprovedClean(
    params: ExecuteApprovedContextCleanParams,
  ): Promise<ContextCleanReceipt>;
  readCleanReceipt(planId: string): Promise<ContextCleanReceipt | undefined>;
  cancelCleanPlan(planId: string): Promise<ContextCleanReceipt>;
}

/**
 * Shared control-plane operations supplied by the Cleaner owner. Host adapters
 * consume this boundary; they do not implement plan persistence themselves.
 */
export type ContextCleanerControlPlane = Pick<
  ContextCleanerHostBridge,
  "executeApprovedClean" | "readCleanReceipt" | "cancelCleanPlan"
>;
