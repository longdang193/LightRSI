import {
  CONTEXT_CLEAN_SCHEMA_VERSION,
  type ContextCleanPlan,
  type ContextCleanReceipt,
  type ContextCleanerHostBridge,
  type ContextCleanerSchedulingControlPlane,
  type ExecuteApprovedContextCleanParams,
  type ContextCleanOccurrenceSelection,
  type ContextCleanSnapshot,
} from "./contracts.js";
import { readContextCleanPlan } from "./clean-plan-store.js";
import { readContextCleanReceipt } from "./clean-receipt-store.js";
import {
  prepareContextCleanOccurrenceRelease,
  approveContextCleanSelection,
  cancelContextCleanPlan,
  finalizeContextCleanSchedule,
} from "./orchestrator.js";

export interface ContextCleanerControlService {
  releaseOccurrences(sessionId: string, selections: readonly ContextCleanOccurrenceSelection[]): Promise<ContextCleanReceipt>;
  inspect(sessionId: string): Promise<ContextCleanSnapshot>;
  readPlan(planId: string): Promise<ContextCleanPlan | undefined>;
  approveOccurrences(planId: string, selections: readonly ContextCleanOccurrenceSelection[]): Promise<ContextCleanReceipt>;
  readReceipt(planId: string): Promise<ContextCleanReceipt | undefined>;
  cancel(planId: string): Promise<ContextCleanReceipt>;
}

function canonicalSelections(selections: readonly ContextCleanOccurrenceSelection[]): ContextCleanOccurrenceSelection[] {
  return selections.map((selection) => ({ ...selection })).sort((left, right) => left.stableId.localeCompare(right.stableId));
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
  now?: () => string;
}): ContextCleanerControlService {
  const controlPlane = createContextCleanerControlPlane({ stateDir: params.stateDir, now: params.now });
  return {
    async inspect(sessionId) {
      return params.bridge.readCleanSnapshot(sessionId);
    },
    async readPlan(planId) {
      const result = await readContextCleanPlan({ stateDir: params.stateDir, planId });
      if (result.bypassed) throw new Error(`clean_plan_unavailable:${result.reasons.join(",")}`);
      return result.value?.plan;
    },
    async releaseOccurrences(sessionId, selections) {
      const canonical = canonicalSelections(selections);
      const plan = await prepareContextCleanOccurrenceRelease({
        stateDir: params.stateDir,
        bridge: params.bridge,
        sessionId,
        selections: canonical,
      });
      return params.bridge.executeApprovedClean({
        schemaVersion: CONTEXT_CLEAN_SCHEMA_VERSION,
        cleanPlanId: plan.planId,
        hostId: plan.hostId,
        sessionId: plan.sessionId,
        baseRevision: plan.baseRevision,
        approvedAt: params.now?.() ?? new Date().toISOString(),
        selectedTaskIds: [],
        occurrenceSelections: canonical,
      });
    },
    async approveOccurrences(planId, selections) {
      const plan = await this.readPlan(planId);
      if (!plan) throw new Error("clean_plan_missing");
      const canonical = canonicalSelections(selections);
      return params.bridge.executeApprovedClean({
        schemaVersion: CONTEXT_CLEAN_SCHEMA_VERSION,
        cleanPlanId: plan.planId,
        hostId: plan.hostId,
        sessionId: plan.sessionId,
        baseRevision: plan.baseRevision,
        approvedAt: params.now?.() ?? new Date().toISOString(),
        selectedTaskIds: [],
        occurrenceSelections: canonical,
      });
    },
    async readReceipt(planId) {
      const result = await readContextCleanReceipt({ stateDir: params.stateDir, planId });
      if (result.bypassed) throw new Error(`clean_receipt_unavailable:${result.reasons.join(",")}`);
      return result.value;
    },
    cancel: (planId) => params.bridge.cancelCleanPlan(planId),
  };
}
