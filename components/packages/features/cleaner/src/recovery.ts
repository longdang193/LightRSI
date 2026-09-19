import type {
  ContextCleanExecutionClaim,
  ContextCleanDispatchState,
} from "./contracts.js";

export type ContextCleanRecoveryDecision =
  | "continue_before_dispatch"
  | "recovery_required"
  | "reconstruct_receipt"
  | "none";

export function decideContextCleanRecovery(params: {
  claim: Pick<ContextCleanExecutionClaim, "dispatchState">;
  hasTerminalReceipt?: boolean;
}): ContextCleanRecoveryDecision {
  if (params.hasTerminalReceipt) return "none";
  const decisions: Record<ContextCleanDispatchState, ContextCleanRecoveryDecision> = {
    dispatch_not_started: "continue_before_dispatch",
    dispatch_started: "recovery_required",
    host_committed: "reconstruct_receipt",
    recovery_required: "recovery_required",
  };
  return decisions[params.claim.dispatchState];
}
