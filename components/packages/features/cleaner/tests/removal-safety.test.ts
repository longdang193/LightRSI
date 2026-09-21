import assert from "node:assert/strict";
import test from "node:test";

import { evaluateContextCleanOccurrence, evaluateContextCleanRemoval } from "../src/index.js";

const item = {
  stableId: "item-1",
  kind: "user" as const,
  taskIds: ["task-1"],
  fingerprint: "digest-1",
  chars: 10,
};

test("removal safety rejects protected and stale targets", () => {
  assert.deepEqual(evaluateContextCleanRemoval({
    taskId: "task-1",
    lifecycleState: "completed",
    activeTaskIds: [],
    evictableTaskIds: ["task-1"],
    expectedRevision: "rev-1",
    currentRevision: "rev-2",
    items: [{ item, expectedFingerprint: "digest-1" }],
  }), { safe: false, reasons: ["revision_stale"] });

  assert.deepEqual(evaluateContextCleanRemoval({
    taskId: "task-1",
    lifecycleState: "completed",
    activeTaskIds: [],
    evictableTaskIds: ["task-1"],
    items: [{ item: { ...item, kind: "system" }, expectedFingerprint: "digest-1" }],
  }), { safe: false, reasons: ["protected_item"] });
});

test("removal safety accepts only completed evictable attributed items", () => {
  assert.deepEqual(evaluateContextCleanRemoval({
    taskId: "task-1",
    lifecycleState: "completed",
    activeTaskIds: [],
    evictableTaskIds: ["task-1"],
    items: [{ item, expectedFingerprint: "digest-1" }],
  }), { safe: true, reasons: [] });
});

test("removal safety rejects items shared with another task", () => {
  assert.deepEqual(evaluateContextCleanRemoval({
    taskId: "task-1",
    lifecycleState: "completed",
    activeTaskIds: [],
    evictableTaskIds: ["task-1"],
    items: [{ item: { ...item, taskIds: ["task-1", "task-2"] } }],
  }), { safe: false, reasons: ["task_attribution_shared"] });
});

test("agent occurrence release ignores active task status without protection evidence", () => {
  assert.deepEqual(evaluateContextCleanOccurrence({
    occurrence: { stableId: "item-1", fingerprint: "digest-1" },
    item,
    set: { provenance: "agent", sourceTaskIds: ["task-1"] },
    activeTaskIds: ["task-1"],
    evictableTaskIds: [],
    lifecycleState: "active",
    releaseEvidence: {
      stableId: "item-1",
      fingerprint: "digest-1",
      completionEvidence: ["completed"],
      continuingUseful: false,
      releaseIntent: "release",
      retainedFindings: [],
      nothingReusable: true,
      dependencyDirection: "none",
    },
  }), { safe: true, reasons: [] });
});

test("agent occurrence release rejects retained findings", () => {
  assert.deepEqual(evaluateContextCleanOccurrence({
    occurrence: { stableId: "item-1", fingerprint: "digest-1" },
    item,
    set: { provenance: "agent", sourceTaskIds: ["task-1"] },
    activeTaskIds: [],
    evictableTaskIds: [],
    lifecycleState: "completed",
    releaseEvidence: {
      stableId: "item-1",
      fingerprint: "digest-1",
      completionEvidence: ["completed"],
      continuingUseful: false,
      releaseIntent: "release",
      retainedFindings: ["follow-up"],
      nothingReusable: false,
      dependencyDirection: "none",
    },
  }), { safe: false, reasons: ["retained_findings"] });
});

test("agent occurrence release preserves retained findings with accessible references", () => {
  assert.deepEqual(evaluateContextCleanOccurrence({
    occurrence: { stableId: "item-1", fingerprint: "digest-1" },
    item,
    set: { provenance: "agent", sourceTaskIds: ["task-1"] },
    activeTaskIds: [],
    evictableTaskIds: [],
    lifecycleState: "completed",
    retainedFindingReferences: ["follow-up"],
    releaseEvidence: {
      stableId: "item-1",
      fingerprint: "digest-1",
      completionEvidence: ["completed"],
      continuingUseful: false,
      releaseIntent: "release",
      retainedFindings: ["follow-up"],
      nothingReusable: false,
      dependencyDirection: "none",
    },
  }), { safe: true, reasons: [] });
});
