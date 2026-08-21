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
  /** Protected context not attributed to a task, such as system instructions. */
  protectedTokens: number | null;
  protectedChars: number;
  /** Context that is neither task-attributed nor protected. */
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

type ContextCleanReceiptBase = {
  schemaVersion: typeof CONTEXT_CLEAN_SCHEMA_VERSION;
  planId: string;
  hostId: string;
  sessionId: string;
  selectedTaskIds: string[];
  estimatedSavedTokens: number | null;
  estimatedSavedChars: number;
  tokenCountMode: ContextCleanTokenCountMode;
  deferredTaskIds: string[];
  reasons: string[];
  updatedAt: string;
};

export type ContextCleanPendingReceipt = ContextCleanReceiptBase & {
  status: "analyzed" | "approved" | "scheduled";
  appliedSavedTokens?: never;
  appliedSavedChars?: never;
  evidence?: ContextCleanEvidence;
  fallbackUsed: false;
};

export type ContextCleanAppliedReceipt = ContextCleanReceiptBase & {
  status: "applied";
  appliedSavedTokens: number | null;
  appliedSavedChars: number;
  fallbackUsed: false;
  evidence: ContextCleanEvidence & {
    previousRevision: string;
    nextRevision: string;
    operationIds: string[];
    itemIds: string[];
  };
};

export type ContextCleanTerminalReceipt = ContextCleanReceiptBase & {
  status: "stale" | "cancelled" | "failed";
  appliedSavedTokens?: never;
  appliedSavedChars?: never;
  evidence?: ContextCleanEvidence;
  fallbackUsed: boolean;
};

export type ContextCleanReceipt =
  | ContextCleanPendingReceipt
  | ContextCleanAppliedReceipt
  | ContextCleanTerminalReceipt;

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

export type ApprovedContextCleanTask = Pick<
  ContextCleanTaskBreakdown,
  "taskId" | "itemIds" | "itemDigests"
>;

export type ExecuteApprovedContextCleanParams = {
  schemaVersion: typeof CONTEXT_CLEAN_SCHEMA_VERSION;
  cleanPlanId: string;
  hostId: string;
  sessionId: string;
  baseRevision: string;
  approvedAt: string;
  /** Exact task targets shown to and approved by the user. */
  selectedTasks: ApprovedContextCleanTask[];
};

export function isAppliedContextCleanReceipt(
  receipt: ContextCleanReceipt,
): receipt is ContextCleanAppliedReceipt {
  return receipt.status === "applied";
}

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
