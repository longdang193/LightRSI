import { unlink } from "node:fs/promises";

import { writeJsonFileAtomic } from "@lightrsi/host-adapter";
import {
  CONTEXT_CLEAN_EXECUTION_CLAIM_SCHEMA_VERSION,
  CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
  isTerminalContextCleanStatus,
  type ContextCleanExecutionClaim,
  type ContextCleanStoreWriteResult,
} from "./contracts.js";
import { readContextCleanPlan } from "./clean-plan-store.js";
import {
  contextCleanExecutionClaimFilePath,
  parseContextCleanStoredExecutionClaim,
  readStoredJson,
  sameCanonicalValue,
  withContextCleanStoreLock,
} from "./clean-store-support.js";
import { recoverContextCleanStateUnlocked } from "./clean-state-coordinator.js";

const transitions: Record<ContextCleanExecutionClaim["dispatchState"], readonly ContextCleanExecutionClaim["dispatchState"][]> = {
  dispatch_not_started: ["dispatch_started", "recovery_required"],
  dispatch_started: ["host_committed", "recovery_required"],
  host_committed: [],
  recovery_required: [],
};

export async function readContextCleanExecutionClaim(params: {
  stateDir: string;
  planId: string;
}): Promise<{ value?: ContextCleanExecutionClaim; bypassed: boolean; reasons: string[] }> {
  const stored = await readStoredJson(contextCleanExecutionClaimFilePath(params.stateDir, params.planId));
  if (stored.kind === "missing") return { bypassed: false, reasons: [] };
  if (stored.kind === "unreadable") return { bypassed: true, reasons: ["clean_claim_store_unreadable"] };
  const entry = parseContextCleanStoredExecutionClaim(stored.value);
  if (!entry || entry.claim.planId !== params.planId) {
    return { bypassed: true, reasons: ["clean_claim_store_invalid"] };
  }
  return { value: entry.claim, bypassed: false, reasons: [] };
}

export async function saveContextCleanExecutionClaim(params: {
  stateDir: string;
  claim: ContextCleanExecutionClaim;
}): Promise<ContextCleanStoreWriteResult<ContextCleanExecutionClaim>> {
  try {
    return await withContextCleanStoreLock({
      stateDir: params.stateDir,
      planId: params.claim.planId,
      action: () => saveContextCleanExecutionClaimUnlocked(params),
    });
  } catch {
    return { outcome: "bypassed", bypassed: true, reasons: ["clean_claim_store_lock_failed"] };
  }
}

export async function clearContextCleanExecutionClaim(params: {
  stateDir: string;
  planId: string;
  claimId?: string;
  ownerToken?: string;
}): Promise<ContextCleanStoreWriteResult<undefined>> {
  try {
    return await withContextCleanStoreLock({
      stateDir: params.stateDir,
      planId: params.planId,
      action: async () => {
        const current = await readContextCleanExecutionClaim(params);
        if (current.bypassed) return { outcome: "bypassed", bypassed: true, reasons: current.reasons };
        if (!current.value) return { outcome: "missing", bypassed: false, reasons: [] };
        if ((params.claimId && current.value.claimId !== params.claimId)
          || (params.ownerToken && current.value.ownerToken !== params.ownerToken)) {
          return { outcome: "conflict", bypassed: true, reasons: ["clean_claim_owner_conflict"] };
        }
        try {
          await unlink(contextCleanExecutionClaimFilePath(params.stateDir, params.planId));
          return { outcome: "transitioned", bypassed: false, reasons: [] };
        } catch {
          return { outcome: "bypassed", bypassed: true, reasons: ["clean_claim_store_delete_failed"] };
        }
      },
    });
  } catch {
    return { outcome: "bypassed", bypassed: true, reasons: ["clean_claim_store_lock_failed"] };
  }
}

async function saveContextCleanExecutionClaimUnlocked(params: {
  stateDir: string;
  claim: ContextCleanExecutionClaim;
}): Promise<ContextCleanStoreWriteResult<ContextCleanExecutionClaim>> {
  const recovery = await recoverContextCleanStateUnlocked({
    stateDir: params.stateDir,
    planId: params.claim.planId,
  });
  if (recovery.bypassed) return { outcome: "bypassed", bypassed: true, reasons: recovery.reasons };
  const planRead = await readContextCleanPlan({ stateDir: params.stateDir, planId: params.claim.planId });
  if (planRead.bypassed || !planRead.value) return { outcome: "bypassed", bypassed: true, reasons: ["clean_claim_plan_unavailable"] };
  const plan = planRead.value.plan;
  if (isTerminalContextCleanStatus(planRead.value.status)) {
    return { outcome: "bypassed", bypassed: true, reasons: ["clean_claim_plan_terminal"] };
  }
  const analysisRevision = plan.analysisRevision ?? plan.baseRevision;
  if (plan.hostId !== params.claim.hostId || plan.sessionId !== params.claim.sessionId
    || params.claim.analysisRevision !== analysisRevision
    || !params.claim.executionRevision.trim()) {
    return { outcome: "bypassed", bypassed: true, reasons: ["clean_claim_revision_or_identity_conflict"] };
  }
  const current = await readContextCleanExecutionClaim({ stateDir: params.stateDir, planId: params.claim.planId });
  if (current.bypassed) return { outcome: "bypassed", bypassed: true, reasons: current.reasons };
  if (current.value) {
    if (sameCanonicalValue(current.value, params.claim)) return { outcome: "unchanged", value: current.value, bypassed: false, reasons: [] };
    if (current.value.claimId !== params.claim.claimId || current.value.ownerToken !== params.claim.ownerToken) {
      return { outcome: "conflict", value: current.value, bypassed: true, reasons: ["clean_claim_owner_conflict"] };
    }
    if (!transitions[current.value.dispatchState].includes(params.claim.dispatchState)) {
      return { outcome: "conflict", value: current.value, bypassed: true, reasons: ["clean_claim_invalid_dispatch_transition"] };
    }
  }
  try {
    await writeJsonFileAtomic(contextCleanExecutionClaimFilePath(params.stateDir, params.claim.planId), {
      storeSchemaVersion: CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
      claim: { ...params.claim, schemaVersion: CONTEXT_CLEAN_EXECUTION_CLAIM_SCHEMA_VERSION },
    });
    return { outcome: current.value ? "transitioned" : "stored", value: params.claim, bypassed: false, reasons: [] };
  } catch {
    return { outcome: "bypassed", bypassed: true, reasons: ["clean_claim_store_write_failed"] };
  }
}
