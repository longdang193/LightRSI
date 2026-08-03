import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  type ContextItemRef,
  type ModelContextSnapshot,
} from "@lightmem2/host-adapter";
import type { SessionTaskRegistry } from "@lightmem2/history";

import {
  buildContextMutationPlanFromEviction,
  type EvictionDecision,
} from "../src/index.js";

function contextItem(
  stableId: string,
  fingerprint: string,
  taskIds: string[],
): ContextItemRef {
  return {
    stableId,
    kind: "user",
    taskIds,
    fingerprint,
    chars: 100,
  };
}

function snapshot(items: ContextItemRef[]): ModelContextSnapshot {
  return {
    schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    hostId: "test-host",
    sessionId: "session-1",
    revision: "ctxrev-1",
    items,
  };
}

function registry(
  overrides: Partial<SessionTaskRegistry> = {},
): SessionTaskRegistry {
  return {
    sessionId: "session-1",
    version: 1,
    tasks: {},
    activeTaskIds: [],
    completedTaskIds: [],
    evictableTaskIds: ["task-1"],
    taskToBlockIds: {},
    blockToTaskIds: {},
    turnToTaskIds: {},
    lastProcessedTurnSeq: 1,
    ...overrides,
  };
}

function evictionBlock(
  id: string = "block-1",
  messageId: string = "message-1",
  chars: number = 1200,
): EvictionDecision["blocks"][number] {
  return {
    id,
    messageIds: [messageId],
    blockType: "task",
    chars,
    approxTokens: Math.round(chars / 4),
  };
}

function evictionInstruction(
  blockId: string = "block-1",
  rationale: string = "task-state marked task-1 as evictable",
  estimatedSavedChars: number = 1200,
  taskIds: string[] | undefined = ["task-1"],
): EvictionDecision["instructions"][number] {
  return {
    blockId,
    confidence: 0.9,
    priority: 10,
    rationale,
    estimatedSavedChars,
    ...(taskIds ? { parameters: { taskIds } } : {}),
  };
}

function decision(params: {
  blocks?: EvictionDecision["blocks"];
  instructions?: EvictionDecision["instructions"];
  enabled?: boolean;
} = {}): EvictionDecision {
  const blocks = params.blocks ?? [evictionBlock()];
  const instructions = params.instructions ?? [evictionInstruction()];
  return {
    enabled: params.enabled ?? true,
    policy: "model_scored",
    blocks,
    instructions,
    estimatedSavedChars: instructions.reduce(
      (sum, instruction) => sum + instruction.estimatedSavedChars,
      0,
    ),
  };
}

test("builds a shared plan with stable targets and fingerprints", () => {
  const result = buildContextMutationPlanFromEviction({
    decision: decision(),
    registry: registry(),
    snapshot: snapshot([
      contextItem("ctx-item-1", "ctxfp-1", ["task-1"]),
    ]),
    stableItemIdsByMessageId: {
      "message-1": ["ctx-item-1"],
    },
    createdAt: "2026-08-03T00:00:00.000Z",
  });

  assert.deepEqual(result.deferredBlockIds, []);
  assert.deepEqual(result.reasons, []);
  assert.match(result.plan?.planId ?? "", /^ctxplan-v1-[a-f0-9]{64}$/);
  assert.deepEqual(result.plan, {
    schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    planId: result.plan?.planId,
    hostId: "test-host",
    sessionId: "session-1",
    baseRevision: "ctxrev-1",
    sourceModuleId: "eviction",
    operations: [
      {
        id: result.plan?.operations[0]?.id,
        type: "remove",
        targetItemIds: ["ctx-item-1"],
        targetItemFingerprints: { "ctx-item-1": "ctxfp-1" },
        taskIds: ["task-1"],
        rationale: "task-state marked task-1 as evictable",
        estimatedSavedChars: 1200,
      },
    ],
    createdAt: "2026-08-03T00:00:00.000Z",
  });
  assert.match(
    result.plan?.operations[0]?.id ?? "",
    /^ctxop-v1-[a-f0-9]{64}$/,
  );
});

test("generates idempotent IDs independently of planning time", () => {
  const params = {
    decision: decision(),
    registry: registry(),
    snapshot: snapshot([
      contextItem("ctx-item-1", "ctxfp-1", ["task-1"]),
    ]),
    stableItemIdsByMessageId: {
      "message-1": ["ctx-item-1"],
    },
  };
  const first = buildContextMutationPlanFromEviction({
    ...params,
    createdAt: "2026-08-03T00:00:00.000Z",
  });
  const second = buildContextMutationPlanFromEviction({
    ...params,
    createdAt: "2026-08-03T00:01:00.000Z",
  });

  assert.equal(first.plan?.planId, second.plan?.planId);
  assert.equal(first.plan?.operations[0]?.id, second.plan?.operations[0]?.id);
});

test("accepts message IDs that already are snapshot stable IDs", () => {
  const result = buildContextMutationPlanFromEviction({
    decision: decision({
      blocks: [evictionBlock("block-1", "ctx-item-1")],
      instructions: [evictionInstruction(
        "block-1",
        "evict completed task",
        1200,
        undefined,
      )],
    }),
    registry: registry({ blockToTaskIds: { "block-1": ["task-1"] } }),
    snapshot: snapshot([
      contextItem("ctx-item-1", "ctxfp-1", ["task-1"]),
    ]),
    createdAt: "2026-08-03T00:00:00.000Z",
  });

  assert.deepEqual(result.plan?.operations[0]?.targetItemIds, ["ctx-item-1"]);
  assert.deepEqual(result.plan?.operations[0]?.taskIds, ["task-1"]);
});

test("does not create empty plans for disabled or empty decisions", () => {
  const currentSnapshot = snapshot([]);
  const disabled = buildContextMutationPlanFromEviction({
    decision: decision({ enabled: false }),
    registry: registry(),
    snapshot: currentSnapshot,
    createdAt: "2026-08-03T00:00:00.000Z",
  });
  const empty = buildContextMutationPlanFromEviction({
    decision: decision({ instructions: [] }),
    registry: registry(),
    snapshot: currentSnapshot,
    createdAt: "2026-08-03T00:00:00.000Z",
  });

  assert.equal(disabled.plan, undefined);
  assert.deepEqual(disabled.reasons, ["eviction_disabled"]);
  assert.equal(empty.plan, undefined);
  assert.deepEqual(empty.reasons, ["no_eviction_instructions"]);
});

test("defers unresolved targets without guessing similar item IDs", () => {
  const result = buildContextMutationPlanFromEviction({
    decision: decision(),
    registry: registry(),
    snapshot: snapshot([
      contextItem("message-1-similar", "ctxfp-1", ["task-1"]),
    ]),
    createdAt: "2026-08-03T00:00:00.000Z",
  });

  assert.equal(result.plan, undefined);
  assert.deepEqual(result.deferredBlockIds, ["block-1"]);
  assert.deepEqual(result.reasons, ["block:block-1:target_unresolved"]);
});

test("defers instructions without an evictable task", () => {
  const result = buildContextMutationPlanFromEviction({
    decision: decision(),
    registry: registry({ evictableTaskIds: [] }),
    snapshot: snapshot([
      contextItem("message-1", "ctxfp-1", ["task-1"]),
    ]),
    createdAt: "2026-08-03T00:00:00.000Z",
  });

  assert.equal(result.plan, undefined);
  assert.deepEqual(result.reasons, ["block:block-1:task_not_evictable"]);
});

test("keeps independent operations and defers overlapping targets", () => {
  const result = buildContextMutationPlanFromEviction({
    decision: decision({
      blocks: [
        evictionBlock("block-1", "message-1", 1200),
        evictionBlock("block-2", "message-1", 600),
        evictionBlock("block-3", "message-2", 400),
      ],
      instructions: [
        evictionInstruction("block-1", "first operation", 1200),
        evictionInstruction("block-2", "overlapping operation", 600),
        evictionInstruction("block-3", "independent operation", 400),
      ],
    }),
    registry: registry(),
    snapshot: snapshot([
      contextItem("ctx-item-1", "ctxfp-1", ["task-1"]),
      contextItem("ctx-item-2", "ctxfp-2", ["task-1"]),
    ]),
    stableItemIdsByMessageId: {
      "message-1": ["ctx-item-1"],
      "message-2": ["ctx-item-2"],
    },
    createdAt: "2026-08-03T00:00:00.000Z",
  });

  assert.equal(result.plan?.operations.length, 2);
  assert.deepEqual(
    result.plan?.operations.map((operation) => operation.targetItemIds),
    [["ctx-item-1"], ["ctx-item-2"]],
  );
  assert.deepEqual(result.deferredBlockIds, ["block-2"]);
  assert.deepEqual(result.reasons, ["block:block-2:target_overlap"]);
});
