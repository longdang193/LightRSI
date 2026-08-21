import { writeJsonFileAtomic } from "@lightrsi/host-adapter";
import {
  CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
  canTransitionContextCleanStatus,
  type ContextCleanPlan,
  type ContextCleanPlanRecord,
  type ContextCleanStatus,
  type ContextCleanStoreReadResult,
  type ContextCleanStoreWriteResult,
} from "./contracts.js";
import {
  contextCleanPlanFilePath,
  parseContextCleanPlan,
  parseContextCleanPlanRecord,
  readStoredJson,
  sameCanonicalValue,
  isIsoTimestamp,
  withContextCleanStoreLock,
} from "./clean-store-support.js";

function bypassed<T>(reason: string): ContextCleanStoreWriteResult<T> {
  return { outcome: "bypassed", bypassed: true, reasons: [reason] };
}

export async function readContextCleanPlan(params: {
  stateDir: string;
  planId: string;
}): Promise<ContextCleanStoreReadResult<ContextCleanPlanRecord>> {
  if (!params.planId.trim()) return { bypassed: true, reasons: ["clean_plan_id_empty"] };
  const stored = await readStoredJson(contextCleanPlanFilePath(params.stateDir, params.planId));
  if (stored.kind === "missing") return { bypassed: false, reasons: [] };
  if (stored.kind === "unreadable") return { bypassed: true, reasons: ["clean_plan_store_unreadable"] };
  const record = parseContextCleanPlanRecord(stored.value);
  if (!record || record.plan.planId !== params.planId) {
    return { bypassed: true, reasons: ["clean_plan_store_invalid"] };
  }
  return { value: record, bypassed: false, reasons: [] };
}

export async function saveContextCleanPlan(params: {
  stateDir: string;
  plan: ContextCleanPlan;
  updatedAt?: string;
}): Promise<ContextCleanStoreWriteResult<ContextCleanPlanRecord>> {
  try {
    return await withContextCleanStoreLock({ stateDir: params.stateDir, planId: params.plan.planId,
      action: () => saveContextCleanPlanUnlocked(params) });
  } catch {
    return bypassed("clean_plan_store_lock_failed");
  }
}

/** @internal Used by the transaction coordinator while holding the plan lock. */
export async function saveContextCleanPlanUnlocked(params: {
  stateDir: string;
  plan: ContextCleanPlan;
  updatedAt?: string;
}): Promise<ContextCleanStoreWriteResult<ContextCleanPlanRecord>> {
  const plan = parseContextCleanPlan(params.plan);
  if (!plan) return bypassed("clean_plan_invalid");
  const updatedAt = params.updatedAt ?? plan.createdAt;
  if (!isIsoTimestamp(updatedAt)) return bypassed("clean_plan_updated_at_invalid");
  const current = await readContextCleanPlan({ stateDir: params.stateDir, planId: plan.planId });
  if (current.bypassed) return bypassed(current.reasons[0] ?? "clean_plan_store_unreadable");
  if (current.value) {
    if (!sameCanonicalValue(current.value.plan, plan)) {
      return { outcome: "conflict", value: current.value, bypassed: true,
        reasons: ["clean_plan_id_content_conflict"] };
    }
    return { outcome: "unchanged", value: current.value, bypassed: false, reasons: [] };
  }
  const record: ContextCleanPlanRecord = {
    storeSchemaVersion: CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
    status: "analyzed",
    plan,
    updatedAt,
  };
  try {
    await writeJsonFileAtomic(contextCleanPlanFilePath(params.stateDir, plan.planId), record);
    return { outcome: "stored", value: record, bypassed: false, reasons: [] };
  } catch {
    return bypassed("clean_plan_store_write_failed");
  }
}

export async function transitionContextCleanPlan(params: {
  stateDir: string;
  planId: string;
  status: ContextCleanStatus;
  updatedAt: string;
}): Promise<ContextCleanStoreWriteResult<ContextCleanPlanRecord>> {
  try {
    return await withContextCleanStoreLock({ stateDir: params.stateDir, planId: params.planId,
      action: () => transitionContextCleanPlanUnlocked(params) });
  } catch {
    return bypassed("clean_plan_store_lock_failed");
  }
}

/** @internal Used by the transaction coordinator while holding the plan lock. */
export async function transitionContextCleanPlanUnlocked(params: {
  stateDir: string;
  planId: string;
  status: ContextCleanStatus;
  updatedAt: string;
}): Promise<ContextCleanStoreWriteResult<ContextCleanPlanRecord>> {
  if (!isIsoTimestamp(params.updatedAt)) return bypassed("clean_plan_updated_at_invalid");
  const current = await readContextCleanPlan(params);
  if (current.bypassed) return bypassed(current.reasons[0] ?? "clean_plan_store_unreadable");
  if (!current.value) return { outcome: "missing", bypassed: true, reasons: ["clean_plan_missing"] };
  if (current.value.status === params.status) {
    return { outcome: "unchanged", value: current.value, bypassed: false, reasons: [] };
  }
  if (!canTransitionContextCleanStatus(current.value.status, params.status)) {
    return bypassed(`clean_plan_invalid_transition:${current.value.status}->${params.status}`);
  }
  const record: ContextCleanPlanRecord = { ...current.value, status: params.status, updatedAt: params.updatedAt };
  try {
    await writeJsonFileAtomic(contextCleanPlanFilePath(params.stateDir, params.planId), record);
    return { outcome: "transitioned", value: record, bypassed: false, reasons: [] };
  } catch {
    return bypassed("clean_plan_store_write_failed");
  }
}
