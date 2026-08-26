import assert from "node:assert/strict";
import test from "node:test";

import {
  applySessionTaskRegistryPatch,
  createEmptySessionTaskRegistry,
  type SessionTaskRegistry,
} from "@lightrsi/history";
import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  type ContextItemRef,
  type ModelContextSnapshot,
} from "@lightrsi/host-adapter";

import {
  attributeItems,
  mapTaskLifecycle,
  type TaskAttributionInput,
} from "../src/task-attribution.js";

function item(
  stableId: string,
  overrides: Partial<ContextItemRef> = {},
): ContextItemRef {
  return {
    stableId,
    kind: "user",
    fingerprint: `digest-${stableId}`,
    chars: 100,
    ...overrides,
  };
}

function snapshot(items: ContextItemRef[]): ModelContextSnapshot {
  return {
    schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    hostId: "codex",
    sessionId: "session-1",
    revision: "rev-1",
    items,
  };
}

function span(first: string, last: string) {
  return { firstTurnAbsId: first, lastTurnAbsId: last, supportingTurnAbsIds: [],
    lastEstimatorTurnAbsId: last };
}

function sampleRegistry(): SessionTaskRegistry {
  return applySessionTaskRegistryPatch(createEmptySessionTaskRegistry("session-1"), {
    upsertTasks: {
      "task-a": {
        taskId: "task-a", title: "finished task", objective: "finished task objective",
        lifecycle: "completed", completionEvidence: ["evidence-a"], unresolvedQuestions: [],
        span: span("t1", "t2"),
      },
      "task-current": {
        taskId: "task-current", title: "current task", objective: "current task objective",
        lifecycle: "active", completionEvidence: [], unresolvedQuestions: [],
        span: span("t3", "t4"),
      },
    },
    activeTaskIds: ["task-current"],
    evictableTaskIds: ["task-a"],
    upsertTurnToTaskIds: { "turn-5": ["task-a"] },
  });
}

function attribute(input: TaskAttributionInput) {
  return attributeItems(input);
}

test("snapshot taskIds attribute items to tasks and unresolvable items fall to unassigned", () => {
  const attributed = attribute({
    snapshot: snapshot([
      item("item-a", { taskIds: ["task-a"] }),
      item("item-orphan"),
    ]),
    registry: sampleRegistry(),
  });
  assert.deepEqual(attributed, [
    { stableId: "item-a", taskIds: ["task-a"], bucket: "task" },
    { stableId: "item-orphan", taskIds: [], bucket: "unassigned" },
  ]);
});

test("system and developer items without task ids are protected", () => {
  const attributed = attribute({
    snapshot: snapshot([
      item("item-sys", { kind: "system" }),
      item("item-dev", { kind: "developer" }),
      item("item-unknown", { kind: "unknown" }),
    ]),
  });
  assert.deepEqual(attributed.map((entry) => entry.bucket), [
    "protected", "protected", "unassigned",
  ]);
  assert.equal(attributed[0]?.protectedReason, "system_developer");
  assert.equal(attributed[1]?.protectedReason, "system_developer");
  assert.equal("protectedReason" in (attributed[2] ?? {}), false);
});

test("system and developer items stay protected even when attributed to a task", () => {
  const attributed = attribute({
    snapshot: snapshot([
      item("item-sys", { kind: "system", taskIds: ["task-a"] }),
      item("item-dev", { role: "developer", taskIds: ["task-a"] }),
    ]),
    registry: sampleRegistry(),
  });
  assert.deepEqual(attributed.map((entry) => entry.bucket), ["protected", "protected"]);
  assert.deepEqual(
    attributed.map((entry) => entry.protectedReason),
    ["system_developer", "system_developer"],
  );
});

test("items shared by multiple tasks are protected once and never double-counted", () => {
  const attributed = attribute({
    snapshot: snapshot([
      item("item-shared", { taskIds: ["task-a", "task-current"] }),
    ]),
    registry: sampleRegistry(),
  });
  assert.equal(attributed[0]?.bucket, "protected");
  assert.equal(attributed[0]?.protectedReason, "shared");
  assert.deepEqual(attributed[0]?.taskIds, ["task-a", "task-current"]);
});

test("tool call/result pairs share one task and split pairs become protected", () => {
  const sameTask = attribute({
    snapshot: snapshot([
      item("call-1", { kind: "tool_call", callId: "call-1", taskIds: ["task-a"] }),
      item("result-1", { kind: "tool_result", callId: "call-1", taskIds: ["task-a"] }),
    ]),
    registry: sampleRegistry(),
  });
  assert.deepEqual(sameTask.map((entry) => entry.bucket), ["task", "task"]);
  assert.deepEqual(sameTask[1]?.taskIds, ["task-a"]);

  const split = attribute({
    snapshot: snapshot([
      item("call-2", { kind: "tool_call", callId: "call-2", taskIds: ["task-a"] }),
      item("result-2", { kind: "tool_result", callId: "call-2", taskIds: ["task-current"] }),
    ]),
    registry: sampleRegistry(),
  });
  assert.deepEqual(split.map((entry) => entry.bucket), ["protected", "protected"]);
  assert.deepEqual(split[0]?.taskIds, ["task-a", "task-current"]);

  const unresolvedInherits = attribute({
    snapshot: snapshot([
      item("call-3", { kind: "tool_call", callId: "call-3", taskIds: ["task-a"] }),
      item("result-3", { kind: "tool_result", callId: "call-3" }),
    ]),
    registry: sampleRegistry(),
  });
  assert.deepEqual(unresolvedInherits.map((entry) => entry.bucket), ["task", "task"]);
  assert.deepEqual(unresolvedInherits[1]?.taskIds, ["task-a"]);
});

test("malformed tool protocol groups are protected instead of offered for cleaning", () => {
  const attributed = attribute({
    snapshot: snapshot([
      item("orphan-call", {
        kind: "tool_call", callId: "orphan", taskIds: ["task-a"],
      }),
      item("missing-id", { kind: "tool_result", taskIds: ["task-a"] }),
      item("duplicate-call-a", {
        kind: "tool_call", callId: "duplicate", taskIds: ["task-a"],
      }),
      item("duplicate-call-b", {
        kind: "tool_call", callId: "duplicate", taskIds: ["task-a"],
      }),
      item("duplicate-result", {
        kind: "tool_result", callId: "duplicate", taskIds: ["task-a"],
      }),
    ]),
    registry: sampleRegistry(),
  });
  assert.deepEqual(attributed.map((entry) => entry.bucket), [
    "protected", "protected", "protected", "protected", "protected",
  ]);
  assert.ok(attributed.every((entry) => entry.protectedReason === "protocol"));
});

test("non-protocol items do not join tool pairs merely because they carry a call id", () => {
  const attributed = attribute({
    snapshot: snapshot([
      item("call", { kind: "tool_call", callId: "pair", taskIds: ["task-a"] }),
      item("result", { kind: "tool_result", callId: "pair", taskIds: ["task-a"] }),
      item("note", { kind: "assistant", callId: "pair", taskIds: ["task-current"] }),
    ]),
    registry: sampleRegistry(),
  });
  assert.deepEqual(attributed[0]?.taskIds, ["task-a"]);
  assert.deepEqual(attributed[1]?.taskIds, ["task-a"]);
  assert.deepEqual(attributed[2]?.taskIds, ["task-current"]);
});

test("taskIdsByStableId fallback attributes items whose snapshot lacks taskIds", () => {
  const attributed = attribute({
    snapshot: snapshot([item("item-a"), item("item-b")]),
    registry: sampleRegistry(),
    taskIdsByStableId: { "item-a": ["task-a"] },
  });
  assert.equal(attributed[0]?.bucket, "task");
  assert.deepEqual(attributed[0]?.taskIds, ["task-a"]);
  assert.equal(attributed[1]?.bucket, "unassigned");
});

test("callIdToTurnAbsId joins through registry.turnToTaskIds", () => {
  const attributed = attribute({
    snapshot: snapshot([
      item("call-4", { kind: "tool_call", callId: "call-4" }),
      item("result-4", { kind: "tool_result", callId: "call-4" }),
    ]),
    registry: sampleRegistry(),
    callIdToTurnAbsId: new Map([["call-4", "turn-5"]]),
  });
  assert.deepEqual(attributed[0]?.taskIds, ["task-a"]);
  assert.equal(attributed[0]?.bucket, "task");
  assert.deepEqual(attributed[1]?.taskIds, ["task-a"]);
  assert.equal(attributed[1]?.bucket, "task");
});

test("duplicate task ids are deduplicated and blank ids dropped", () => {
  const attributed = attribute({
    snapshot: snapshot([
      item("item-a", {
        kind: "tool_call", taskIds: ["task-a", "task-a", "  "], callId: "pair",
      }),
      item("item-b", { kind: "tool_result", taskIds: [], callId: "pair" }),
    ]),
    registry: sampleRegistry(),
  });
  assert.deepEqual(attributed[0]?.taskIds, ["task-a"]);
  assert.deepEqual(attributed[1]?.taskIds, ["task-a"]);
});

test("mapTaskLifecycle maps history lifecycle onto the clean contract", () => {
  assert.equal(mapTaskLifecycle("active", []), "active");
  assert.equal(mapTaskLifecycle("blocked", []), "unresolved");
  assert.equal(mapTaskLifecycle("completed", []), "completed");
  assert.equal(mapTaskLifecycle("evictable", []), "completed");
  assert.equal(mapTaskLifecycle("completed", ["open question"]), "unresolved");
});

test("missing registry degrades gracefully without throwing", () => {
  const attributed = attribute({
    snapshot: snapshot([
      item("item-a", { taskIds: ["task-a"] }),
      item("item-orphan"),
      item("item-sys", { kind: "system" }),
    ]),
  });
  assert.deepEqual(attributed.map((entry) => entry.bucket), ["task", "unassigned", "protected"]);
});
