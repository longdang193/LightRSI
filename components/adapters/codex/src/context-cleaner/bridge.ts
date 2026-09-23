import { createHash } from "node:crypto";
import { createCodexResponsesPayloadCodec } from "../responses-codec.js";

import {
  CONTEXT_CLEAN_SCHEMA_VERSION,
  sameCanonicalValue,
  type CacheReleasePreview,
  type ContextPressureEvidence,
  type ContextPressureObservation,
  type ContextCleanerControlPlane,
  type ContextCleanerSchedulingControlPlane,
  type ContextCleanerHostBridge,
  type ContextCleanHistoryEvidence,
  type ContextCleanReceipt,
  type ContextCleanSnapshot,
  type ExecuteApprovedContextCleanParams,
} from "@lightrsi/cleaner";
import {
  createEmptySessionTaskRegistry,
  type SessionTaskRegistry,
} from "@lightrsi/history";
import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  type ContextMutationPlan,
  type ContextRewritePreview,
  type ModelContextSnapshot,
} from "@lightrsi/host-adapter";
import type { JsonObject } from "../context-history/types.js";

import { buildCodexEffectiveHistoryView, parseCodexRollout } from "../context-history/index.js";
import { buildCodexRawSemanticTurns } from "../context-rewrite/semantic-mapping.js";
import { codexSharedContextRewriteBackend } from "../context-rewrite/backend.js";
import { buildCodexLifecycleBackendRequest } from "../context-rewrite/lifecycle-input.js";
import {
  loadCodexSessionSnapshot,
} from "../session-state.js";
import {
  appendCodexCleanerTerminal,
  scheduleCodexCleanerPlan,
} from "./scheduler.js";
import { listCodexCleanerSessions } from "./session-catalog.js";

const CODEX_HOST_ID = "codex";
const MAX_DUPLICATE_GROUPS = 20;
const MAX_DUPLICATE_OCCURRENCES = 20;

const DUPLICATE_ID_KEYS = new Set([
  "id",
  "call_id",
  "callId",
  "response_id",
  "responseId",
  "request_id",
  "requestId",
  "stableItemId",
  "occurrenceId",
]);

function canonicalDuplicateValue(value: unknown, topLevel = false): unknown {
  if (Array.isArray(value)) return value.map((child) => canonicalDuplicateValue(child));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !topLevel || !DUPLICATE_ID_KEYS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalDuplicateValue(child)]),
  );
}

function duplicateContentDigest(item: JsonObject): string {
  const payloadKind = typeof item.type === "string" && item.type.trim()
    ? item.type.trim()
    : typeof item.role === "string" && item.role.trim()
      ? item.role.trim()
      : "unknown";
  return createHash("sha256")
    .update(Buffer.from(JSON.stringify({ payloadKind, content: canonicalDuplicateValue(item, true) }), "utf8"))
    .digest("hex");
}

export function collectCodexDuplicateEvidence(items: readonly {
  stableId: string;
  item: JsonObject;
  chars: number;
}[]): Array<{
  contentDigest: string;
  occurrenceIds: string[];
  occurrenceCount: number;
  combinedChars: number;
}> {
  const groups = new Map<string, { occurrenceIds: string[]; combinedChars: number }>();
  for (const entry of items) {
    const digest = duplicateContentDigest(entry.item);
    const group = groups.get(digest) ?? { occurrenceIds: [], combinedChars: 0 };
    group.occurrenceIds.push(entry.stableId);
    group.combinedChars += entry.chars;
    groups.set(digest, group);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.occurrenceIds.length > 1)
    .map(([contentDigest, group]) => ({
      contentDigest,
      occurrenceIds: group.occurrenceIds,
      occurrenceCount: group.occurrenceIds.length,
      combinedChars: group.combinedChars,
    }));
}

function validPressureObservation(observation: ContextPressureObservation, revision: string): boolean {
  return Number.isSafeInteger(observation.usedTokens)
    && observation.usedTokens >= 0
    && Number.isSafeInteger(observation.contextLimitTokens)
    && observation.contextLimitTokens > 0
    && Number.isSafeInteger(observation.reservedOutputTokens)
    && observation.reservedOutputTokens >= 0
    && observation.observedRevision === revision
    && Number.isFinite(Date.parse(observation.observedAt));
}

export function assessCodexContextPressure(params: {
  revision: string;
  providerUsage?: ContextPressureObservation;
  tokenEstimate?: ContextPressureObservation;
}): ContextPressureEvidence {
  const source = params.providerUsage ? "provider_usage" : params.tokenEstimate ? "token_estimate" : "unavailable";
  const observation = params.providerUsage ?? params.tokenEstimate;
  if (!observation || !validPressureObservation(observation, params.revision)) {
    return {
      level: "unknown",
      source,
      ...(observation?.observedRevision ? { observedRevision: observation.observedRevision } : {}),
      ...(observation?.observedAt ? { observedAt: observation.observedAt } : {}),
    };
  }
  const availableTokens = observation.contextLimitTokens - observation.reservedOutputTokens;
  if (availableTokens <= 0) {
    return {
      level: "unknown",
      source,
      observedRevision: observation.observedRevision,
      observedAt: observation.observedAt,
    };
  }
  const ratio = observation.usedTokens / availableTokens;
  return {
    level: ratio < 0.7 ? "normal" : ratio <= 0.85 ? "elevated" : "critical",
    source,
    observedRevision: observation.observedRevision,
    observedAt: observation.observedAt,
  };
}

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
  const occurrenceIds = (request.occurrenceSelections ?? [])
    .map((selection) => selection.stableId);
  if ((request.occurrenceSelections ?? []).some((selection) => (
    !selection.stableId.trim()
    || !selection.fingerprint.trim()
    || !Array.isArray(selection.completionEvidence)
    || !Array.isArray(selection.retainedFindings)
    || (selection.nothingReusable !== undefined && typeof selection.nothingReusable !== "boolean")
    || typeof selection.continuingUseful !== "boolean"
    || selection.releaseIntent !== "release"
    || !["none", "outgoing"].includes(selection.dependencyDirection)
  ))) {
    throw new Error("codex_clean_approval_invalid");
  }
  if (!request.cleanPlanId.trim()
    || !request.sessionId.trim()
    || !request.baseRevision.trim()
    || !canonicalTimestamp(request.approvedAt)
    || (request.selectedTaskIds.length === 0 && occurrenceIds.length === 0)) {
    throw new Error("codex_clean_approval_invalid");
  }
  const taskIds = normalizedUniqueStrings(request.selectedTaskIds);
  if (request.selectedTaskIds.length > 0 && !taskIds) throw new Error("codex_clean_approval_invalid");
  if (new Set(occurrenceIds).size !== occurrenceIds.length) throw new Error("codex_clean_approval_invalid");
  return taskIds ?? [];
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
  occurrenceSelections?: ExecuteApprovedContextCleanParams["occurrenceSelections"];
}): ContextCleanReceipt {
  const { receipt } = params;
  const selectedTaskIds = normalizedUniqueStrings(receipt.selectedTaskIds);
  if (receipt.schemaVersion !== CONTEXT_CLEAN_SCHEMA_VERSION
    || receipt.hostId !== CODEX_HOST_ID
    || receipt.planId !== params.planId
    || (params.sessionId !== undefined && receipt.sessionId !== params.sessionId)
    || !canonicalTimestamp(receipt.updatedAt)
    || selectedTaskIds === undefined
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
  if (params.occurrenceSelections !== undefined
    && !sameCanonicalValue(
      params.occurrenceSelections,
      receipt.evidence?.occurrenceSelections ?? [],
    )) {
    throw new Error("codex_clean_receipt_mismatch");
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
  boundSessionId?: string;
  providerUsage?: ContextPressureObservation;
  tokenEstimate?: ContextPressureObservation;
}): ContextCleanerHostBridge {
  async function readCleanSnapshotWithRegistry(
    sessionId: string,
    registry: SessionTaskRegistry,
    includeDuplicates = false,
  ): Promise<ContextCleanSnapshot> {
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
    const snapshotItemsById = new Map(persistableSnapshot.items.map((item) => [item.stableId, item] as const));
    if (!validPersistableSnapshot(persistableSnapshot, sessionId, view.history.revision)
      || sourceItemsById.size !== sourceItems.length
      || sourceItems.length !== persistableSnapshot.items.length
      || persistableSnapshot.items.some((item) => !sourceItemsById.has(item.stableId))) {
      throw new Error("codex_clean_snapshot_invalid");
    }
    if (Number.isNaN(Date.parse(session.updatedAt))) {
      throw new Error("codex_clean_snapshot_timestamp_invalid");
    }
    return {
      ...persistableSnapshot,
      capturedAt: session.updatedAt,
      ...(model ? { model } : {}),
      tokenCountMode: "chars_only",
      tokenCountMethod: "utf16_chars",
      historyEvidence,
      ...(includeDuplicates
        ? (() => {
            const groups = collectCodexDuplicateEvidence(sourceItems.map((entry) => ({
              stableId: entry.stableItemId,
              item: entry.item,
              chars: snapshotItemsById.get(entry.stableItemId)?.chars ?? 0,
            })));
            return {
              duplicateEvidence: groups.slice(0, MAX_DUPLICATE_GROUPS).map((group) => ({
                ...group,
                occurrenceIds: group.occurrenceIds.slice(0, MAX_DUPLICATE_OCCURRENCES),
                ...(group.occurrenceIds.length > MAX_DUPLICATE_OCCURRENCES
                  ? { omittedOccurrenceCount: group.occurrenceIds.length - MAX_DUPLICATE_OCCURRENCES }
                  : {}),
              })),
              duplicateEvidenceOmittedGroupCount: Math.max(0, groups.length - MAX_DUPLICATE_GROUPS),
              duplicateEvidenceStatus: "available" as const,
            };
          })()
        : { duplicateEvidenceStatus: "unavailable" as const }),
      contextPressure: assessCodexContextPressure({
        revision: view.history.revision,
        providerUsage: params.providerUsage,
        tokenEstimate: params.tokenEstimate,
      }),
    };
  }

  async function readRewriteState(sessionId: string) {
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
    const model = session.latestModel?.trim() || undefined;
    const backendRequest = buildCodexLifecycleBackendRequest({
      view,
      registry: createEmptySessionTaskRegistry(sessionId),
      request: {
        sessionId,
        payload: {
          ...(model ? { model } : {}),
          ...(session.latestResponseId ? { previous_response_id: session.latestResponseId } : {}),
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
    const { adapterMetadata: _adapterMetadata, ...persistableSnapshot } = backendSnapshot;
    if (!validPersistableSnapshot(persistableSnapshot, sessionId, view.history.revision)) {
      throw new Error("codex_clean_snapshot_invalid");
    }
    return { session, view, backendRequest, backendSnapshot, persistableSnapshot };
  }

  return {
    hostId: CODEX_HOST_ID,
    rewriteMode: "response_chain_rebase",
    async listSessions() {
      return listCodexCleanerSessions(params.stateDir);
    },
    async readCleanSnapshot(sessionId, options) {
      return readCleanSnapshotWithRegistry(
        sessionId,
        createEmptySessionTaskRegistry(sessionId),
        options?.includeDuplicates === true,
      );
    },
    async previewCleanRelease({ sessionId, baseRevision, occurrences }) {
      const state = await readRewriteState(sessionId);
      if (state.view.history.revision !== baseRevision) {
        throw new Error("clean_preview_revision_stale");
      }
      const itemById = new Map(state.persistableSnapshot.items.map((item) => [item.stableId, item]));
      const selectedIds = occurrences.map((occurrence) => occurrence.stableId);
      if (occurrences.length === 0 || new Set(selectedIds).size !== selectedIds.length
        || occurrences.some((occurrence) => itemById.get(occurrence.stableId)?.fingerprint !== occurrence.fingerprint)) {
        throw new Error("clean_preview_occurrence_invalid");
      }
      const operations = occurrences.map((occurrence, index) => ({
        id: `preview-${index}`,
        type: "remove" as const,
        targetItemIds: [occurrence.stableId],
        targetItemFingerprints: { [occurrence.stableId]: occurrence.fingerprint },
        rationale: "inspection preview",
        estimatedSavedChars: itemById.get(occurrence.stableId)?.chars ?? 0,
      }));
      const plan: ContextMutationPlan = {
        schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
        planId: `ctxclean-preview-${createHash("sha256").update(JSON.stringify({ baseRevision, selectedIds })).digest("hex").slice(0, 24)}`,
        hostId: CODEX_HOST_ID,
        sessionId,
        baseRevision,
        sourceModuleId: "context-cleaner-preview",
        operations,
        createdAt: state.session.updatedAt,
      };
      const candidate: ContextRewritePreview<typeof state.backendRequest, unknown> =
        await codexSharedContextRewriteBackend.apply({
          snapshot: state.backendSnapshot,
          plan,
          request: state.backendRequest,
        });
      const historyItems = [
        ...state.view.history.replayableItems,
        ...state.view.history.observationOnlyItems,
        ...state.view.history.deferredItems,
      ];
      const firstChanged = historyItems.findIndex((item) => selectedIds.includes(item.stableItemId));
      const grossSavedChars = occurrences.reduce(
        (sum, occurrence) => sum + (itemById.get(occurrence.stableId)?.chars ?? 0),
        0,
      );
      const codec = createCodexResponsesPayloadCodec();
      const beforeEncoded = JSON.stringify(codec.encodeRequest(codec.decodeRequest(state.backendRequest.payload)));
      const afterEncoded = JSON.stringify(codec.encodeRequest(codec.decodeRequest(candidate.request.payload)));
      const encodingComparable = beforeEncoded !== undefined && afterEncoded !== undefined;
      return {
        selectedOccurrenceCount: occurrences.length,
        validatedOccurrenceCount: occurrences.length,
        deferredOccurrenceCount: 0,
        rejectedOccurrenceCount: 0,
        grossSavedChars,
        netSavedChars: encodingComparable ? beforeEncoded.length - afterEncoded.length : null,
        netSavedBytes: encodingComparable
          ? Buffer.byteLength(beforeEncoded, "utf8") - Buffer.byteLength(afterEncoded, "utf8")
          : null,
        ...(firstChanged >= 0 ? { earliestChangedHistoryItem: historyItems[firstChanged]!.stableItemId } : {}),
        unchangedPrefixItemCount: firstChanged >= 0 ? firstChanged : historyItems.length,
        providerCacheOutcome: "unknown",
        baseRevision,
      } satisfies CacheReleasePreview;
    },
    async executeApprovedClean(request) {
      if ((request.occurrenceSelections?.length ?? 0) > 0 && !params.boundSessionId) {
        throw new Error("codex_clean_approval_session_binding_required");
      }
      if (params.boundSessionId && params.boundSessionId !== request.sessionId) {
        throw new Error("codex_clean_approval_session_binding_mismatch");
      }
      const selectedTaskIds = validateApprovedRequest(request);
      if (isSchedulingControlPlane(params.controlPlane)) {
        const approved = validateReceipt({
          receipt: await params.controlPlane.approveCleanSelection(request),
          planId: request.cleanPlanId,
          sessionId: request.sessionId,
          selectedTaskIds,
          occurrenceSelections: request.occurrenceSelections,
        });
        if (approved.status !== "approved") return approved;
        const scheduled = await scheduleCodexCleanerPlan({
          stateDir: params.stateDir,
          sessionId: request.sessionId,
          cleanPlanId: request.cleanPlanId,
          baseRevision: request.baseRevision,
          selectedTaskIds,
          occurrenceSelections: request.occurrenceSelections,
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
            occurrenceSelections: request.occurrenceSelections,
            scheduledAt: approved.updatedAt,
            evidence: approved.evidence,
          }),
          planId: request.cleanPlanId,
          sessionId: request.sessionId,
          selectedTaskIds,
          occurrenceSelections: request.occurrenceSelections,
        });
      }
      const receipt = validateReceipt({
        receipt: await params.controlPlane.executeApprovedClean(request),
        planId: request.cleanPlanId,
        sessionId: request.sessionId,
        selectedTaskIds,
        occurrenceSelections: request.occurrenceSelections,
      });
      if (receipt.status === "scheduled") {
        const scheduled = await scheduleCodexCleanerPlan({
          stateDir: params.stateDir,
          sessionId: request.sessionId,
          cleanPlanId: request.cleanPlanId,
          baseRevision: request.baseRevision,
          selectedTaskIds,
          occurrenceSelections: request.occurrenceSelections,
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
      const receipt = validateReceipt({
        receipt: await params.controlPlane.cancelCleanPlan(planId),
        planId,
      });
      if (receipt.status === "stale" || receipt.status === "cancelled" || receipt.status === "failed") {
        const terminal = await appendCodexCleanerTerminal({
          stateDir: params.stateDir,
          sessionId: receipt.sessionId,
          cleanPlanId: receipt.planId,
          receiptStatus: receipt.status,
          reasons: receipt.reasons,
          updatedAt: receipt.updatedAt,
        });
        if (!["transitioned", "unchanged", "missing"].includes(terminal.outcome)) {
          throw new Error(`codex_clean_schedule_terminal_failed:${terminal.reasons.join(",")}`);
        }
      }
      return receipt;
    },
  };
}
