import { createHash } from "node:crypto";
import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  type ContextMutationOperation,
  type ContextMutationPlan,
  type ModelContextSnapshot,
} from "@lightmem2/host-adapter";

// One evicted block, described independently of any host adapter. The caller
// (a host adapter) resolves each segment to a concrete message/block location
// and passes it in, so this module stays in the features layer and never
// depends on an adapter package.
export type EvictionPlanSelection = {
  segmentIds: string[];
  chars: number;
  rationale?: string;
};

export type SegmentLocation = {
  messageIndex: number;
  blockIndex: number;
};

function overlayStableId(sessionId: string, loc: SegmentLocation): string {
  return `${sessionId}:${loc.messageIndex}:${loc.blockIndex}`;
}

function planId(sessionId: string, revision: string, selections: EvictionPlanSelection[]): string {
  return createHash("sha256")
    .update(JSON.stringify({ sessionId, revision, selections }))
    .digest("hex")
    .slice(0, 24);
}

// Turn signal-driven eviction selections into a shared ContextMutationPlan the
// overlay backend can validate and apply. Each selection becomes one replace
// operation whose targets are the overlay stable ids, carrying the snapshot
// fingerprints so the backend can prove the targets survived revision drift.
export function buildContextMutationPlan(params: {
  hostId: string;
  sessionId: string;
  snapshot: ModelContextSnapshot;
  selections: EvictionPlanSelection[];
  segmentLocations: Map<string, SegmentLocation>;
  sourceModuleId?: string;
  createdAt?: string;
}): ContextMutationPlan {
  const fingerprintById = new Map(
    params.snapshot.items.map((item) => [item.stableId, item.fingerprint]),
  );

  const operations: ContextMutationOperation[] = [];
  params.selections.forEach((selection, index) => {
    const targetItemIds: string[] = [];
    const targetItemFingerprints: Record<string, string> = {};

    for (const segmentId of selection.segmentIds) {
      const loc = params.segmentLocations.get(segmentId);
      if (!loc) continue;
      const stableId = overlayStableId(params.sessionId, loc);
      const fingerprint = fingerprintById.get(stableId);
      // Only target items that actually exist in the snapshot.
      if (fingerprint === undefined) continue;
      targetItemIds.push(stableId);
      targetItemFingerprints[stableId] = fingerprint;
    }

    if (targetItemIds.length === 0) return;

    operations.push({
      id: `op-${index}`,
      type: "replace",
      targetItemIds,
      targetItemFingerprints,
      rationale: selection.rationale ?? "signal-driven eviction",
      estimatedSavedChars: selection.chars,
    });
  });

  return {
    schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    planId: planId(params.sessionId, params.snapshot.revision, params.selections),
    hostId: params.hostId,
    sessionId: params.sessionId,
    baseRevision: params.snapshot.revision,
    sourceModuleId: params.sourceModuleId ?? "eviction",
    operations,
    createdAt: params.createdAt ?? new Date(0).toISOString(),
  };
}
