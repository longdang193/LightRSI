import {
  createContextCleanerControlService,
  createContextCleanerControlPlane,
  type ContextCleanPlan,
  type ContextCleanReceipt,
} from "@lightrsi/cleaner";
import { createCodexContextCleanerBridge } from "../../../../adapters/codex/src/context-cleaner/bridge.js";
import type { CleanCommandBackend } from "../clean.js";
import type { CleanPlanView, CleanReceiptView } from "../clean-renderer.js";

function planView(plan: ContextCleanPlan): CleanPlanView {
  return {
    planId: plan.planId, hostId: plan.hostId, sessionId: plan.sessionId,
    usedTokens: plan.usedTokens, usedChars: plan.usedChars,
    protectedTokens: plan.protectedTokens, protectedChars: plan.protectedChars,
    unassignedTokens: plan.unassignedTokens, unassignedChars: plan.unassignedChars,
    tokenCountMode: plan.tokenCountMode,
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

export function createCodexCleanCommandBackend(params: { stateDir: string }): CleanCommandBackend {
  const controlPlane = createContextCleanerControlPlane({ stateDir: params.stateDir });
  const bridge = createCodexContextCleanerBridge({ stateDir: params.stateDir, controlPlane });
  const service = createContextCleanerControlService({
    stateDir: params.stateDir,
    bridge,
  });
  return {
    async analyze(sessionId) { return planView(await service.analyze(sessionId)); },
    async readPlan(planId) { const plan = await service.readPlan(planId); return plan ? planView(plan) : undefined; },
    async approve(planId, selectedTaskIds) { return receiptView(await service.approve(planId, selectedTaskIds)); },
    async readReceipt(planId) { const receipt = await service.readReceipt(planId); return receipt ? receiptView(receipt) : undefined; },
    async cancel(planId) { return receiptView(await service.cancel(planId)); },
  };
}
