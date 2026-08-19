import assert from "node:assert/strict";
import test from "node:test";

import {
  planLifecycleEviction,
  type TaskStateEstimator,
} from "@lightrsi/eviction";
import { createEmptySessionTaskRegistry } from "@lightrsi/history";

import type {
  CodexEffectiveHistoryItem,
  CodexEffectiveHistoryReasonCode,
  CodexEffectiveHistoryView,
  CodexRequestJournalEntry,
  JsonObject,
} from "../src/context-history/index.js";
import {
  buildCodexContextSnapshot,
  buildCodexLifecycleBackendRequest,
  buildCodexLifecycleInput,
  codexSharedContextRewriteBackend,
} from "../src/context-rewrite/index.js";
import { resolveCodexTaskStateEstimator } from "../src/context-rewrite/estimator-config.js";

const SESSION_ID = "codex-lifecycle-input-session";

function effective(stableItemId: string, item: JsonObject): CodexEffectiveHistoryItem {
  return { stableItemId, item };
}

function sourceView(params: {
  items: CodexEffectiveHistoryItem[];
  turns: Array<{ turnSeq: number; inputItemIds?: string[]; outputItemIds?: string[] }>;
  semanticComplete?: boolean;
  reasonCodes?: CodexEffectiveHistoryReasonCode[];
  deferredItems?: CodexEffectiveHistoryItem[];
  unresolvedCallIds?: string[];
  historyIncomplete?: boolean;
}): CodexEffectiveHistoryView {
  return {
    history: {
      revision: "lifecycle-input-revision",
      replayableItems: params.items,
      observationOnlyItems: [],
      deferredItems: params.deferredItems ?? [],
      unresolvedCallIds: params.unresolvedCallIds ?? [],
      source: "proxy_journal",
      incomplete: params.historyIncomplete ?? false,
    },
    turns: params.turns.map((turn) => ({
      turnSeq: turn.turnSeq,
      turnAbsId: `${SESSION_ID}:t${turn.turnSeq}`,
      inputItemIds: turn.inputItemIds ?? [],
      outputItemIds: turn.outputItemIds ?? [],
    })),
    semanticComplete: params.semanticComplete ?? true,
    reasonCodes: params.reasonCodes ?? [],
  };
}

test("estimator environment uses LightRSI, LightMem2, then TokenPilot precedence", () => {
  const result = resolveCodexTaskStateEstimator({
    env: {
      LIGHTRSI_TASK_STATE_ESTIMATOR_BASE_URL: "https://lightrsi.example",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_BASE_URL: "https://lightmem2.example",
      TOKENPILOT_TASK_STATE_ESTIMATOR_BASE_URL: "https://tokenpilot.example",
      LIGHTRSI_TASK_STATE_ESTIMATOR_MODEL: "lightrsi-model",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_MODEL: "lightmem2-model",
      TOKENPILOT_TASK_STATE_ESTIMATOR_MODEL: "tokenpilot-model",
    },
  });

  assert.equal(result.config.baseUrl, "https://lightrsi.example");
  assert.equal(result.config.model, "lightrsi-model");
});

test("estimator environment falls back through compatibility prefixes", () => {
  const result = resolveCodexTaskStateEstimator({
    env: {
      LIGHTMEM2_TASK_STATE_ESTIMATOR_BASE_URL: "https://lightmem2.example",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_MODEL: "lightmem2-model",
    },
  });

  assert.equal(result.config.baseUrl, "https://lightmem2.example");
  assert.equal(result.config.model, "lightmem2-model");
});

function pendingRequest(overrides: Partial<CodexRequestJournalEntry> = {}): CodexRequestJournalEntry {
  return {
    schema: "lightmem2.codex.context-history.request/v1",
    kind: "request",
    requestId: "request-current",
    sessionId: SESSION_ID,
    turnOrdinal: 4,
    stream: false,
    inputItems: [{ type: "message", role: "user", content: "current request" }],
    status: "pending",
    observedAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

test("lifecycle input accepts an explicitly expected pending request and builds closure-safe tool blocks", () => {
  const encrypted = "opaque-reasoning-must-not-enter-semantic-input";
  const view = sourceView({
    items: [
      effective("system", { type: "message", role: "system", content: "protected system" }),
      effective("user", { type: "message", role: "user", content: "inspect the repository" }),
      effective("call", {
        type: "function_call",
        call_id: "call-1",
        name: "run_tests",
        arguments: "{\"scope\":\"unit\"}",
      }),
      effective("result", {
        type: "function_call_output",
        call_id: "call-1",
        output: "EVICT_ME_codex-lifecycle-input",
      }),
      effective("reasoning", { type: "reasoning", encrypted_content: encrypted }),
      effective("latest-user", {
        type: "message",
        role: "user",
        content: "KEEP_ME_current-task",
      }),
    ],
    turns: [
      { turnSeq: 1, inputItemIds: ["system", "user"], outputItemIds: ["call"] },
      { turnSeq: 2, inputItemIds: ["result"], outputItemIds: ["reasoning"] },
      { turnSeq: 3, inputItemIds: ["latest-user"] },
    ],
    semanticComplete: false,
    reasonCodes: ["journal_current_request_uncommitted"],
  });
  const registry = {
    ...createEmptySessionTaskRegistry(SESSION_ID),
    version: 4,
    activeTaskIds: ["task-active"],
    evictableTaskIds: ["task-evict"],
    turnToTaskIds: {
      [`${SESSION_ID}:t1`]: ["task-evict"],
      [`${SESSION_ID}:t2`]: ["task-evict"],
      [`${SESSION_ID}:t3`]: ["task-active"],
    },
  };

  const result = buildCodexLifecycleInput({
    view,
    registry,
    expectedCurrentRequest: pendingRequest(),
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [{ role: "user", content: "current request" }] },
      effectiveHistory: view.history,
    },
    currentTaskIds: ["task-current", "task-current"],
    closureDeferredTaskIds: ["task-closure"],
  });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(result.reasonCodes, []);
  assert.equal(result.pendingTurnCount, 3);
  assert.equal(result.delta.fromTurnSeqExclusive, 0);
  assert.equal(result.delta.toTurnSeqInclusive, 3);
  assert.deepEqual(result.delta.coveredTurnAbsIds, [
    `${SESSION_ID}:t1`,
    `${SESSION_ID}:t3`,
  ]);
  assert.equal(result.currentTurnAbsId, `${SESSION_ID}:t3`);
  assert.deepEqual(result.activeTaskIds, ["task-active"]);
  assert.deepEqual(result.currentTaskIds, ["task-current"]);
  assert.deepEqual(result.closureDeferredTaskIds, ["task-closure"]);

  assert.equal(result.historyBlocks.length, 1);
  assert.deepEqual(result.historyBlocks[0], {
    blockId: "history-block:result",
    blockType: "tool_result",
    lifecycleState: "ACTIVE",
    segmentIds: ["result"],
    text: "EVICT_ME_codex-lifecycle-input",
    charCount: 30,
    approxTokens: 8,
    source: "codex_effective_history",
    toolName: "run_tests",
    turnAnchors: [
      {
        sessionId: SESSION_ID,
        turnAbsId: `${SESSION_ID}:t1`,
        turnSeq: 1,
        role: "tool",
      },
      {
        sessionId: SESSION_ID,
        turnAbsId: `${SESSION_ID}:t2`,
        turnSeq: 2,
        role: "tool",
      },
    ],
    turnAbsIds: [`${SESSION_ID}:t1`, `${SESSION_ID}:t2`],
    taskIds: ["task-evict"],
    metadata: {
      callId: "call-1",
      replayPairKind: "function",
    },
  });
  assert.deepEqual(result.stableItemIdsByMessageId, {
    result: ["call", "result"],
  });
  assert.deepEqual(result.backendRequest.taskIdsByItemId, {
    system: ["task-evict"],
    user: ["task-evict"],
    call: ["task-evict"],
    result: ["task-evict"],
    reasoning: ["task-evict"],
    "latest-user": ["task-active"],
  });
  assert.deepEqual(result.snapshot.adapterMetadata?.activeTaskIds, ["task-active"]);
  assert.deepEqual(result.snapshot.adapterMetadata?.evictableTaskIds, ["task-evict"]);
  assert.doesNotMatch(
    JSON.stringify({ turns: result.rawSemanticTurns, blocks: result.historyBlocks }),
    new RegExp(encrypted),
  );
});

test("lifecycle input fails closed when the current pending boundary is not explicitly trusted", () => {
  const view = sourceView({
    items: [effective("user", { type: "message", role: "user", content: "hello" })],
    turns: [{ turnSeq: 1, inputItemIds: ["user"] }],
    semanticComplete: false,
    reasonCodes: ["journal_current_request_uncommitted"],
  });
  const result = buildCodexLifecycleInput({
    view,
    registry: createEmptySessionTaskRegistry(SESSION_ID),
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: view.history,
    },
  });

  assert.equal(result.status, "deferred");
  assert.deepEqual(result.reasonCodes, [
    "journal_current_request_uncommitted",
    "lifecycle_current_request_boundary_untrusted",
  ]);
});

test("lifecycle input never masks unrelated history incompleteness behind the expected current request", () => {
  const view = sourceView({
    items: [effective("user", { type: "message", role: "user", content: "hello" })],
    turns: [{ turnSeq: 1, inputItemIds: ["user"] }],
    semanticComplete: false,
    reasonCodes: ["journal_current_request_uncommitted", "journal_malformed_stream"],
    historyIncomplete: true,
  });
  const result = buildCodexLifecycleInput({
    view,
    registry: createEmptySessionTaskRegistry(SESSION_ID),
    expectedCurrentRequest: pendingRequest(),
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: view.history,
    },
  });

  assert.equal(result.status, "deferred");
  assert.ok(result.reasonCodes.includes("journal_malformed_stream"));
  assert.ok(result.reasonCodes.includes("lifecycle_semantic_source_incomplete"));
});

test("lifecycle input defers partial and ambiguous tool closure", () => {
  const partial = sourceView({
    items: [effective("call", {
      type: "function_call",
      call_id: "call-partial",
      name: "read_file",
      arguments: "{}",
    })],
    turns: [{ turnSeq: 1, outputItemIds: ["call"] }],
  });
  const partialResult = buildCodexLifecycleInput({
    view: partial,
    registry: createEmptySessionTaskRegistry(SESSION_ID),
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: partial.history,
    },
  });
  assert.equal(partialResult.status, "deferred");
  assert.ok(partialResult.reasonCodes.includes("semantic_tool_closure_incomplete"));

  const ambiguous = sourceView({
    items: [
      effective("call-1", {
        type: "function_call",
        call_id: "call-ambiguous",
        name: "read_file",
        arguments: "{}",
      }),
      effective("call-2", {
        type: "function_call",
        call_id: "call-ambiguous",
        name: "read_file",
        arguments: "{}",
      }),
      effective("result", {
        type: "function_call_output",
        call_id: "call-ambiguous",
        output: "result",
      }),
    ],
    turns: [{ turnSeq: 1, outputItemIds: ["call-1", "call-2", "result"] }],
  });
  const ambiguousResult = buildCodexLifecycleInput({
    view: ambiguous,
    registry: createEmptySessionTaskRegistry(SESSION_ID),
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: ambiguous.history,
    },
  });
  assert.equal(ambiguousResult.status, "deferred");
  assert.ok(ambiguousResult.reasonCodes.includes("semantic_tool_closure_ambiguous"));
});

test("lifecycle input maps a complete custom tool pair to one closure-safe target", () => {
  const view = sourceView({
    items: [
      effective("custom-call", {
        type: "custom_tool_call",
        call_id: "custom-1",
        name: "apply_patch",
        input: "*** Begin Patch",
      }),
      effective("custom-result", {
        type: "custom_tool_call_output",
        call_id: "custom-1",
        output: [{ type: "output_text", text: "Done!" }],
      }),
    ],
    turns: [
      { turnSeq: 4, outputItemIds: ["custom-call"] },
      { turnSeq: 5, inputItemIds: ["custom-result"] },
    ],
  });
  const registry = {
    ...createEmptySessionTaskRegistry(SESSION_ID),
    turnToTaskIds: {
      [`${SESSION_ID}:t4`]: ["task-custom"],
      [`${SESSION_ID}:t5`]: ["task-custom"],
    },
  };
  const result = buildCodexLifecycleInput({
    view,
    registry,
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: view.history,
    },
  });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(result.stableItemIdsByMessageId, {
    "custom-result": ["custom-call", "custom-result"],
  });
  assert.equal(result.historyBlocks[0]?.blockType, "tool_result");
  assert.equal(result.historyBlocks[0]?.metadata?.replayPairKind, "custom");
  assert.deepEqual(result.historyBlocks[0]?.taskIds, ["task-custom"]);
});

test("lifecycle input preserves the original tool call id when resolving targets", () => {
  const originalCallId = " call-with-significant-spacing ";
  const view = sourceView({
    items: [
      effective("call", {
        type: "function_call",
        call_id: originalCallId,
        name: "run_tests",
        arguments: "{}",
      }),
      effective("result", {
        type: "function_call_output",
        call_id: originalCallId,
        output: "finished",
      }),
    ],
    turns: [{ turnSeq: 1, outputItemIds: ["call", "result"] }],
  });
  const result = buildCodexLifecycleInput({
    view,
    registry: createEmptySessionTaskRegistry(SESSION_ID),
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: view.history,
    },
  });

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.equal(result.historyBlocks[0]?.metadata?.callId, originalCallId);
  assert.deepEqual(result.stableItemIdsByMessageId.result, ["call", "result"]);
});

test("lifecycle backend request can be rebuilt with post-estimator task ownership", () => {
  const view = sourceView({
    items: [
      effective("call", {
        type: "function_call",
        call_id: "call-1",
        name: "run_tests",
        arguments: "{}",
      }),
      effective("result", {
        type: "function_call_output",
        call_id: "call-1",
        output: "finished",
      }),
    ],
    turns: [
      { turnSeq: 1, outputItemIds: ["call"] },
      { turnSeq: 2, inputItemIds: ["result"] },
    ],
  });
  const before = createEmptySessionTaskRegistry(SESSION_ID);
  const after = {
    ...before,
    version: 1,
    evictableTaskIds: ["task-finished"],
    turnToTaskIds: { [`${SESSION_ID}:t1`]: ["task-finished"] },
  };
  const backendRequest = buildCodexLifecycleBackendRequest({
    view,
    registry: after,
    request: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: view.history,
    },
  });
  const snapshot = buildCodexContextSnapshot(backendRequest);

  assert.deepEqual(backendRequest.taskIdsByItemId, {
    call: ["task-finished"],
    result: ["task-finished"],
  });
  assert.deepEqual(snapshot.items.map((item) => item.taskIds), [
    ["task-finished"],
    ["task-finished"],
  ]);
  assert.deepEqual(snapshot.adapterMetadata?.evictableTaskIds, ["task-finished"]);
});

test("lifecycle input defers an explicitly cross-task tool pair", () => {
  const view = sourceView({
    items: [
      effective("call", {
        type: "function_call",
        call_id: "call-cross-task",
        name: "run_tests",
        arguments: "{}",
      }),
      effective("result", {
        type: "function_call_output",
        call_id: "call-cross-task",
        output: "finished",
      }),
    ],
    turns: [
      { turnSeq: 1, outputItemIds: ["call"] },
      { turnSeq: 2, inputItemIds: ["result"] },
    ],
  });
  const result = buildCodexLifecycleInput({
    view,
    registry: {
      ...createEmptySessionTaskRegistry(SESSION_ID),
      turnToTaskIds: {
        [`${SESSION_ID}:t1`]: ["task-call"],
        [`${SESSION_ID}:t2`]: ["task-result"],
      },
    },
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: view.history,
    },
  });

  assert.equal(result.status, "deferred");
  assert.deepEqual(result.reasonCodes, ["lifecycle_tool_pair_task_mismatch"]);
});

test("lifecycle input defers an empty planner delta instead of emitting an invalid envelope", () => {
  const view = sourceView({
    items: [effective("user", { type: "message", role: "user", content: "hello" })],
    turns: [{ turnSeq: 1, inputItemIds: ["user"] }],
  });
  const result = buildCodexLifecycleInput({
    view,
    registry: {
      ...createEmptySessionTaskRegistry(SESSION_ID),
      lastProcessedTurnSeq: 1,
    },
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: view.history,
    },
  });

  assert.equal(result.status, "deferred");
  assert.deepEqual(result.reasonCodes, ["lifecycle_no_pending_turns"]);
});

test("lifecycle input survives shared planner and backend closure validation across result turns", async () => {
  const view = sourceView({
    items: [
      effective("user-old", {
        type: "message",
        role: "user",
        content: "run the old task",
      }),
      effective("call", {
        type: "function_call",
        call_id: "call-planner",
        name: "run_tests",
        arguments: "{}",
      }),
      effective("result", {
        type: "function_call_output",
        call_id: "call-planner",
        output: "EVICT_ME_planner_contract",
      }),
      effective("user-current", {
        type: "message",
        role: "user",
        content: "KEEP_ME_current_task",
      }),
    ],
    turns: [
      { turnSeq: 1, inputItemIds: ["user-old"], outputItemIds: ["call"] },
      { turnSeq: 2, inputItemIds: ["result"] },
      { turnSeq: 3, inputItemIds: ["user-current"] },
    ],
  });
  const registry = createEmptySessionTaskRegistry(SESSION_ID);
  const lifecycle = buildCodexLifecycleInput({
    view,
    registry,
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: view.history,
    },
  });
  assert.equal(lifecycle.status, "ready");
  if (lifecycle.status !== "ready") return;

  const estimator: TaskStateEstimator = {
    estimate: () => ({
      baseVersion: registry.version,
      taskUpdates: [
        {
          taskId: "task-evict",
          objective: "finish the old task",
          lifecycle: "evictable",
          coveredTurnAbsIds: [`${SESSION_ID}:t1`],
          completionEvidence: ["tool result completed"],
          evictableReason: "moved to a new task",
        },
        {
          taskId: "task-current",
          objective: "continue the current task",
          lifecycle: "active",
          coveredTurnAbsIds: [`${SESSION_ID}:t3`],
        },
      ],
    }),
  };
  const planned = await planLifecycleEviction({
    registry,
    delta: lifecycle.delta,
    pendingTurnCount: lifecycle.pendingTurnCount,
    estimator,
    historyBlocks: lifecycle.historyBlocks,
    snapshot: lifecycle.snapshot,
    stableItemIdsByMessageId: lifecycle.stableItemIdsByMessageId,
    activeTaskIds: lifecycle.activeTaskIds,
    currentTaskIds: lifecycle.currentTaskIds,
    currentTurnAbsId: lifecycle.currentTurnAbsId,
    closureDeferredTaskIds: lifecycle.closureDeferredTaskIds,
    config: {
      enabled: true,
      batchTurns: 1,
      evictionEnabled: true,
      evictionPolicy: "model_scored",
      evictionMinBlockChars: 1,
    },
    createdAt: "2026-08-16T00:00:00.000Z",
  });

  assert.equal(planned.status, "completed");
  assert.ok(planned.reasonCodes.includes("mutation_plan_created"));
  assert.deepEqual(planned.plan?.operations[0]?.targetItemIds, ["call", "result"]);
  assert.ok(planned.plan);
  if (!planned.plan) return;

  const postEstimatorRequest = buildCodexLifecycleBackendRequest({
    view: lifecycle.committedView,
    registry: planned.registry,
    request: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: lifecycle.committedView.history,
    },
  });
  assert.deepEqual(postEstimatorRequest.taskIdsByItemId?.call, ["task-evict"]);
  assert.deepEqual(postEstimatorRequest.taskIdsByItemId?.result, ["task-evict"]);
  const validation = await codexSharedContextRewriteBackend.validate({
    snapshot: buildCodexContextSnapshot(postEstimatorRequest),
    plan: planned.plan,
  });
  assert.deepEqual(validation.applicableOperationIds, [planned.plan.operations[0]!.id]);
  assert.deepEqual(validation.deferredOperationIds, []);
});

test("lifecycle input rejects registry identity and watermark drift", () => {
  const view = sourceView({
    items: [effective("user", { type: "message", role: "user", content: "hello" })],
    turns: [{ turnSeq: 1, inputItemIds: ["user"] }],
  });
  const mismatched = buildCodexLifecycleInput({
    view,
    registry: createEmptySessionTaskRegistry("another-session"),
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: view.history,
    },
  });
  assert.equal(mismatched.status, "deferred");
  assert.deepEqual(mismatched.reasonCodes, ["lifecycle_registry_session_mismatch"]);

  const invalidVersion = buildCodexLifecycleInput({
    view,
    registry: {
      ...createEmptySessionTaskRegistry(SESSION_ID),
      version: -1,
    },
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: view.history,
    },
  });
  assert.equal(invalidVersion.status, "deferred");
  assert.deepEqual(invalidVersion.reasonCodes, ["lifecycle_registry_version_invalid"]);

  const ahead = buildCodexLifecycleInput({
    view,
    registry: {
      ...createEmptySessionTaskRegistry(SESSION_ID),
      lastProcessedTurnSeq: 2,
    },
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: view.history,
    },
  });
  assert.equal(ahead.status, "deferred");
  assert.deepEqual(ahead.reasonCodes, ["lifecycle_registry_ahead_of_history"]);
});

test("lifecycle input rejects invalid snapshot identity and remains deterministic", () => {
  const invalidRevision = sourceView({
    items: [effective("user", { type: "message", role: "user", content: "hello" })],
    turns: [{ turnSeq: 1, inputItemIds: ["user"] }],
  });
  invalidRevision.history.revision = " ";
  const invalidRevisionResult = buildCodexLifecycleInput({
    view: invalidRevision,
    registry: createEmptySessionTaskRegistry(SESSION_ID),
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: invalidRevision.history,
    },
  });
  assert.equal(invalidRevisionResult.status, "deferred");
  assert.deepEqual(invalidRevisionResult.reasonCodes, ["lifecycle_snapshot_identity_invalid"]);

  const blankStableId = sourceView({
    items: [effective("", { type: "message", role: "user", content: "hello" })],
    turns: [{ turnSeq: 1, inputItemIds: [""] }],
  });
  const blankStableIdResult = buildCodexLifecycleInput({
    view: blankStableId,
    registry: createEmptySessionTaskRegistry(SESSION_ID),
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: blankStableId.history,
    },
  });
  assert.equal(blankStableIdResult.status, "deferred");
  assert.deepEqual(blankStableIdResult.reasonCodes, ["lifecycle_snapshot_identity_invalid"]);

  const valid = sourceView({
    items: [effective("user", { type: "message", role: "user", content: "hello" })],
    turns: [{ turnSeq: 1, inputItemIds: ["user"] }],
  });
  const params = {
    view: valid,
    registry: createEmptySessionTaskRegistry(SESSION_ID),
    backendRequest: {
      sessionId: SESSION_ID,
      payload: { input: [] },
      effectiveHistory: valid.history,
    },
  };
  assert.deepEqual(
    buildCodexLifecycleInput(structuredClone(params)),
    buildCodexLifecycleInput(structuredClone(params)),
  );
});
