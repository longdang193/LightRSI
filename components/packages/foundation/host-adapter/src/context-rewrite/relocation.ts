import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  type ContextMutationOperation,
  type ContextMutationPlan,
  type ModelContextSnapshot,
} from "./contracts.js";

export type ContextMutationTargetRelocationReason =
  | "target_fingerprint_missing"
  | "target_fingerprint_scope_mismatch"
  | "target_missing"
  | "target_ambiguous"
  | "target_changed"
  | "target_duplicate";

export type ContextMutationTargetRelocation = {
  relocated: boolean;
  newTargetIds?: string[];
  reason?: ContextMutationTargetRelocationReason;
};

function candidatesByStableId<TAdapterMetadata>(
  snapshot: ModelContextSnapshot<TAdapterMetadata>,
): Map<string, number[]> {
  const candidates = new Map<string, number[]>();
  snapshot.items.forEach((item, index) => {
    candidates.set(item.stableId, [
      ...(candidates.get(item.stableId) ?? []),
      index,
    ]);
  });
  return candidates;
}

function candidatesByFingerprint<TAdapterMetadata>(
  snapshot: ModelContextSnapshot<TAdapterMetadata>,
): Map<string, string[]> {
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
export function relocateTargetIds<
  TAdapterReplacementItem = never,
  TAdapterMetadata = never,
>(
  operation: ContextMutationOperation<TAdapterReplacementItem>,
  snapshot: ModelContextSnapshot<TAdapterMetadata>,
): ContextMutationTargetRelocation {
  if (operation.targetItemIds.length === 0) {
    return { relocated: false, reason: "target_missing" };
  }
  const targetIds = new Set(operation.targetItemIds);
  if (targetIds.size !== operation.targetItemIds.length) {
    return { relocated: false, reason: "target_duplicate" };
  }

  const fingerprints = operation.targetItemFingerprints;
  if (!fingerprints) {
    return { relocated: false, reason: "target_fingerprint_missing" };
  }
  const fingerprintIds = Object.keys(fingerprints);
  if (
    fingerprintIds.length !== targetIds.size
    || fingerprintIds.some((targetId) => !targetIds.has(targetId))
  ) {
    return { relocated: false, reason: "target_fingerprint_scope_mismatch" };
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

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || !value.trim();
}

function uniqueOperationIds<TAdapterReplacementItem>(
  plan: ContextMutationPlan<TAdapterReplacementItem>,
): string[] {
  return [...new Set(plan.operations.map((operation) => operation.id))];
}

function operationReason(
  operation: ContextMutationOperation<unknown>,
  reason: string,
): string {
  const operationId = typeof operation.id === "string"
    ? operation.id.trim()
    : "";
  return `operation:${operationId || "<empty>"}:${reason}`;
}

/**
 * Returns a relocated plan copy. Operations that cannot be resolved with a
 * unique fingerprint match are omitted and reported as deferred. The input
 * plan and its operations are never mutated.
 */
export function relocateContextMutationPlan<
  TAdapterReplacementItem = never,
  TAdapterMetadata = never,
>(params: {
  snapshot: ModelContextSnapshot<TAdapterMetadata>;
  plan: ContextMutationPlan<TAdapterReplacementItem>;
}): ContextMutationPlanRelocationResult<TAdapterReplacementItem> {
  const { snapshot, plan } = params;
  const identityReasons: string[] = [];
  if (isBlank(plan.planId)) identityReasons.push("plan_id_empty");
  if (isBlank(plan.hostId)) identityReasons.push("plan_host_id_empty");
  if (isBlank(snapshot.hostId)) identityReasons.push("snapshot_host_id_empty");
  if (isBlank(plan.sessionId)) identityReasons.push("plan_session_id_empty");
  if (isBlank(snapshot.sessionId)) identityReasons.push("snapshot_session_id_empty");
  if (isBlank(plan.baseRevision)) identityReasons.push("plan_base_revision_empty");
  if (isBlank(snapshot.revision)) identityReasons.push("snapshot_revision_empty");
  if (snapshot.schemaVersion !== MODEL_CONTEXT_REWRITE_SCHEMA_VERSION) {
    identityReasons.push("snapshot_schema_version_mismatch");
  }
  if (plan.schemaVersion !== MODEL_CONTEXT_REWRITE_SCHEMA_VERSION) {
    identityReasons.push("plan_schema_version_mismatch");
  }
  if (plan.hostId !== snapshot.hostId) {
    identityReasons.push("host_id_mismatch");
  }
  if (plan.sessionId !== snapshot.sessionId) {
    identityReasons.push("session_id_mismatch");
  }
  if (identityReasons.length > 0) {
    return {
      plan: {
        ...plan,
        operations: [],
      },
      relocated: false,
      deferredOperationIds: uniqueOperationIds(plan),
      reasons: identityReasons,
    };
  }

  const operations: ContextMutationOperation<TAdapterReplacementItem>[] = [];
  const deferredOperationIds: string[] = [];
  const reasons: string[] = [];
  let targetRelocated = false;
  const operationIdCounts = new Map<string, number>();
  for (const operation of plan.operations) {
    operationIdCounts.set(
      operation.id,
      (operationIdCounts.get(operation.id) ?? 0) + 1,
    );
  }

  for (const operation of plan.operations) {
    if (isBlank(operation.id)) {
      if (!deferredOperationIds.includes(operation.id)) {
        deferredOperationIds.push(operation.id);
        reasons.push(operationReason(operation, "id_empty"));
      }
      continue;
    }
    if ((operationIdCounts.get(operation.id) ?? 0) > 1) {
      if (!deferredOperationIds.includes(operation.id)) {
        deferredOperationIds.push(operation.id);
        reasons.push(operationReason(operation, "duplicate_id"));
      }
      continue;
    }
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
    targetRelocated ||= result.relocated;
  }

  const hasApplicableOperations = operations.length > 0;
  const planChanged = hasApplicableOperations && (
    targetRelocated
    || plan.baseRevision !== snapshot.revision
    || operations.length !== plan.operations.length
  );

  return {
    plan: {
      ...plan,
      baseRevision: hasApplicableOperations ? snapshot.revision : plan.baseRevision,
      operations,
    },
    relocated: planChanged,
    deferredOperationIds,
    reasons,
  };
}
