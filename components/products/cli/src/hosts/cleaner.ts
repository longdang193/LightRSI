import {
  createApiContextCleanRecommendationProvider,
  createContextCleanerControlService,
  createContextCleanerControlPlane,
  type ContextCleanRecommendationProvider,
  type ContextCleanAttributionSubmission,
  type ContextCleanAttributionSubmissionResult,
  type ContextCleanPlan,
  type ContextCleanReceipt,
  type ContextCleanSnapshot,
} from "@lightrsi/cleaner";
import type { TaskStateEstimatorApiConfig } from "@lightrsi/eviction";
import type { JsonModelApiConfig, JsonModelClient } from "@lightrsi/runtime-core";
import { resolveCodexTaskStateEstimator } from "../../../../adapters/codex/src/context-rewrite/estimator-config.js";
import { createCodexContextCleanerBridge } from "../../../../adapters/codex/src/context-cleaner/bridge.js";
import type { CleanCommandBackend } from "../clean.js";
import type { CleanInspectionView, CleanPlanView, CleanReceiptView } from "../clean-renderer.js";

export function createCodexCleanRecommendationProvider(
  config: TaskStateEstimatorApiConfig | undefined,
  createClient?: (config: JsonModelApiConfig) => JsonModelClient,
): ContextCleanRecommendationProvider | undefined {
  const resolution = resolveCodexTaskStateEstimator({ config });
  if (resolution.status !== "ready") return undefined;
  const apiConfig: JsonModelApiConfig = {
    baseUrl: resolution.config.baseUrl,
    apiKey: resolution.config.apiKey,
    model: resolution.config.model,
    requestTimeoutMs: resolution.config.requestTimeoutMs,
  };
  return createClient
    ? createApiContextCleanRecommendationProvider(apiConfig, createClient)
    : createApiContextCleanRecommendationProvider(apiConfig);
}

function planView(plan: ContextCleanPlan): CleanPlanView {
  return {
    planId: plan.planId, hostId: plan.hostId, sessionId: plan.sessionId,
    usedTokens: plan.usedTokens, usedChars: plan.usedChars,
    protectedTokens: plan.protectedTokens, protectedChars: plan.protectedChars,
    unassignedTokens: plan.unassignedTokens, unassignedChars: plan.unassignedChars,
    tokenCountMode: plan.tokenCountMode,
    attributionStatus: plan.attributionStatus,
    tasks: plan.tasks.map((task) => ({ ...task })),
  };
}

function receiptView(receipt: ContextCleanReceipt): CleanReceiptView {
  return {
    planId: receipt.planId, status: receipt.status, selectedTaskIds: [...receipt.selectedTaskIds],
    estimatedSavedTokens: receipt.estimatedSavedTokens, estimatedSavedChars: receipt.estimatedSavedChars,
    ...(receipt.status === "applied" ? { appliedSavedTokens: receipt.appliedSavedTokens, appliedSavedChars: receipt.appliedSavedChars } : {}),
    fallbackUsed: receipt.fallbackUsed, deferredTaskIds: [...receipt.deferredTaskIds], reasons: [...receipt.reasons],
  };
}

export function createCodexCleanCommandBackend(params: {
  stateDir: string;
  recommendationProvider?: ContextCleanRecommendationProvider;
  boundSessionId?: string;
}): CleanCommandBackend {
  const controlPlane = createContextCleanerControlPlane({ stateDir: params.stateDir });
  const bridge = createCodexContextCleanerBridge({
    stateDir: params.stateDir,
    controlPlane,
    boundSessionId: params.boundSessionId,
  });
  const service = createContextCleanerControlService({
    stateDir: params.stateDir,
    bridge,
    recommendationProvider: params.recommendationProvider,
  });
  return {
    async analyze(sessionId) { return planView(await service.analyze(sessionId)); },
    async inspect(sessionId) { return inspectionView(await service.inspect(sessionId)); },
    async readPlan(planId) { const plan = await service.readPlan(planId); return plan ? planView(plan) : undefined; },
    async approve(planId, selectedTaskIds) { return receiptView(await service.approve(planId, selectedTaskIds)); },
    async approveOccurrences(planId, selections) { return receiptView(await service.approveOccurrences(planId, selections)); },
    async releaseOccurrences(sessionId, selections) { return receiptView(await service.releaseOccurrences(sessionId, selections)); },
    async readReceipt(planId) { const receipt = await service.readReceipt(planId); return receipt ? receiptView(receipt) : undefined; },
    async cancel(planId) { return receiptView(await service.cancel(planId)); },
    async submitAttribution(request: ContextCleanAttributionSubmission): Promise<ContextCleanAttributionSubmissionResult> {
      return service.submitAttribution(request);
    },
  };
}

function inspectionView(snapshot: ContextCleanSnapshot): CleanInspectionView {
  return {
    hostId: snapshot.hostId,
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    occurrences: snapshot.items.map((item) => ({
      stableId: item.stableId,
      fingerprint: item.fingerprint,
      shape: [item.kind, item.role, item.callId ? `call:${item.callId}` : undefined].filter(Boolean).join(" "),
      chars: item.chars,
      protectionReason: item.kind === "system" || item.kind === "developer"
        ? "protocol_protected"
        : item.taskIds && item.taskIds.length > 0
          ? "task_attributed; release requires occurrence evidence"
          : "unassigned; release requires occurrence evidence",
    })),
  };
}
