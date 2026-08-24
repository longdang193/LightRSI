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
  CONTEXT_CLEAN_SCHEMA_VERSION,
  parseContextCleanPlan,
  type ContextCleanPlan,
} from "../src/index.js";
import { attributeItems } from "../src/task-attribution.js";
import {
  TOKEN_COUNT_METHOD_CHARS_ONLY,
  TOKEN_COUNT_METHOD_ESTIMATED,
  TOKEN_COUNT_METHOD_EXACT,
  aggregateTaskAccounting,
  buildContextCleanBreakdown,
  buildItemTokenCounts,
} from "../src/token-accounting.js";

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
  });
}

test("precomputed item counts produce exact mode", () => {
  const counts = buildItemTokenCounts({
    items: [item("item-a", { chars: 120 }), item("item-b", { chars: 80 })],
    model: "gpt-5.4",
    itemTokenCounts: { "item-a": 30, "item-b": 20 },
  });
  assert.deepEqual(counts.tokensByStableId, { "item-a": 30, "item-b": 20 });
  assert.deepEqual(counts.charsByStableId, { "item-a": 120, "item-b": 80 });
  assert.equal(counts.tokenCountMode, "exact");
  assert.equal(counts.tokenCountMethod, TOKEN_COUNT_METHOD_EXACT);
});

test("known model counts text exactly with the model tokenizer", () => {
  const counts = buildItemTokenCounts({
    items: [item("item-a")],
    model: "gpt-5.4",
    itemTextByStableId: { "item-a": "hello world" },
  });
  assert.equal(counts.tokenCountMode, "exact");
  assert.equal(typeof counts.tokensByStableId["item-a"], "number");
  assert.ok((counts.tokensByStableId["item-a"] as number) >= 0);
});

test("unknown model degrades to estimated chars/4 and never fakes provider tokens", () => {
  const counts = buildItemTokenCounts({
    items: [item("item-a")],
    model: "unknown-model",
    itemTextByStableId: { "item-a": "a".repeat(121) },
  });
  assert.equal(counts.tokenCountMode, "estimated");
  assert.equal(counts.tokenCountMethod, TOKEN_COUNT_METHOD_ESTIMATED);
  assert.equal(counts.tokensByStableId["item-a"], Math.round(121 / 4));
});

test("no text and no precomputed counts yields chars_only with null tokens", () => {
  const counts = buildItemTokenCounts({
    items: [item("item-a"), item("item-b")],
    model: "gpt-5.4",
  });
  assert.equal(counts.tokenCountMode, "chars_only");
  assert.equal(counts.tokenCountMethod, TOKEN_COUNT_METHOD_CHARS_ONLY);
  assert.deepEqual(counts.tokensByStableId, { "item-a": null, "item-b": null });
});

test("mixed precomputed and estimated counts keep the whole plan estimated", () => {
  const counts = buildItemTokenCounts({
    items: [item("item-a"), item("item-b")],
    model: "unknown-model",
    itemTokenCounts: { "item-a": 30 },
    itemTextByStableId: { "item-b": "b".repeat(40) },
  });
  assert.equal(counts.tokenCountMode, "estimated");
  assert.equal(counts.tokensByStableId["item-a"], 30);
  assert.equal(counts.tokensByStableId["item-b"], 10);
});

test("conservation holds in both tokens and chars with shared items counted once", () => {
  const input = {
    snapshot: snapshot([
      item("item-a1", { taskIds: ["task-a"], chars: 120 }),
      item("item-a2", { taskIds: ["task-a"], chars: 80 }),
      item("item-current", { taskIds: ["task-current"], chars: 40 }),
      item("item-sys", { kind: "system", chars: 20 }),
      item("item-shared", { taskIds: ["task-a", "task-current"], chars: 30 }),
      item("item-orphan", { chars: 10 }),
    ]),
    registry: sampleRegistry(),
    itemTokenCounts: {
      "item-a1": 30, "item-a2": 20, "item-current": 10,
      "item-sys": 5, "item-shared": 7, "item-orphan": 3,
    },
  };
  const accounting = aggregateTaskAccounting(
    attributeItems(input),
    buildItemTokenCounts({ items: input.snapshot.items, itemTokenCounts: input.itemTokenCounts }),
  );
  assert.equal(accounting.tokensByTaskId["task-a"], 50);
  assert.equal(accounting.tokensByTaskId["task-current"], 10);
  assert.equal(accounting.protectedTokens, 12); // system 5 + shared 7, no double count
  assert.equal(accounting.unassignedTokens, 3);
  assert.equal(accounting.usedTokens, 75);
  assert.equal(accounting.tokensByTaskId["task-a"]! + accounting.tokensByTaskId["task-current"]!
    + accounting.protectedTokens! + accounting.unassignedTokens!, accounting.usedTokens!);

  assert.equal(accounting.charsByTaskId["task-a"], 200);
  assert.equal(accounting.charsByTaskId["task-current"], 40);
  assert.equal(accounting.protectedChars, 50);
  assert.equal(accounting.unassignedChars, 10);
  assert.equal(accounting.usedChars, 300);
  assert.equal(accounting.charsByTaskId["task-a"] + accounting.charsByTaskId["task-current"]
    + accounting.protectedChars + accounting.unassignedChars, accounting.usedChars);
});

test("chars_only accounting nulls every token sum but conserves chars", () => {
  const input = {
    snapshot: snapshot([
      item("item-a", { taskIds: ["task-a"], chars: 120 }),
      item("item-orphan", { chars: 10 }),
    ]),
    registry: sampleRegistry(),
  };
  const accounting = aggregateTaskAccounting(
    attributeItems(input),
    buildItemTokenCounts({ items: input.snapshot.items }),
  );
  assert.equal(accounting.usedTokens, null);
  assert.equal(accounting.tokensByTaskId["task-a"], null);
  assert.equal(accounting.protectedTokens, null);
  assert.equal(accounting.usedChars, 130);
  assert.equal(accounting.charsByTaskId["task-a"] + accounting.protectedChars
    + accounting.unassignedChars, accounting.usedChars);
});

test("breakdown computes percents and hardens selectable against active tasks", () => {
  const registry = applySessionTaskRegistryPatch(sampleRegistry(), {
    evictableTaskIds: ["task-a", "task-current"], // registry claims current is evictable
  });
  const breakdown = buildContextCleanBreakdown({
    snapshot: snapshot([
      item("item-a1", { taskIds: ["task-a"], chars: 120 }),
      item("item-a2", { taskIds: ["task-a"], chars: 80 }),
      item("item-current", { taskIds: ["task-current"], chars: 40 }),
    ]),
    registry,
    itemTokenCounts: { "item-a1": 30, "item-a2": 20, "item-current": 10 },
  });
  assert.equal(breakdown.tasks.length, 2);
  const taskA = breakdown.tasks.find((task) => task.taskId === "task-a");
  const current = breakdown.tasks.find((task) => task.taskId === "task-current");
  assert.equal(taskA?.tokenCount, 50);
  assert.equal(taskA?.tokenPercent, 83.33); // 50 / 60 total
  assert.equal(taskA?.selectable, true);
  assert.equal(current?.selectable, false); // active task never selectable
  assert.equal(current?.lifecycleState, "active");
  assert.deepEqual(taskA?.itemIds, ["item-a1", "item-a2"]);
  assert.deepEqual(taskA?.itemDigests, { "item-a1": "digest-item-a1", "item-a2": "digest-item-a2" });
  assert.equal(breakdown.usedTokens, 60);
  assert.equal(breakdown.tokenCountMode, "exact");
});

test("chars_only breakdown keeps token fields null and percents null", () => {
  const breakdown = buildContextCleanBreakdown({
    snapshot: snapshot([
      item("item-a", { taskIds: ["task-a"], chars: 120 }),
    ]),
    registry: sampleRegistry(),
  });
  assert.equal(breakdown.tokenCountMode, "chars_only");
  assert.equal(breakdown.usedTokens, null);
  assert.equal(breakdown.usedChars, 120);
  assert.equal(breakdown.tasks[0]?.tokenCount, null);
  assert.equal(breakdown.tasks[0]?.tokenPercent, null);
});

test("breakdown output round-trips through the canonical plan parser", () => {
  const breakdown = buildContextCleanBreakdown({
    snapshot: snapshot([
      item("item-a1", { taskIds: ["task-a"], chars: 120 }),
      item("item-current", { taskIds: ["task-current"], chars: 40 }),
    ]),
    registry: sampleRegistry(),
    itemTokenCounts: { "item-a1": 30, "item-current": 10 },
  });
  const plan: ContextCleanPlan = {
    schemaVersion: CONTEXT_CLEAN_SCHEMA_VERSION,
    planId: "clean-plan-7",
    hostId: "codex",
    sessionId: "session-1",
    baseRevision: "rev-1",
    model: "gpt-5.4",
    usedTokens: breakdown.usedTokens,
    usedChars: breakdown.usedChars,
    protectedTokens: breakdown.protectedTokens,
    protectedChars: breakdown.protectedChars,
    unassignedTokens: breakdown.unassignedTokens,
    unassignedChars: breakdown.unassignedChars,
    tokenCountMode: breakdown.tokenCountMode,
    tokenCountMethod: breakdown.tokenCountMethod,
    tasks: breakdown.tasks,
    createdAt: "2026-08-20T00:00:00.000Z",
  };
  const parsed = parseContextCleanPlan(plan);
  assert.ok(parsed);
  assert.equal(parsed.tasks.length, 2);
  assert.deepEqual(parsed.tasks[0]?.itemDigests, { "item-a1": "digest-item-a1" });
  assert.equal(parsed.tasks[0]?.selectable, true);
  assert.equal(parsed.tasks[1]?.selectable, false);
  assert.equal(parsed.usedTokens, 40);
});

test("empty snapshot produces an empty chars_only breakdown without division by zero", () => {
  const breakdown = buildContextCleanBreakdown({
    snapshot: snapshot([]),
    registry: sampleRegistry(),
  });
  assert.deepEqual(breakdown.tasks, []);
  assert.equal(breakdown.usedChars, 0);
  assert.equal(breakdown.usedTokens, null);
});
