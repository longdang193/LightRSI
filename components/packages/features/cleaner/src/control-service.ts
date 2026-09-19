import {
  CONTEXT_CLEAN_SCHEMA_VERSION,
  type ContextCleanPlan,
  type ContextCleanReceipt,
  type ContextCleanerHostBridge,
  type ContextCleanerSchedulingControlPlane,
  type ExecuteApprovedContextCleanParams,
} from "./contracts.js";
import { readContextCleanPlan } from "./clean-plan-store.js";
import { readContextCleanReceipt } from "./clean-receipt-store.js";
import {
  analyzeContextCleanSession,
  approveContextCleanSelection,
  cancelContextCleanPlan,
  finalizeContextCleanSchedule,
} from "./orchestrator.js";
import type { ContextCleanRecommendationProvider } from "./recommendation.js";

export interface ContextCleanerControlService {
  analyze(sessionId: string): Promise<ContextCleanPlan>;
  readPlan(planId: string): Promise<ContextCleanPlan | undefined>;
  approve(planId: string, selectedTaskIds: readonly string[]): Promise<ContextCleanReceipt>;
  readReceipt(planId: string): Promise<ContextCleanReceipt | undefined>;
  cancel(planId: string): Promise<ContextCleanReceipt>;
}

export function createContextCleanerControlPlane(params: {
  stateDir: string;
  now?: () => string;
}): ContextCleanerSchedulingControlPlane {
  const approveCleanSelection = (request: ExecuteApprovedContextCleanParams) => approveContextCleanSelection({
      stateDir: params.stateDir,
      request,
      now: params.now?.(),
    });
  return {
    executeApprovedClean: approveCleanSelection,
    approveCleanSelection,
    finalizeCleanSchedule: (request) => finalizeContextCleanSchedule({
      stateDir: params.stateDir,
      request,
    }),
    async readCleanReceipt(planId) {
      const result = await readContextCleanReceipt({ stateDir: params.stateDir, planId });
      if (result.bypassed) throw new Error(`clean_receipt_unavailable:${result.reasons.join(",")}`);
      return result.value;
    },
    cancelCleanPlan: (planId) => cancelContextCleanPlan({ stateDir: params.stateDir, planId, now: params.now?.() }),
  } satisfies ContextCleanerSchedulingControlPlane;
}

export function createContextCleanerControlService(params: {
  stateDir: string;
  bridge: ContextCleanerHostBridge;
  recommendationProvider?: ContextCleanRecommendationProvider;
  contextWindowTokens?: number;
  now?: () => string;
}): ContextCleanerControlService {
  const controlPlane = createContextCleanerControlPlane({ stateDir: params.stateDir, now: params.now });
  return {
    async analyze(sessionId) {
      const result = await analyzeContextCleanSession({
        stateDir: params.stateDir,
        bridge: params.bridge,
        sessionId,
        contextWindowTokens: params.contextWindowTokens,
        provider: params.recommendationProvider,
        now: params.now,
      });
      return result.plan;
    },
    async readPlan(planId) {
      const result = await readContextCleanPlan({ stateDir: params.stateDir, planId });
      if (result.bypassed) throw new Error(`clean_plan_unavailable:${result.reasons.join(",")}`);
      return result.value?.plan;
    },
    async approve(planId, selectedTaskIds) {
      const plan = await this.readPlan(planId);
      if (!plan) throw new Error("clean_plan_missing");
      const request: ExecuteApprovedContextCleanParams = {
        schemaVersion: CONTEXT_CLEAN_SCHEMA_VERSION,
        cleanPlanId: plan.planId,
        hostId: plan.hostId,
        sessionId: plan.sessionId,
        baseRevision: plan.baseRevision,
        approvedAt: params.now?.() ?? new Date().toISOString(),
        selectedTaskIds: [...selectedTaskIds],
      };
      return params.bridge.executeApprovedClean(request);
    },
    async readReceipt(planId) {
      const result = await readContextCleanReceipt({ stateDir: params.stateDir, planId });
      if (result.bypassed) throw new Error(`clean_receipt_unavailable:${result.reasons.join(",")}`);
      return result.value;
    },
    cancel: (planId) => params.bridge.cancelCleanPlan(planId),
  };
}
