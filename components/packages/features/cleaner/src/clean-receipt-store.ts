import { writeJsonFileAtomic } from "@lightrsi/host-adapter";
import {
  CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
  canTransitionContextCleanStatus,
  type ContextCleanReceipt,
  type ContextCleanStoreReadResult,
  type ContextCleanStoreWriteResult,
} from "./contracts.js";
import {
  contextCleanReceiptFilePath,
  parseContextCleanReceipt,
  parseContextCleanStoredReceipt,
  readStoredJson,
  sameCanonicalValue,
  withContextCleanStoreLock,
  type ContextCleanStoredReceipt,
} from "./clean-store-support.js";
import { readContextCleanPlan } from "./clean-plan-store.js";

function bypassed(reason: string): ContextCleanStoreWriteResult<ContextCleanReceipt> {
  return { outcome: "bypassed", bypassed: true, reasons: [reason] };
}

export async function readContextCleanReceipt(params: {
  stateDir: string;
  planId: string;
}): Promise<ContextCleanStoreReadResult<ContextCleanReceipt>> {
  if (!params.planId.trim()) return { bypassed: true, reasons: ["clean_plan_id_empty"] };
  const stored = await readStoredJson(contextCleanReceiptFilePath(params.stateDir, params.planId));
  if (stored.kind === "missing") return { bypassed: false, reasons: [] };
  if (stored.kind === "unreadable") return { bypassed: true, reasons: ["clean_receipt_store_unreadable"] };
  const entry = parseContextCleanStoredReceipt(stored.value);
  if (!entry || entry.receipt.planId !== params.planId) {
    return { bypassed: true, reasons: ["clean_receipt_store_invalid"] };
  }
  return { value: entry.receipt, bypassed: false, reasons: [] };
}

export async function saveContextCleanReceipt(params: {
  stateDir: string;
  receipt: ContextCleanReceipt;
}): Promise<ContextCleanStoreWriteResult<ContextCleanReceipt>> {
  try {
    return await withContextCleanStoreLock({ stateDir: params.stateDir, planId: params.receipt.planId,
      action: () => saveContextCleanReceiptUnlocked(params) });
  } catch {
    return bypassed("clean_receipt_store_lock_failed");
  }
}

/** @internal Used by the transaction coordinator while holding the plan lock. */
export async function saveContextCleanReceiptUnlocked(params: {
  stateDir: string;
  receipt: ContextCleanReceipt;
}): Promise<ContextCleanStoreWriteResult<ContextCleanReceipt>> {
  const receipt = parseContextCleanReceipt(params.receipt);
  if (!receipt) return bypassed("clean_receipt_invalid");
  const planRead = await readContextCleanPlan({ stateDir: params.stateDir, planId: receipt.planId });
  if (planRead.bypassed) return bypassed("clean_receipt_plan_unavailable");
  if (!planRead.value) return bypassed("clean_receipt_plan_missing");
  if (planRead.value.plan.hostId !== receipt.hostId
    || planRead.value.plan.sessionId !== receipt.sessionId) {
    return bypassed("clean_receipt_plan_identity_conflict");
  }
  if (!canTransitionContextCleanStatus(planRead.value.status, receipt.status)) {
    return bypassed(`clean_receipt_plan_status_conflict:${planRead.value.status}->${receipt.status}`);
  }
  const current = await readContextCleanReceipt({ stateDir: params.stateDir, planId: receipt.planId });
  if (current.bypassed) return bypassed(current.reasons[0] ?? "clean_receipt_store_unreadable");
  if (current.value) {
    if (sameCanonicalValue(current.value, receipt)) {
      return { outcome: "unchanged", value: current.value, bypassed: false, reasons: [] };
    }
    if (current.value.status === receipt.status) {
      return { outcome: "conflict", value: current.value, bypassed: true,
        reasons: ["clean_receipt_status_content_conflict"] };
    }
    if (!canTransitionContextCleanStatus(current.value.status, receipt.status)) {
      return bypassed(`clean_receipt_invalid_transition:${current.value.status}->${receipt.status}`);
    }
    const selectionCanBeApproved = current.value.status === "analyzed" && receipt.status === "approved";
    if (current.value.hostId !== receipt.hostId || current.value.sessionId !== receipt.sessionId
      || (!selectionCanBeApproved
        && !sameCanonicalValue(current.value.selectedTaskIds, receipt.selectedTaskIds))) {
      return { outcome: "conflict", value: current.value, bypassed: true,
        reasons: ["clean_receipt_identity_conflict"] };
    }
  }
  const tasksById = new Map(planRead.value.plan.tasks.map((task) => [task.taskId, task]));
  if (receipt.status === "analyzed" && receipt.selectedTaskIds.length > 0) {
    return bypassed("clean_receipt_analyzed_selection_not_empty");
  }
  if (receipt.selectedTaskIds.some((taskId) => !tasksById.has(taskId))) {
    return bypassed("clean_receipt_selected_task_unknown");
  }
  if (receipt.selectedTaskIds.some((taskId) => !tasksById.get(taskId)?.selectable)) {
    return bypassed("clean_receipt_selected_task_not_selectable");
  }
  if (receipt.deferredTaskIds.some((taskId) => !tasksById.has(taskId))) {
    return bypassed("clean_receipt_deferred_task_unknown");
  }
  const entry: ContextCleanStoredReceipt = {
    storeSchemaVersion: CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
    receipt,
  };
  try {
    await writeJsonFileAtomic(contextCleanReceiptFilePath(params.stateDir, receipt.planId), entry);
    return { outcome: current.value ? "transitioned" : "stored", value: receipt,
      bypassed: false, reasons: [] };
  } catch {
    return bypassed("clean_receipt_store_write_failed");
  }
}
