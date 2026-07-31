import type {
  ContextMutationPlan,
  ContextRewriteValidation,
  ModelContextSnapshot,
} from "./contracts.js";

export type ContextMutationRevalidationParams<
  TAdapterMetadata = never,
  TAdapterReplacementItem = never,
> = {
  snapshot: ModelContextSnapshot<TAdapterMetadata>;
  plan: ContextMutationPlan<TAdapterReplacementItem>;
};

function uniqueOperationIds<TAdapterReplacementItem>(
  plan: ContextMutationPlan<TAdapterReplacementItem>,
): string[] {
  return [...new Set(plan.operations.map((operation) => operation.id))];
}

/**
 * Revalidates each operation against the current snapshot. Revision drift is
 * safe when targets can still be located; only unsafe operations are deferred.
 */
export function revalidateContextMutationPlan<
  TAdapterMetadata = never,
  TAdapterReplacementItem = never,
>(
  params: ContextMutationRevalidationParams<
    TAdapterMetadata,
    TAdapterReplacementItem
  >,
): ContextRewriteValidation {
  const { snapshot, plan } = params;
  const reasons: string[] = [];
  const operationIds = uniqueOperationIds(plan);

  if (plan.hostId !== snapshot.hostId) reasons.push("host_id_mismatch");
  if (plan.sessionId !== snapshot.sessionId) reasons.push("session_id_mismatch");
  if (plan.baseRevision !== snapshot.revision) reasons.push("revision_mismatch");

  if (reasons.includes("host_id_mismatch") || reasons.includes("session_id_mismatch")) {
    return {
      valid: false,
      applicableOperationIds: [],
      deferredOperationIds: operationIds,
      reasons,
    };
  }

  const itemCounts = new Map<string, number>();
  for (const item of snapshot.items) {
    itemCounts.set(item.stableId, (itemCounts.get(item.stableId) ?? 0) + 1);
  }

  const operationIdCounts = new Map<string, number>();
  for (const operation of plan.operations) {
    operationIdCounts.set(
      operation.id,
      (operationIdCounts.get(operation.id) ?? 0) + 1,
    );
  }

  const applicableOperationIds: string[] = [];
  const deferredOperationIds: string[] = [];
  for (const operation of plan.operations) {
    if (applicableOperationIds.includes(operation.id)
      || deferredOperationIds.includes(operation.id)) {
      continue;
    }
    if ((operationIdCounts.get(operation.id) ?? 0) > 1) {
      deferredOperationIds.push(operation.id);
      reasons.push(`operation:${operation.id}:duplicate_id`);
      continue;
    }
    if (operation.targetItemIds.length === 0) {
      deferredOperationIds.push(operation.id);
      reasons.push(`operation:${operation.id}:targets_empty`);
      continue;
    }

    const targetCounts = operation.targetItemIds.map(
      (targetItemId) => itemCounts.get(targetItemId) ?? 0,
    );
    if (targetCounts.some((count) => count === 0)) {
      deferredOperationIds.push(operation.id);
      reasons.push(`operation:${operation.id}:target_missing`);
      continue;
    }
    if (targetCounts.some((count) => count > 1)) {
      deferredOperationIds.push(operation.id);
      reasons.push(`operation:${operation.id}:target_ambiguous`);
      continue;
    }
    applicableOperationIds.push(operation.id);
  }

  return {
    valid: true,
    applicableOperationIds,
    deferredOperationIds,
    reasons,
  };
}
