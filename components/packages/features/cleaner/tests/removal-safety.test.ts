import assert from "node:assert/strict";
import test from "node:test";

import { evaluateContextCleanRemoval } from "../src/index.js";

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
