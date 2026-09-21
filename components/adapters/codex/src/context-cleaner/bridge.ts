import {
  CONTEXT_CLEAN_SCHEMA_VERSION,
  CONTEXT_CLEAN_ATTRIBUTION_SUBMISSION_SCHEMA_VERSION,
  type ContextCleanAttributionSubmission,
  type ContextCleanAttributionSubmissionResult,
  type ContextCleanerControlPlane,
  type ContextCleanerSchedulingControlPlane,
  type ContextCleanerHostBridge,
  type ContextCleanAttributionStatus,
  type ContextCleanHistoryEvidence,
  type ContextCleanReceipt,
  type ExecuteApprovedContextCleanParams,
} from "@lightrsi/cleaner";
import { createHash } from "node:crypto";
import {
  mapTaskUpdatesToRegistryPatch,
  type SemanticTaskUpdate,
  type TaskStateEstimatorApiConfig,
} from "@lightrsi/eviction";
import {
  applySessionTaskRegistryPatch,
  loadSessionTaskRegistry,
  persistSessionTaskRegistry,
  sessionTaskRegistryPath,
} from "@lightrsi/history";
import { stat } from "node:fs/promises";
import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  countTextWithPreciseTokens,
  withContextMutationPlanSessionLock,
  type ModelContextSnapshot,
} from "@lightrsi/host-adapter";

import { buildCodexEffectiveHistoryView, parseCodexRollout } from "../context-history/index.js";
import { buildCodexRawSemanticTurns } from "../context-rewrite/semantic-mapping.js";
import { codexSharedContextRewriteBackend } from "../context-rewrite/backend.js";
import { resolveCodexTaskStateEstimator } from "../context-rewrite/estimator-config.js";
import { buildCodexLifecycleBackendRequest } from "../context-rewrite/lifecycle-input.js";
import {
  loadCodexSessionSnapshot,
} from "../session-state.js";
import { scheduleCodexCleanerPlan } from "./scheduler.js";
import { listCodexCleanerSessions } from "./session-catalog.js";

const CODEX_HOST_ID = "codex";

function canonicalTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function normalizedUniqueStrings(values: string[]): string[] | undefined {
  const normalized = values.map((value) => value.trim());
  return normalized.every(Boolean) && new Set(normalized).size === normalized.length
    ? normalized
    : undefined;
}

function nonNegativeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function nullableNonNegativeInteger(value: unknown): boolean {
  return value === null || nonNegativeInteger(value);
}

function submissionFingerprint(request: ContextCleanAttributionSubmission): string {
  return createHash("sha256")
    .update(JSON.stringify(request))
    .digest("hex");
}

function validAttributionSubmission(request: ContextCleanAttributionSubmission): boolean {
  return request.schemaVersion === CONTEXT_CLEAN_ATTRIBUTION_SUBMISSION_SCHEMA_VERSION
    && request.hostId === CODEX_HOST_ID
    && Boolean(request.submissionId.trim())
    && Boolean(request.sessionId.trim())
    && Boolean(request.callerId.trim())
    && Boolean(request.authorityRef.trim())
    && Boolean(request.evidenceRevision.trim())
    && canonicalTimestamp(request.submittedAt)
    && normalizedUniqueStrings(request.evidenceRefs) !== undefined
    && normalizedUniqueStrings(request.invalidationConditions) !== undefined
    && request.updates.length > 0
    && request.updates.every((update) => (
      Boolean(update.taskId.trim())
      && Boolean(update.objective.trim())
      && update.coveredOccurrenceRefs !== undefined
      && normalizedUniqueStrings(update.coveredOccurrenceRefs) !== undefined
      && update.coveredOccurrenceRefs.length > 0
    ));
}

function validReceiptState(receipt: ContextCleanReceipt): boolean {
  if (!nullableNonNegativeInteger(receipt.estimatedSavedTokens)
    || !nonNegativeInteger(receipt.estimatedSavedChars)
    || !["exact", "estimated", "chars_only"].includes(receipt.tokenCountMode)) {
    return false;
  }
  const record = receipt as unknown as Record<string, unknown>;
  if (receipt.status === "applied") {
    const evidence = receipt.evidence as unknown as Record<string, unknown> | undefined;
    return receipt.fallbackUsed === false
      && nullableNonNegativeInteger(receipt.appliedSavedTokens)
      && nonNegativeInteger(receipt.appliedSavedChars)
      && typeof evidence?.previousRevision === "string"
      && Boolean(evidence.previousRevision.trim())
      && typeof evidence?.nextRevision === "string"
      && Boolean(evidence.nextRevision.trim())
      && normalizedUniqueStrings(receipt.evidence.operationIds) !== undefined
      && receipt.evidence.operationIds.length > 0
      && normalizedUniqueStrings(receipt.evidence.itemIds) !== undefined
      && receipt.evidence.itemIds.length > 0;
  }
  if (!["analyzed", "approved", "scheduled", "stale", "cancelled", "failed"].includes(receipt.status)) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(record, "appliedSavedTokens")
    || Object.prototype.hasOwnProperty.call(record, "appliedSavedChars")) {
    return false;
  }
  return !["analyzed", "approved", "scheduled"].includes(receipt.status)
    || receipt.fallbackUsed === false;
}

function validateApprovedRequest(request: ExecuteApprovedContextCleanParams): string[] {
  if (request.schemaVersion !== CONTEXT_CLEAN_SCHEMA_VERSION) {
    throw new Error("codex_clean_approval_schema_mismatch");
  }
  if (request.hostId !== CODEX_HOST_ID) {
    throw new Error("codex_clean_approval_host_mismatch");
  }
  if (!request.cleanPlanId.trim()
    || !request.sessionId.trim()
    || !request.baseRevision.trim()
    || !canonicalTimestamp(request.approvedAt)
    || request.selectedTaskIds.length === 0) {
    throw new Error("codex_clean_approval_invalid");
  }
  const taskIds = normalizedUniqueStrings(request.selectedTaskIds);
  if (!taskIds) throw new Error("codex_clean_approval_invalid");
  return taskIds;
}

function isSchedulingControlPlane(
  controlPlane: ContextCleanerControlPlane,
): controlPlane is ContextCleanerSchedulingControlPlane {
  return typeof (controlPlane as Partial<ContextCleanerSchedulingControlPlane>).approveCleanSelection === "function"
    && typeof (controlPlane as Partial<ContextCleanerSchedulingControlPlane>).finalizeCleanSchedule === "function";
}

function validateReceipt(params: {
  receipt: ContextCleanReceipt;
  planId: string;
  sessionId?: string;
  selectedTaskIds?: string[];
}): ContextCleanReceipt {
  const { receipt } = params;
  const selectedTaskIds = normalizedUniqueStrings(receipt.selectedTaskIds);
  if (receipt.schemaVersion !== CONTEXT_CLEAN_SCHEMA_VERSION
    || receipt.hostId !== CODEX_HOST_ID
    || receipt.planId !== params.planId
    || (params.sessionId !== undefined && receipt.sessionId !== params.sessionId)
    || !canonicalTimestamp(receipt.updatedAt)
    || !selectedTaskIds
    || !validReceiptState(receipt)) {
    throw new Error("codex_clean_receipt_mismatch");
  }
  if (params.selectedTaskIds) {
    const expected = [...params.selectedTaskIds].sort();
    const actual = [...selectedTaskIds].sort();
    if (expected.length !== actual.length
      || expected.some((taskId, index) => taskId !== actual[index])) {
      throw new Error("codex_clean_receipt_mismatch");
    }
  }
  return receipt;
}

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

function scopedHistoryEvidence(params: {
  view: Awaited<ReturnType<typeof buildCodexEffectiveHistoryView>>;
  semanticReasonCodes: readonly string[];
  blockedTurnSeqs: readonly number[];
}): ContextCleanHistoryEvidence | undefined {
  const { view, semanticReasonCodes, blockedTurnSeqs } = params;
  if (blockedTurnSeqs.length === 0) return undefined;
  const hasScopedUnresolvedTool = semanticReasonCodes.includes("history_unresolved_tool_calls");
  const unscoped = semanticReasonCodes.some((reason) => (
    reason !== "semantic_source_incomplete"
    && !reason.startsWith("semantic_tool_")
    && !reason.startsWith("semantic_message_")
    && reason !== "history_unresolved_tool_calls"
    && !(reason === "history_replay_incomplete" && hasScopedUnresolvedTool)
  ));
  if (unscoped) return undefined;

  const itemIdsByTurnSeq = new Map<number, string[]>();
  for (const turn of view.turns) {
    itemIdsByTurnSeq.set(turn.turnSeq, [
      ...turn.inputItemIds,
      ...turn.outputItemIds,
    ]);
  }
  const protectedItemIds = [...new Set(
    blockedTurnSeqs.flatMap((turnSeq) => itemIdsByTurnSeq.get(turnSeq) ?? []),
  )].sort();
  if (protectedItemIds.length === 0) return undefined;
  return {
    completeness: "partial",
    protectedItemIds,
    reasonCodes: [...new Set(semanticReasonCodes)].sort(),
  };
}

function assessHistoryEvidence(
  view: Awaited<ReturnType<typeof buildCodexEffectiveHistoryView>>,
): {
  semantic: ReturnType<typeof buildCodexRawSemanticTurns>;
  historyEvidence: ContextCleanHistoryEvidence | undefined;
} {
  const semantic = buildCodexRawSemanticTurns(view);
  const complete = semantic.complete
    && !view.history.incomplete
    && view.reasonCodes.length === 0
    && view.history.deferredItems.length === 0
    && view.history.unresolvedCallIds.length === 0;
  return {
    semantic,
    historyEvidence: complete
      ? { completeness: "complete", protectedItemIds: [], reasonCodes: [] }
      : scopedHistoryEvidence({
          view,
          semanticReasonCodes: semantic.reasonCodes,
          blockedTurnSeqs: semantic.blockedTurnSeqs,
        }),
  };
}

export function createCodexContextCleanerBridge(params: {
  stateDir: string;
  controlPlane: ContextCleanerControlPlane;
  taskStateEstimator?: TaskStateEstimatorApiConfig;
}): ContextCleanerHostBridge {
  return {
    hostId: CODEX_HOST_ID,
    rewriteMode: "response_chain_rebase",
    async listSessions() {
      return listCodexCleanerSessions(params.stateDir);
    },
    async readAttributionStatus(sessionId): Promise<ContextCleanAttributionStatus> {
      let registryExists = false;
      try {
        const registry = await loadSessionTaskRegistry(params.stateDir, sessionId);
        if (Object.keys(registry.tasks).length > 0) return "available";
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") return "failing";
      }
      try {
        await stat(sessionTaskRegistryPath(params.stateDir, sessionId));
        registryExists = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") return "failing";
      }
      const estimator = resolveCodexTaskStateEstimator({ config: params.taskStateEstimator });
      if (estimator.status === "disabled") return "disabled";
      if (estimator.status !== "ready") return "failing";
      return registryExists ? "empty" : "waiting";
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
       const { historyEvidence } = assessHistoryEvidence(view);
      if (!historyEvidence) {
        throw new Error(`codex_clean_snapshot_incomplete:${view.reasonCodes.join(",") || "unknown"}`);
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
        historyEvidence,
      };
    },
    async submitAttribution(
      request: ContextCleanAttributionSubmission,
    ): Promise<ContextCleanAttributionSubmissionResult> {
      if (!validAttributionSubmission(request)) {
        throw new Error("codex_clean_attribution_submission_invalid");
      }
      const fingerprint = submissionFingerprint(request);
      return withContextMutationPlanSessionLock({
        stateDir: params.stateDir,
        sessionId: request.sessionId,
        run: async () => {
          const registry = await loadSessionTaskRegistry(params.stateDir, request.sessionId);
      const existing = registry.attributionSubmissions?.[request.submissionId];
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new Error("codex_clean_attribution_submission_conflict");
        }
        return {
          submissionId: request.submissionId,
          status: "replayed",
          registryVersion: existing.registryVersion,
          taskIds: [...existing.taskIds],
        };
      }

      const session = await loadCodexSessionSnapshot(params.stateDir, request.sessionId);
      if (!session) throw new Error("codex_clean_session_not_found");
      const view = await buildCodexEffectiveHistoryView({
        stateDir: params.stateDir,
        sessionId: request.sessionId,
        headResponseId: session.latestResponseId,
        async rolloutViewBootstrap() {
          if (!session.transcriptPath) return null;
          return (await parseCodexRollout(session.transcriptPath))?.view ?? null;
        },
      });
       const { historyEvidence } = assessHistoryEvidence(view);
       if (!historyEvidence) {
         throw new Error("codex_clean_attribution_evidence_stale");
       }
      if (view.history.revision !== request.evidenceRevision) {
        throw new Error("codex_clean_attribution_evidence_stale");
      }

      const turnByItemId = new Map<string, { absId: string; seq: number }>();
      for (const turn of view.turns) {
        for (const itemId of [...turn.inputItemIds, ...turn.outputItemIds]) {
          if (turnByItemId.has(itemId)) throw new Error("codex_clean_attribution_occurrence_shared");
          turnByItemId.set(itemId, { absId: turn.turnAbsId, seq: turn.turnSeq });
        }
      }
       const evidenceRefs = new Set(request.evidenceRefs);
       const allUpdateRefs = request.updates.flatMap((update) => update.coveredOccurrenceRefs ?? []);
       for (const ref of allUpdateRefs) evidenceRefs.add(ref);
       const protectedItemIds = new Set(historyEvidence.protectedItemIds);
       const resolved = [...evidenceRefs].map((ref) => {
         if (protectedItemIds.has(ref)) {
           throw new Error(`codex_clean_attribution_occurrence_uncertain:${ref}`);
         }
         const turn = turnByItemId.get(ref);
        if (!turn) throw new Error(`codex_clean_attribution_occurrence_invalid:${ref}`);
        return [ref, turn] as const;
      });
      const resolvedByRef = new Map(resolved);
      const occurrenceOwners = new Map<string, string>();
      for (const update of request.updates) {
        for (const ref of update.coveredOccurrenceRefs ?? []) {
          const previousOwner = occurrenceOwners.get(ref);
          if (previousOwner && previousOwner !== update.taskId.trim()) {
            throw new Error(`codex_clean_attribution_occurrence_ambiguous:${ref}`);
          }
          occurrenceOwners.set(ref, update.taskId.trim());
        }
      }
      const provenance = {
        submissionId: request.submissionId,
        callerId: request.callerId.trim(),
        authorityRef: request.authorityRef.trim(),
        evidenceRevision: request.evidenceRevision.trim(),
        evidenceRefs: [...evidenceRefs].sort(),
        invalidationConditions: [...request.invalidationConditions].sort(),
      };
      const updates: SemanticTaskUpdate[] = request.updates.map((update) => ({
        taskId: update.taskId.trim(),
        ...(update.title?.trim() ? { title: update.title.trim() } : {}),
        objective: update.objective.trim(),
        lifecycle: update.lifecycle,
        coveredOccurrenceRefs: [...(update.coveredOccurrenceRefs ?? [])],
        coveredTurnAbsIds: [...new Set((update.coveredOccurrenceRefs ?? []).map((ref) => {
          const turn = resolvedByRef.get(ref);
          if (!turn) throw new Error(`codex_clean_attribution_occurrence_invalid:${ref}`);
          return turn.absId;
        }))],
        ...(update.completionEvidence ? { completionEvidence: update.completionEvidence } : {}),
        ...(update.unresolvedQuestions ? { unresolvedQuestions: update.unresolvedQuestions } : {}),
        ...(update.currentSubgoal ? { currentSubgoal: update.currentSubgoal } : {}),
        ...(update.evictableReason ? { evictableReason: update.evictableReason } : {}),
        ...(update.retentionDecision ? { retentionDecision: update.retentionDecision } : {}),
        ...(update.dependencyDirection ? { dependencyDirection: update.dependencyDirection } : {}),
        decisionProvenance: provenance,
      }));
      const coveredTurnAbsIds = [...new Set(updates.flatMap((update) => update.coveredTurnAbsIds ?? []))];
      const coveredTurnSeqs = [...new Set(coveredTurnAbsIds.map((absId) => {
        const turn = [...resolvedByRef.values()].find((candidate) => candidate.absId === absId);
        return turn?.seq;
      }).filter((value): value is number => value !== undefined))].sort((left, right) => left - right);
      const toTurnSeqInclusive = coveredTurnSeqs.at(-1);
      if (toTurnSeqInclusive === undefined) throw new Error("codex_clean_attribution_occurrence_invalid");
      const mapped = mapTaskUpdatesToRegistryPatch({
        registry,
        updates,
        coveredTurnAbsIds,
        coveredTurnSeqs,
        toTurnSeqInclusive,
      });
      if (mapped.rejectedUpdates.length > 0) {
        throw new Error(`codex_clean_attribution_rejected:${mapped.rejectedUpdates.map((item) => item.reason).join(",")}`);
      }
      const taskIds = Object.keys(mapped.patch.upsertTasks ?? {});
      if (taskIds.length === 0) throw new Error("codex_clean_attribution_empty");
      const nextVersion = registry.version + 1;
      const next = applySessionTaskRegistryPatch(registry, {
        ...mapped.patch,
        attributionSubmissions: {
          [request.submissionId]: {
            fingerprint,
            taskIds,
            registryVersion: nextVersion,
            acceptedAt: request.submittedAt,
          },
        },
      });
      try {
        await persistSessionTaskRegistry(params.stateDir, next, { expectedVersion: registry.version });
      } catch {
        throw new Error("codex_clean_attribution_submission_conflict");
      }
      return {
        submissionId: request.submissionId,
        status: "accepted",
        registryVersion: next.version,
        taskIds,
      };
        },
      });
    },
    async executeApprovedClean(request) {
      const selectedTaskIds = validateApprovedRequest(request);
      if (isSchedulingControlPlane(params.controlPlane)) {
        const approved = validateReceipt({
          receipt: await params.controlPlane.approveCleanSelection(request),
          planId: request.cleanPlanId,
          sessionId: request.sessionId,
          selectedTaskIds,
        });
        if (approved.status !== "approved") return approved;
        const scheduled = await scheduleCodexCleanerPlan({
          stateDir: params.stateDir,
          sessionId: request.sessionId,
          cleanPlanId: request.cleanPlanId,
          baseRevision: request.baseRevision,
          selectedTaskIds,
          scheduledAt: approved.updatedAt,
        });
        if (scheduled.outcome !== "stored" && scheduled.outcome !== "unchanged") {
          throw new Error(`codex_clean_schedule_failed:${scheduled.reasons.join(",")}`);
        }
        return validateReceipt({
          receipt: await params.controlPlane.finalizeCleanSchedule({
            cleanPlanId: request.cleanPlanId,
            hostId: request.hostId,
            sessionId: request.sessionId,
            baseRevision: request.baseRevision,
            selectedTaskIds,
            scheduledAt: approved.updatedAt,
          }),
          planId: request.cleanPlanId,
          sessionId: request.sessionId,
          selectedTaskIds,
        });
      }
      const receipt = validateReceipt({
        receipt: await params.controlPlane.executeApprovedClean(request),
        planId: request.cleanPlanId,
        sessionId: request.sessionId,
        selectedTaskIds,
      });
      if (receipt.status === "scheduled") {
        const scheduled = await scheduleCodexCleanerPlan({
          stateDir: params.stateDir,
          sessionId: request.sessionId,
          cleanPlanId: request.cleanPlanId,
          baseRevision: request.baseRevision,
          selectedTaskIds,
          scheduledAt: receipt.updatedAt,
        });
        if (scheduled.outcome !== "stored" && scheduled.outcome !== "unchanged") {
          throw new Error(`codex_clean_schedule_failed:${scheduled.reasons.join(",")}`);
        }
      }
      return receipt;
    },
    async readCleanReceipt(planId) {
      if (!planId.trim()) throw new Error("codex_clean_plan_id_invalid");
      const receipt = await params.controlPlane.readCleanReceipt(planId);
      return receipt ? validateReceipt({ receipt, planId }) : undefined;
    },
    async cancelCleanPlan(planId) {
      if (!planId.trim()) throw new Error("codex_clean_plan_id_invalid");
      return validateReceipt({
        receipt: await params.controlPlane.cancelCleanPlan(planId),
        planId,
      });
    },
  };
}
