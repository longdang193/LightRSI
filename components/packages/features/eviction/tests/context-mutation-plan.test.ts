import test from "node:test";
import assert from "node:assert/strict";

import { buildContextMutationPlan } from "../src/context-mutation-plan.js";

const SCHEMA = 1;

function snapshot() {
  return {
    schemaVersion: SCHEMA,
    hostId: "claude-code",
    sessionId: "s1",
    revision: "rev-1",
    items: [
      { stableId: "s1:0:0", kind: "user", fingerprint: "fp-a", chars: 5 },
      { stableId: "s1:1:0", kind: "tool_result", fingerprint: "fp-b", chars: 800 },
    ],
  } as any;
}

test("builds a replace operation targeting the overlay stable id with its fingerprint", () => {
  const plan = buildContextMutationPlan({
    hostId: "claude-code",
    sessionId: "s1",
    snapshot: snapshot(),
    selections: [{ segmentIds: ["seg-1"], chars: 800 }],
    segmentLocations: new Map([["seg-1", { messageIndex: 1, blockIndex: 0 }]]),
  });

  assert.equal(plan.hostId, "claude-code");
  assert.equal(plan.sessionId, "s1");
  assert.equal(plan.baseRevision, "rev-1");
  assert.equal(plan.operations.length, 1);
  const op = plan.operations[0];
  assert.equal(op.type, "replace");
  assert.deepEqual(op.targetItemIds, ["s1:1:0"]);
  assert.equal(op.targetItemFingerprints?.["s1:1:0"], "fp-b");
  assert.equal(op.estimatedSavedChars, 800);
});

test("skips segments that do not resolve to a snapshot item", () => {
  const plan = buildContextMutationPlan({
    hostId: "claude-code",
    sessionId: "s1",
    snapshot: snapshot(),
    // location points at message 9 which is not in the snapshot
    selections: [{ segmentIds: ["seg-x"], chars: 100 }],
    segmentLocations: new Map([["seg-x", { messageIndex: 9, blockIndex: 0 }]]),
  });
  // no valid targets → no operation emitted
  assert.equal(plan.operations.length, 0);
});

test("skips a segment with no known location but keeps others", () => {
  const plan = buildContextMutationPlan({
    hostId: "claude-code",
    sessionId: "s1",
    snapshot: snapshot(),
    selections: [{ segmentIds: ["seg-1", "seg-missing"], chars: 800 }],
    segmentLocations: new Map([["seg-1", { messageIndex: 1, blockIndex: 0 }]]),
  });
  assert.equal(plan.operations.length, 1);
  assert.deepEqual(plan.operations[0].targetItemIds, ["s1:1:0"]);
});

test("plan id is deterministic for the same inputs", () => {
  const args = {
    hostId: "claude-code",
    sessionId: "s1",
    snapshot: snapshot(),
    selections: [{ segmentIds: ["seg-1"], chars: 800 }],
    segmentLocations: new Map([["seg-1", { messageIndex: 1, blockIndex: 0 }]]),
  };
  const a = buildContextMutationPlan(args);
  const b = buildContextMutationPlan(args);
  assert.equal(a.planId, b.planId);
});
