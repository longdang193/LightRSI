import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  relocateContextMutationPlan,
  relocateTargetIds,
  type ContextMutationOperation,
  type ContextMutationPlan,
  type ModelContextSnapshot,
} from "../src/index.js";

const snapshot: ModelContextSnapshot = {
  schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  hostId: "test-host",
  sessionId: "session-1",
  revision: "ctxrev-current",
  items: [
    { stableId: "new-item-1", kind: "user", fingerprint: "fp-1", chars: 10 },
    { stableId: "new-item-2", kind: "assistant", fingerprint: "fp-2", chars: 20 },
  ],
};

function operation(
  targetItemIds: string[],
  targetItemFingerprints: Record<string, string> = Object.fromEntries(
    targetItemIds.map((id, index) => [id, `fp-${index + 1}`]),
  ),
): ContextMutationOperation {
  return {
    id: "op-1",
    type: "remove",
    targetItemIds,
    targetItemFingerprints,
    rationale: "evicted task",
    estimatedSavedChars: 10,
  };
}

function plan(operations: ContextMutationPlan["operations"]): ContextMutationPlan {
  return {
    schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    planId: "plan-1",
    hostId: snapshot.hostId,
    sessionId: snapshot.sessionId,
    baseRevision: "ctxrev-old",
    sourceModuleId: "eviction",
    operations,
    createdAt: "2026-08-02T00:00:00.000Z",
  };
}

test("relocates a missing stable id only through a unique fingerprint", () => {
  const result = relocateTargetIds(operation(["old-item-1"], { "old-item-1": "fp-1" }), snapshot);
  assert.deepEqual(result, {
    relocated: true,
    newTargetIds: ["new-item-1"],
  });
});

test("keeps an existing stable id when its fingerprint is unchanged", () => {
  const current = {
    ...snapshot,
    items: [{ ...snapshot.items[0]!, stableId: "new-item-1" }],
  };
  const result = relocateTargetIds(operation(["new-item-1"], { "new-item-1": "fp-1" }), current);
  assert.deepEqual(result, {
    relocated: false,
    newTargetIds: ["new-item-1"],
  });
});

test("defers missing, ambiguous, and changed targets", () => {
  assert.equal(
    relocateTargetIds(operation(["gone"], { gone: "fp-gone" }), snapshot).reason,
    "target_missing",
  );
  assert.equal(
    relocateTargetIds(
      operation(["gone"], { gone: "fp-1" }),
      { ...snapshot, items: [...snapshot.items, { ...snapshot.items[0]!, stableId: "duplicate" }] },
    ).reason,
    "target_ambiguous",
  );
  assert.equal(
    relocateTargetIds(operation(["new-item-1"], { "new-item-1": "wrong" }), snapshot).reason,
    "target_changed",
  );
});

test("relocated plan is a copy and defers an operation with any unsafe target", () => {
  const originalOperation = operation(
    ["old-item-1", "gone"],
    { "old-item-1": "fp-1", gone: "fp-gone" },
  );
  const original = plan([originalOperation]);
  const result = relocateContextMutationPlan({ snapshot, plan: original });

  assert.equal(result.relocated, false);
  assert.deepEqual(result.deferredOperationIds, ["op-1"]);
  assert.deepEqual(result.reasons, ["operation:op-1:target_missing"]);
  assert.deepEqual(original.operations[0]!.targetItemIds, ["old-item-1", "gone"]);
  assert.deepEqual(result.plan.operations, []);
});

test("relocated plan updates revision and fingerprint claims", () => {
  const original = plan([operation(["old-item-1"], { "old-item-1": "fp-1" })]);
  const result = relocateContextMutationPlan({ snapshot, plan: original });

  assert.equal(result.relocated, true);
  assert.equal(result.plan.baseRevision, snapshot.revision);
  assert.deepEqual(result.plan.operations[0]!.targetItemIds, ["new-item-1"]);
  assert.deepEqual(result.plan.operations[0]!.targetItemFingerprints, {
    "new-item-1": "fp-1",
  });
  assert.deepEqual(original.operations[0]!.targetItemIds, ["old-item-1"]);
});
