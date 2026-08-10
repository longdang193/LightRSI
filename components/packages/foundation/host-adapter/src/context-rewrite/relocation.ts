import type {
  ContextMutationOperation,
  ContextMutationPlan,
  ModelContextSnapshot,
} from "./contracts.js";

export type ContextMutationTargetRelocationReason =
  | "target_fingerprint_missing"
  | "target_missing"
  | "target_ambiguous"
  | "target_changed"
  | "target_duplicate";

export type ContextMutationTargetRelocation = {
  relocated: boolean;
  newTargetIds?: string[];
  reason?: ContextMutationTargetRelocationReason;
};

function candidatesByStableId(snapshot: ModelContextSnapshot): Map<string, number[]> {
  const candidates = new Map<string, number[]>();
  snapshot.items.forEach((item, index) => {
    candidates.set(item.stableId, [
      ...(candidates.get(item.stableId) ?? []),
      index,
    ]);
  });
  return candidates;
}

function candidatesByFingerprint(snapshot: ModelContextSnapshot): Map<string, string[]> {
  const candidates = new Map<string, string[]>();
  for (const item of snapshot.items) {
    candidates.set(item.fingerprint, [
      ...(candidates.get(item.fingerprint) ?? []),
      item.stableId,
    ]);
  }
  return candidates;
}

/**
 * Resolves every target in an operation against the current snapshot without
 * mutating the operation. Existing stable IDs are retained only when their
 * persisted fingerprint still matches. Missing IDs may move to a new stable
 * ID only when the persisted fingerprint has exactly one current match.
 */
export function relocateTargetIds<TAdapterReplacementItem = never>(
  operation: ContextMutationOperation<TAdapterReplacementItem>,
  snapshot: ModelContextSnapshot,
): ContextMutationTargetRelocation {
  if (operation.targetItemIds.length === 0) {
    return { relocated: false, reason: "target_missing" };
  }

  const fingerprints = operation.targetItemFingerprints;
  if (!fingerprints) {
    return { relocated: false, reason: "target_fingerprint_missing" };
  }

  const stableCandidates = candidatesByStableId(snapshot);
  const fingerprintCandidates = candidatesByFingerprint(snapshot);
  const nextTargetIds: string[] = [];
  let relocated = false;

  for (const targetId of operation.targetItemIds) {
    const expectedFingerprint = fingerprints[targetId]?.trim();
    if (!expectedFingerprint) {
      return { relocated: false, reason: "target_fingerprint_missing" };
    }

    const stableMatches = stableCandidates.get(targetId) ?? [];
    if (stableMatches.length > 1) {
      return { relocated: false, reason: "target_ambiguous" };
    }
    if (stableMatches.length === 1) {
      const current = snapshot.items[stableMatches[0]!];
      if (current?.fingerprint !== expectedFingerprint) {
        return { relocated: false, reason: "target_changed" };
      }
      nextTargetIds.push(targetId);
      continue;
    }

    const fingerprintMatches = fingerprintCandidates.get(expectedFingerprint) ?? [];
    if (fingerprintMatches.length === 0) {
      return { relocated: false, reason: "target_missing" };
    }
    if (fingerprintMatches.length > 1) {
      return { relocated: false, reason: "target_ambiguous" };
    }
    nextTargetIds.push(fingerprintMatches[0]!);
    relocated = true;
  }

  if (new Set(nextTargetIds).size !== nextTargetIds.length) {
    return { relocated: false, reason: "target_duplicate" };
  }
  return { relocated, newTargetIds: nextTargetIds };
}

export type ContextMutationPlanRelocationResult<TAdapterReplacementItem = never> = {
  plan: ContextMutationPlan<TAdapterReplacementItem>;
  relocated: boolean;
  deferredOperationIds: string[];
  reasons: string[];
};

/**
 * Returns a relocated plan copy. Operations that cannot be resolved with a
 * unique fingerprint match are omitted and reported as deferred. The input
 * plan and its operations are never mutated.
 */
export function relocateContextMutationPlan<TAdapterReplacementItem = never>(params: {
  snapshot: ModelContextSnapshot;
  plan: ContextMutationPlan<TAdapterReplacementItem>;
}): ContextMutationPlanRelocationResult<TAdapterReplacementItem> {
  const { snapshot, plan } = params;
  const operations: ContextMutationOperation<TAdapterReplacementItem>[] = [];
  const deferredOperationIds: string[] = [];
  const reasons: string[] = [];
  let relocated = false;

  for (const operation of plan.operations) {
    const result = relocateTargetIds(operation, snapshot);
    if (!result.newTargetIds) {
      deferredOperationIds.push(operation.id);
      reasons.push(`operation:${operation.id || "<empty>"}:${result.reason}`);
      continue;
    }
    const targetItemFingerprints = Object.fromEntries(
      result.newTargetIds.map((targetId) => [
        targetId,
        snapshot.items.find((item) => item.stableId === targetId)!.fingerprint,
      ]),
    );
    operations.push({
      ...operation,
      targetItemIds: result.newTargetIds,
      targetItemFingerprints,
    });
    relocated ||= result.relocated;
  }

  return {
    plan: {
      ...plan,
      baseRevision: relocated ? snapshot.revision : plan.baseRevision,
      operations,
    },
    relocated,
    deferredOperationIds,
    reasons,
  };
}
