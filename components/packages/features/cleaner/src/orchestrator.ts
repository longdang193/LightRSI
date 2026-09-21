import { createHash } from "node:crypto";

import {
  createEmptySessionTaskRegistry,
  loadSessionTaskRegistry,
  type SessionTaskRegistry,
} from "@lightrsi/history";
import {
  CONTEXT_CLEAN_SCHEMA_VERSION,
  type ContextCleanPendingReceipt,
  type ContextCleanPlan,
  type ContextCleanAttributionStatus,
  type ContextCleanReceipt,
  type ContextCleanerHostBridge,
  type ExecuteApprovedContextCleanParams,
  type FinalizeContextCleanScheduleParams,
} from "./contracts.js";
import { readContextCleanPlan, saveContextCleanPlan } from "./clean-plan-store.js";
import { readContextCleanReceipt } from "./clean-receipt-store.js";
import {
  cancelContextCleanState,
  transitionContextCleanApproval,
  transitionContextCleanSchedule,
  transitionContextCleanState,
} from "./clean-state-coordinator.js";
import { buildContextCleanBreakdown } from "./token-accounting.js";
import { analyzeContextCleanRecommendations, type ContextCleanRecommendationProvider } from "./recommendation.js";

export type AnalyzeContextCleanSessionParams = {
  stateDir: string;
  bridge: ContextCleanerHostBridge;
  sessionId: string;
  contextWindowTokens?: number;
  provider?: ContextCleanRecommendationProvider;
  loadRegistry?: (stateDir: string, sessionId: string) => Promise<SessionTaskRegistry>;
  now?: () => string;
};

function error(operation: string, reasons: string[]): never {
  throw new Error(`${operation}:${reasons.join(",") || "unknown"}`);
}

function planId(plan: Omit<ContextCleanPlan, "planId">, fallbackUsed: boolean, reasons: string[]): string {
  return `ctxclean-${createHash("sha256").update(JSON.stringify({ plan, fallbackUsed, reasons })).digest("hex").slice(0, 24)}`;
}

function analyzedReceipt(plan: ContextCleanPlan, fallbackUsed: boolean, reasons: string[]): ContextCleanPendingReceipt {
  return {
    schemaVersion: CONTEXT_CLEAN_SCHEMA_VERSION,
    planId: plan.planId,
    hostId: plan.hostId,
    sessionId: plan.sessionId,
    status: "analyzed",
    selectedTaskIds: [],
    estimatedSavedTokens: 0,
    estimatedSavedChars: 0,
    tokenCountMode: plan.tokenCountMode,
    deferredTaskIds: [],
    reasons,
    updatedAt: plan.createdAt,
    fallbackUsed,
  };
}

function pendingReceipt(params: {
  plan: ContextCleanPlan;
  status: "approved" | "scheduled";
  selectedTaskIds: string[];
  updatedAt: string;
  fallbackUsed: boolean;
}): ContextCleanPendingReceipt {
  const selectedTasks = params.plan.tasks.filter((task) => params.selectedTaskIds.includes(task.taskId));
  return {
    schemaVersion: CONTEXT_CLEAN_SCHEMA_VERSION,
    planId: params.plan.planId,
    hostId: params.plan.hostId,
    sessionId: params.plan.sessionId,
    status: params.status,
    selectedTaskIds: [...params.selectedTaskIds],
    estimatedSavedTokens: selectedTasks.every((task) => task.tokenCount !== null)
      ? selectedTasks.reduce((sum, task) => sum + (task.tokenCount ?? 0), 0)
      : null,
    estimatedSavedChars: selectedTasks.reduce((sum, task) => sum + task.charCount, 0),
    tokenCountMode: params.plan.tokenCountMode,
    deferredTaskIds: [],
    reasons: [],
    updatedAt: params.updatedAt,
    fallbackUsed: params.fallbackUsed,
  };
}

export async function analyzeContextCleanSession(params: AnalyzeContextCleanSessionParams): Promise<{
  plan: ContextCleanPlan;
  receipt: ContextCleanPendingReceipt;
  fallbackUsed: boolean;
  reasons: string[];
}> {
  const sessionId = params.sessionId.trim();
  if (!params.stateDir.trim() || !sessionId) throw new Error("clean_analysis_identity_invalid");
  const snapshot = await params.bridge.readCleanSnapshot(sessionId);
  let registry: SessionTaskRegistry;
  let registryLoadFailed = false;
  try {
    registry = await (params.loadRegistry ?? loadSessionTaskRegistry)(params.stateDir, sessionId);
  } catch {
    registry = createEmptySessionTaskRegistry(sessionId);
    registryLoadFailed = true;
  }
  if (registry.sessionId !== sessionId) throw new Error("clean_analysis_registry_identity_mismatch");
  const attributionStatus: ContextCleanAttributionStatus = registryLoadFailed
    ? "failing"
    : await params.bridge.readAttributionStatus?.(sessionId)
      ?? (Object.keys(registry.tasks).length > 0 ? "available" : "empty");
  const breakdown = buildContextCleanBreakdown({
    snapshot,
    registry,
    model: snapshot.model,
    itemTokenCounts: snapshot.itemTokenCounts,
  });
  const recommendation = await analyzeContextCleanRecommendations({ tasks: breakdown.tasks, provider: params.provider });
  const attributionReasons = attributionStatus !== "available"
    ? ["task_registry_unavailable"]
    : [];
  const fallbackUsed = recommendation.fallbackUsed || attributionReasons.length > 0;
  const reasons = [...recommendation.reasons, ...attributionReasons];
  const base: Omit<ContextCleanPlan, "planId"> = {
    schemaVersion: CONTEXT_CLEAN_SCHEMA_VERSION,
    hostId: params.bridge.hostId,
    sessionId,
    baseRevision: snapshot.revision,
    analysisRevision: snapshot.revision,
    ...(snapshot.model ? { model: snapshot.model } : {}),
    ...(params.contextWindowTokens !== undefined ? { contextWindowTokens: params.contextWindowTokens } : {}),
    usedTokens: breakdown.usedTokens,
    usedChars: breakdown.usedChars,
    protectedTokens: breakdown.protectedTokens,
    protectedChars: breakdown.protectedChars,
    unassignedTokens: breakdown.unassignedTokens,
    unassignedChars: breakdown.unassignedChars,
    tokenCountMode: breakdown.tokenCountMode,
    tokenCountMethod: breakdown.tokenCountMethod,
    attributionStatus,
    occurrenceDigests: Object.fromEntries(snapshot.items.map((item) => [item.stableId, item.fingerprint])),
    tasks: recommendation.tasks,
    createdAt: snapshot.capturedAt,
  };
  const plan: ContextCleanPlan = { ...base, planId: planId(base, fallbackUsed, reasons) };
  const saved = await saveContextCleanPlan({ stateDir: params.stateDir, plan });
  if (saved.bypassed) error("clean_analysis_plan_store_failed", saved.reasons);
  const receipt = await transitionContextCleanState({
    stateDir: params.stateDir,
    receipt: analyzedReceipt(plan, fallbackUsed, reasons),
  });
  if (receipt.bypassed) error("clean_analysis_receipt_store_failed", receipt.reasons);
  return { plan, receipt: analyzedReceipt(plan, fallbackUsed, reasons), fallbackUsed, reasons };
}

export async function approveContextCleanSelection(params: {
  stateDir: string;
  request: ExecuteApprovedContextCleanParams;
  now?: string;
}): Promise<ContextCleanReceipt> {
  const stored = await readContextCleanPlan({ stateDir: params.stateDir, planId: params.request.cleanPlanId });
  if (stored.bypassed || !stored.value) error("clean_approval_plan_unavailable", stored.reasons);
  const plan = stored.value.plan;
  const occurrenceSelections = params.request.occurrenceSelections ?? [];
  const occurrenceTaskIds = occurrenceSelections.map((selection) => `occurrence:${selection.stableId}`);
  const ids = params.request.selectedTaskIds.length > 0
    ? params.request.selectedTaskIds
    : occurrenceTaskIds;
  if (params.request.hostId !== plan.hostId || params.request.sessionId !== plan.sessionId
    || params.request.baseRevision !== plan.baseRevision || ids.length === 0) {
    throw new Error("clean_approval_invalid");
  }
  const byId = new Map(plan.tasks.map((task) => [task.taskId, task]));
  if (new Set(ids).size !== ids.length) throw new Error("clean_approval_duplicate_task");
  for (const taskId of ids) {
    const task = byId.get(taskId);
    if (!task && taskId.startsWith("occurrence:")) {
      const stableId = taskId.slice("occurrence:".length);
      const selection = occurrenceSelections.find((candidate) => candidate.stableId === stableId);
      if (!selection || plan.occurrenceDigests?.[stableId] !== selection.fingerprint
        || !Array.isArray(selection.completionEvidence)
        || !selection.completionEvidence.every((value) => typeof value === "string" && value.trim())
        || selection.completionEvidence.length === 0
        || selection.continuingUseful
        || selection.releaseIntent !== "release"
        || !Array.isArray(selection.retainedFindings)
        || !selection.retainedFindings.every((value) => typeof value === "string" && value.trim())
        || selection.retainedFindings.length === 0
        || !["none", "outgoing"].includes(selection.dependencyDirection)) {
        throw new Error("clean_approval_occurrence_evidence_invalid");
      }
      continue;
    }
    if (!task || !task.selectable) throw new Error("clean_approval_task_not_selectable");
  }
  const now = params.now ?? new Date().toISOString();
  const selectedTasks = plan.tasks.filter((task) => ids.includes(task.taskId));
  const pending: ContextCleanPendingReceipt = {
    schemaVersion: CONTEXT_CLEAN_SCHEMA_VERSION,
    planId: plan.planId,
    hostId: plan.hostId,
    sessionId: plan.sessionId,
    status: "approved",
    selectedTaskIds: ids,
    estimatedSavedTokens: selectedTasks.every((task) => task.tokenCount !== null)
      ? selectedTasks.reduce((sum, task) => sum + (task.tokenCount ?? 0), 0) : null,
    estimatedSavedChars: selectedTasks.reduce((sum, task) => sum + task.charCount, 0),
    tokenCountMode: plan.tokenCountMode,
    deferredTaskIds: [],
    reasons: [],
    updatedAt: now,
    fallbackUsed: false,
  };
  const result = await transitionContextCleanApproval({ stateDir: params.stateDir, receipt: pending });
  if (result.bypassed) error("clean_approval_store_failed", result.reasons);
  if (!result.value) error("clean_approval_receipt_missing", ["clean_approval_receipt_missing"]);
  return result.value;
}

export async function finalizeContextCleanSchedule(params: {
  stateDir: string;
  request: FinalizeContextCleanScheduleParams;
}): Promise<ContextCleanReceipt> {
  const stored = await readContextCleanPlan({ stateDir: params.stateDir, planId: params.request.cleanPlanId });
  if (stored.bypassed || !stored.value) error("clean_schedule_plan_unavailable", stored.reasons);
  const plan = stored.value.plan;
  const request = params.request;
  if (request.hostId !== plan.hostId
    || request.sessionId !== plan.sessionId
    || request.baseRevision !== plan.baseRevision
    || request.selectedTaskIds.length === 0
    || new Set(request.selectedTaskIds).size !== request.selectedTaskIds.length
    || Number.isNaN(Date.parse(request.scheduledAt))) {
    throw new Error("clean_schedule_identity_invalid");
  }
  const scheduled = pendingReceipt({
    plan,
    status: "scheduled",
    selectedTaskIds: request.selectedTaskIds,
    updatedAt: request.scheduledAt,
    fallbackUsed: false,
  });
  const result = await transitionContextCleanSchedule({ stateDir: params.stateDir, receipt: scheduled });
  if (result.bypassed) error("clean_schedule_store_failed", result.reasons);
  if (!result.value) error("clean_schedule_receipt_missing", ["clean_schedule_receipt_missing"]);
  return result.value;
}

export async function cancelContextCleanPlan(params: { stateDir: string; planId: string; now?: string }): Promise<ContextCleanReceipt> {
  const now = params.now ?? new Date().toISOString();
  const result = await cancelContextCleanState({ stateDir: params.stateDir, planId: params.planId, now });
  if (result.bypassed) {
    if (result.reasons.includes("execution_in_progress")) throw new Error("execution_in_progress");
    error("clean_cancel_store_failed", result.reasons);
  }
  if (!result.value) error("clean_cancel_receipt_missing", ["clean_cancel_receipt_missing"]);
  return result.value;
}
