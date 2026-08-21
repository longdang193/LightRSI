import {
  type ContextCleanerControlPlane,
  type ContextCleanerHostBridge,
} from "@lightrsi/cleaner";
import { loadSessionTaskRegistry } from "@lightrsi/history";
import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  countTextWithPreciseTokens,
  type ModelContextSnapshot,
} from "@lightrsi/host-adapter";

import { buildCodexEffectiveHistoryView, parseCodexRollout } from "../context-history/index.js";
import { codexSharedContextRewriteBackend } from "../context-rewrite/backend.js";
import { buildCodexLifecycleBackendRequest } from "../context-rewrite/lifecycle-input.js";
import {
  loadCodexSessionSnapshot,
} from "../session-state.js";
import { listCodexCleanerSessions } from "./session-catalog.js";

function validPersistableSnapshot(
  snapshot: ModelContextSnapshot,
  sessionId: string,
  revision: string,
): boolean {
  if (snapshot.schemaVersion !== MODEL_CONTEXT_REWRITE_SCHEMA_VERSION
    || snapshot.hostId !== "codex"
    || snapshot.sessionId !== sessionId
    || snapshot.revision !== revision
    || !snapshot.revision.trim()
    || Object.prototype.hasOwnProperty.call(snapshot, "adapterMetadata")) return false;
  const stableIds = new Set<string>();
  for (const item of snapshot.items) {
    if (!item.stableId.trim()
      || stableIds.has(item.stableId)
      || !item.fingerprint.trim()
      || !Number.isSafeInteger(item.chars)
      || item.chars < 0) return false;
    stableIds.add(item.stableId);
  }
  return true;
}

export function createCodexContextCleanerBridge(params: {
  stateDir: string;
  controlPlane: ContextCleanerControlPlane;
}): ContextCleanerHostBridge {
  return {
    hostId: "codex",
    rewriteMode: "response_chain_rebase",
    async listSessions() {
      return listCodexCleanerSessions(params.stateDir);
    },
    async readCleanSnapshot(sessionId) {
      const session = await loadCodexSessionSnapshot(params.stateDir, sessionId);
      if (!session) throw new Error("codex_clean_session_not_found");
      const view = await buildCodexEffectiveHistoryView({
        stateDir: params.stateDir,
        sessionId,
        headResponseId: session.latestResponseId,
        async rolloutViewBootstrap() {
          if (!session.transcriptPath) return null;
          return (await parseCodexRollout(session.transcriptPath))?.view ?? null;
        },
      });
      if (view.history.incomplete
        || !view.semanticComplete
        || view.reasonCodes.length > 0
        || view.history.deferredItems.length > 0
        || view.history.unresolvedCallIds.length > 0) {
        throw new Error("codex_clean_snapshot_incomplete");
      }
      const registry = await loadSessionTaskRegistry(params.stateDir, sessionId);
      if (registry.sessionId !== sessionId) {
        throw new Error("codex_clean_registry_session_mismatch");
      }
      const model = session.latestModel?.trim() || undefined;
      const backendRequest = buildCodexLifecycleBackendRequest({
        view,
        registry,
        request: {
          sessionId,
          payload: {
            ...(model ? { model } : {}),
            ...(session.latestResponseId
              ? { previous_response_id: session.latestResponseId }
              : {}),
            input: [],
          },
          effectiveHistory: view.history,
          currentInput: [],
        },
      });
      const backendSnapshot = await codexSharedContextRewriteBackend.readSnapshot({
        sessionId,
        request: backendRequest,
      });
      const sourceItems = [
        ...view.history.replayableItems,
        ...view.history.observationOnlyItems,
        ...view.history.deferredItems,
      ];
      const sourceItemsById = new Map(
        sourceItems.map((item) => [item.stableItemId, item] as const),
      );
      const { adapterMetadata: _adapterMetadata, ...persistableSnapshot } = backendSnapshot;
      if (!validPersistableSnapshot(persistableSnapshot, sessionId, view.history.revision)
        || sourceItemsById.size !== sourceItems.length
        || sourceItems.length !== persistableSnapshot.items.length
        || persistableSnapshot.items.some((item) => !sourceItemsById.has(item.stableId))) {
        throw new Error("codex_clean_snapshot_invalid");
      }
      if (Number.isNaN(Date.parse(session.updatedAt))) {
        throw new Error("codex_clean_snapshot_timestamp_invalid");
      }
      const counts = model
        ? persistableSnapshot.items.map((item) => {
            const sourceItem = sourceItemsById.get(item.stableId)!;
            return [
              item.stableId,
              countTextWithPreciseTokens(model, JSON.stringify(sourceItem.item)),
            ] as const;
          })
        : [];
      const exact = counts.length > 0 && counts.every(([, count]) => count.mode === "openai_tokens");
      return {
        ...persistableSnapshot,
        capturedAt: session.updatedAt,
        ...(model ? { model } : {}),
        tokenCountMode: exact ? "exact" : "chars_only",
        tokenCountMethod: exact ? "openai_tokenizer" : "utf16_chars",
        ...(exact
          ? { itemTokenCounts: Object.fromEntries(counts.map(([itemId, count]) => [itemId, count.count])) }
          : {}),
      };
    },
    executeApprovedClean: (request) => params.controlPlane.executeApprovedClean(request),
    readCleanReceipt: (planId) => params.controlPlane.readCleanReceipt(planId),
    cancelCleanPlan: (planId) => params.controlPlane.cancelCleanPlan(planId),
  };
}
