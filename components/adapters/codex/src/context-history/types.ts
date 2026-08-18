export const CODEX_CONTEXT_HISTORY_REQUEST_SCHEMA = "lightrsi.codex.context-history.request/v1";
export const CODEX_CONTEXT_HISTORY_RESPONSE_SCHEMA = "lightrsi.codex.context-history.response/v1";
export const LIGHTMEM2_CODEX_CONTEXT_HISTORY_REQUEST_SCHEMA = "lightmem2.codex.context-history.request/v1";
export const LIGHTMEM2_CODEX_CONTEXT_HISTORY_RESPONSE_SCHEMA = "lightmem2.codex.context-history.response/v1";

export function isCodexContextHistoryRequestSchema(value: unknown): boolean {
  return value === CODEX_CONTEXT_HISTORY_REQUEST_SCHEMA
    || value === LIGHTMEM2_CODEX_CONTEXT_HISTORY_REQUEST_SCHEMA;
}

export function isCodexContextHistoryResponseSchema(value: unknown): boolean {
  return value === CODEX_CONTEXT_HISTORY_RESPONSE_SCHEMA
    || value === LIGHTMEM2_CODEX_CONTEXT_HISTORY_RESPONSE_SCHEMA;
}

export type JsonObject = Record<string, unknown>;

export type CodexJournalStatus = "pending" | "completed" | "failed" | "incomplete";

export type CodexRequestJournalEntry = {
  schema: typeof CODEX_CONTEXT_HISTORY_REQUEST_SCHEMA;
  kind: "request";
  requestId: string;
  sessionId: string;
  turnOrdinal: number;
  model?: string;
  stream: boolean;
  previousResponseId?: string;
  promptCacheKey?: string;
  inputItems: JsonObject[];
  committedInputItems?: JsonObject[];
  status: CodexJournalStatus;
  error?: string;
  observedAt: string;
};

export type CodexResponseOutputRef = {
  type?: string;
  itemId?: string;
  callId?: string;
};

export type CodexResponseJournalEntry = {
  schema: typeof CODEX_CONTEXT_HISTORY_RESPONSE_SCHEMA;
  kind: "response";
  requestId?: string;
  sessionId: string;
  responseId?: string;
  previousResponseId?: string | null;
  stream: boolean;
  outputItems: JsonObject[];
  outputItemRefs: CodexResponseOutputRef[];
  eventTypeCounts?: Record<string, number>;
  malformedEventCount?: number;
  malformedEventTypeCounts?: Record<string, number>;
  status: CodexJournalStatus;
  error?: string;
  observedAt: string;
};

export type CodexContextHistoryJournalEntry =
  | CodexRequestJournalEntry
  | CodexResponseJournalEntry;

export type CodexEffectiveHistoryItem = {
  stableItemId: string;
  nativeId?: string;
  callId?: string;
  item: JsonObject;
};

export type CodexEffectiveHistory = {
  revision: string;
  replayableItems: CodexEffectiveHistoryItem[];
  observationOnlyItems: CodexEffectiveHistoryItem[];
  deferredItems: CodexEffectiveHistoryItem[];
  unresolvedCallIds: string[];
  source: "proxy_journal" | "rollout_bootstrap" | "rollout_proxy_merge" | "empty";
  incomplete: boolean;
};

export type CodexEffectiveHistoryTurn = {
  turnSeq: number;
  turnAbsId: string;
  inputItemIds: string[];
  outputItemIds: string[];
};

export type CodexEffectiveHistoryReasonCode =
  | "journal_read_error"
  | "journal_malformed_lines"
  | "journal_malformed_stream"
  | "journal_committed_chain_incomplete"
  | "journal_history_without_committed_chain"
  | "journal_uncommitted_request"
  | "journal_uncommitted_response"
  | "journal_current_request_uncommitted"
  | "journal_turn_sequence_conflict"
  | "journal_turn_attribution_incomplete"
  | "history_replay_incomplete"
  | "history_deferred_items"
  | "history_unresolved_tool_calls"
  | "rollout_turn_boundary_unavailable"
  | "rollout_compaction_turn_boundary_unavailable"
  | "rollout_malformed_lines";

export type CodexEffectiveHistoryView = {
  history: CodexEffectiveHistory;
  turns: CodexEffectiveHistoryTurn[];
  semanticComplete: boolean;
  reasonCodes: CodexEffectiveHistoryReasonCode[];
};

export type CodexRolloutSessionMeta = {
  sessionId?: string;
  cwd?: string;
  originator?: string;
  cliVersion?: string;
  source?: string;
  modelProvider?: string;
};

export type CodexRolloutTaskEvidence = {
  completedTurnIds: string[];
  abortedTurnIds: string[];
};

export type CodexRolloutSnapshot = {
  history: CodexEffectiveHistory;
  view: CodexEffectiveHistoryView;
  sessionMeta?: CodexRolloutSessionMeta;
  malformedLineCount: number;
  unknownRecordTypeCounts: Record<string, number>;
  taskEvidence: CodexRolloutTaskEvidence;
  compactionBaselineApplied: boolean;
};
