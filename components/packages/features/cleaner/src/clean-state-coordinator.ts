import { mkdir, unlink } from "node:fs/promises";
import { dirname } from "node:path";

import { writeJsonFileAtomic } from "@lightrsi/host-adapter";
import {
  CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
  canTransitionContextCleanStatus,
  isContextCleanStatus,
  type ContextCleanPlanRecord,
  type ContextCleanReceipt,
  type ContextCleanStoreWriteResult,
} from "./contracts.js";
import { readContextCleanPlan, transitionContextCleanPlanUnlocked } from "./clean-plan-store.js";
import { readContextCleanReceipt, saveContextCleanReceiptUnlocked } from "./clean-receipt-store.js";
import {
  contextCleanTransactionFilePath,
  isIsoTimestamp,
  isNonBlankString,
  isRecord,
  parseContextCleanReceipt,
  readStoredJson,
  sameCanonicalValue,
  withContextCleanStoreLock,
  type ContextCleanTransactionIntent,
} from "./clean-store-support.js";

function bypassed(reason: string): ContextCleanStoreWriteResult<ContextCleanPlanRecord> {
  return { outcome: "bypassed", bypassed: true, reasons: [reason] };
}

async function abortIntent(stateDir: string, planId: string): Promise<void> {
  await unlink(contextCleanTransactionFilePath(stateDir, planId)).catch(() => undefined);
}

async function abortIntentAndBypass(
  stateDir: string,
  planId: string,
  reason: string,
): Promise<ContextCleanStoreWriteResult<ContextCleanPlanRecord>> {
  await abortIntent(stateDir, planId);
  return bypassed(reason);
}

function parseIntent(value: unknown): ContextCleanTransactionIntent | undefined {
  if (!isRecord(value) || value.storeSchemaVersion !== CONTEXT_CLEAN_STORE_SCHEMA_VERSION
    || !isNonBlankString(value.planId) || !isContextCleanStatus(value.fromStatus)
    || !isIsoTimestamp(value.createdAt)) return undefined;
  const receipt = parseContextCleanReceipt(value.receipt);
  if (!receipt || receipt.planId !== value.planId) return undefined;
  return { storeSchemaVersion: CONTEXT_CLEAN_STORE_SCHEMA_VERSION, planId: value.planId,
    fromStatus: value.fromStatus as ContextCleanTransactionIntent["fromStatus"], receipt,
    createdAt: value.createdAt };
}

async function completeIntent(params: {
  stateDir: string;
  intent: ContextCleanTransactionIntent;
}): Promise<ContextCleanStoreWriteResult<ContextCleanPlanRecord>> {
  const planRead = await readContextCleanPlan({ stateDir: params.stateDir, planId: params.intent.planId });
  if (planRead.bypassed || !planRead.value) return bypassed("clean_transaction_plan_unavailable");
  const { plan } = planRead.value;
  const receipt = params.intent.receipt;
  if (plan.hostId !== receipt.hostId || plan.sessionId !== receipt.sessionId) {
    return abortIntentAndBypass(params.stateDir, params.intent.planId,
      "clean_transaction_identity_conflict");
  }
  if (planRead.value.status !== params.intent.fromStatus
    && planRead.value.status !== receipt.status) {
    return abortIntentAndBypass(params.stateDir, params.intent.planId,
      "clean_transaction_plan_status_conflict");
  }
  if (!canTransitionContextCleanStatus(params.intent.fromStatus, receipt.status)) {
    return abortIntentAndBypass(params.stateDir, params.intent.planId,
      "clean_transaction_transition_invalid");
  }

  const receiptRead = await readContextCleanReceipt({ stateDir: params.stateDir, planId: params.intent.planId });
  if (receiptRead.bypassed) return bypassed("clean_transaction_receipt_unavailable");
  if (receiptRead.value && receiptRead.value.status === receipt.status
    && !sameCanonicalValue(receiptRead.value, receipt)) {
    return abortIntentAndBypass(params.stateDir, params.intent.planId,
      "clean_transaction_receipt_content_conflict");
  }
  if (receiptRead.value && receiptRead.value.status !== receipt.status) {
    const save = await saveContextCleanReceiptUnlocked({ stateDir: params.stateDir, receipt });
    if (save.bypassed) return bypassed(save.reasons[0] ?? "clean_transaction_receipt_conflict");
  } else if (!receiptRead.value) {
    const save = await saveContextCleanReceiptUnlocked({ stateDir: params.stateDir, receipt });
    if (save.bypassed) return bypassed(save.reasons[0] ?? "clean_transaction_receipt_write_failed");
  }

  let result: ContextCleanStoreWriteResult<ContextCleanPlanRecord>;
  if (planRead.value.status === receipt.status) {
    result = { outcome: "unchanged", value: planRead.value, bypassed: false, reasons: [] };
  } else {
    result = await transitionContextCleanPlanUnlocked({ stateDir: params.stateDir, planId: params.intent.planId,
      status: receipt.status, updatedAt: receipt.updatedAt });
  }
  if (result.bypassed) return result;
  try {
    await unlink(contextCleanTransactionFilePath(params.stateDir, params.intent.planId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return bypassed("clean_transaction_cleanup_failed");
  }
  return result;
}

export async function transitionContextCleanState(params: {
  stateDir: string;
  receipt: ContextCleanReceipt;
}): Promise<ContextCleanStoreWriteResult<ContextCleanPlanRecord>> {
  try {
    return await withContextCleanStoreLock({ stateDir: params.stateDir, planId: params.receipt.planId,
      action: () => transitionContextCleanStateUnlocked(params) });
  } catch {
    return bypassed("clean_transaction_lock_failed");
  }
}

async function transitionContextCleanStateUnlocked(params: {
  stateDir: string;
  receipt: ContextCleanReceipt;
}): Promise<ContextCleanStoreWriteResult<ContextCleanPlanRecord>> {
  const receipt = parseContextCleanReceipt(params.receipt);
  if (!receipt) return bypassed("clean_receipt_invalid");
  const pending = await readStoredJson(contextCleanTransactionFilePath(params.stateDir, receipt.planId));
  if (pending.kind === "unreadable") return bypassed("clean_transaction_unreadable");
  if (pending.kind === "ok") {
    const intent = parseIntent(pending.value);
    if (!intent) return bypassed("clean_transaction_invalid");
    if (JSON.stringify(intent.receipt) !== JSON.stringify(receipt)) {
      return bypassed("clean_transaction_conflict");
    }
    return completeIntent({ stateDir: params.stateDir, intent });
  }
  const current = await readContextCleanPlan({ stateDir: params.stateDir, planId: receipt.planId });
  if (current.bypassed || !current.value) return bypassed("clean_transaction_plan_unavailable");
  if (current.value.plan.hostId !== receipt.hostId
    || current.value.plan.sessionId !== receipt.sessionId) {
    return bypassed("clean_transaction_identity_conflict");
  }
  if (!canTransitionContextCleanStatus(current.value.status, receipt.status)) {
    return bypassed(`clean_plan_invalid_transition:${current.value.status}->${receipt.status}`);
  }
  const intent: ContextCleanTransactionIntent = {
    storeSchemaVersion: CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
    planId: receipt.planId,
    fromStatus: current.value.status,
    receipt,
    createdAt: receipt.updatedAt,
  };
  const path = contextCleanTransactionFilePath(params.stateDir, receipt.planId);
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeJsonFileAtomic(path, intent);
  } catch {
    return bypassed("clean_transaction_write_failed");
  }
  return completeIntent({ stateDir: params.stateDir, intent });
}

export async function recoverContextCleanState(params: {
  stateDir: string;
  planId: string;
}): Promise<ContextCleanStoreWriteResult<ContextCleanPlanRecord>> {
  try {
    return await withContextCleanStoreLock({ stateDir: params.stateDir, planId: params.planId,
      action: () => recoverContextCleanStateUnlocked(params) });
  } catch {
    return bypassed("clean_transaction_lock_failed");
  }
}

async function recoverContextCleanStateUnlocked(params: {
  stateDir: string;
  planId: string;
}): Promise<ContextCleanStoreWriteResult<ContextCleanPlanRecord>> {
  const stored = await readStoredJson(contextCleanTransactionFilePath(params.stateDir, params.planId));
  if (stored.kind === "missing") return { outcome: "missing", bypassed: false, reasons: [] };
  if (stored.kind === "unreadable") return bypassed("clean_transaction_unreadable");
  const intent = parseIntent(stored.value);
  if (!intent || intent.planId !== params.planId) return bypassed("clean_transaction_invalid");
  return completeIntent({ stateDir: params.stateDir, intent });
}
