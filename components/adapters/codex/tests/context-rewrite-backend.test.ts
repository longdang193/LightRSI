import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  type ContextMutationPlan,
} from "@lightmem2/host-adapter";

import type { CodexEffectiveHistoryItem, JsonObject } from "../src/context-history/types.js";
import {
  buildCodexContextSnapshot,
  codexSharedContextRewriteBackend,
  runCodexSharedGoldenFixture,
  type CodexSharedBackendRequest,
} from "../src/index.js";

const SESSION_ID = "codex-shared-backend-session";

function message(stableItemId: string, role: string, text: string): CodexEffectiveHistoryItem {
  return {
    stableItemId,
    item: {
      type: "message",
      role,
      content: [{ type: role === "assistant" ? "output_text" : "input_text", text }],
    },
  };
}

function requestFor(items: CodexEffectiveHistoryItem[]): CodexSharedBackendRequest {
  return {
    sessionId: SESSION_ID,
    payload: {
      model: "fixture-model",
      previous_response_id: "fixture-parent",
      input: [],
    },
    currentInput: [],
    effectiveHistory: {
      revision: "codex-shared-rev-1",
      replayableItems: items,
      observationOnlyItems: [],
      deferredItems: [],
      unresolvedCallIds: [],
      source: "proxy_journal",
      incomplete: false,
    },
    taskIdsByItemId: {
      "old-user": ["task-completed"],
      "old-call": ["task-completed"],
      "old-result": ["task-completed"],
      "active-user": ["task-active"],
    },
    activeTaskIds: ["task-active"],
    evictableTaskIds: ["task-completed"],
  };
}

function planFor(params: {
  revision: string;
  targetItemIds: string[];
  fingerprints: Record<string, string>;
  taskId?: string;
}): ContextMutationPlan {
  return {
    schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    planId: "codex-shared-plan-1",
    hostId: "codex",
    sessionId: SESSION_ID,
    baseRevision: params.revision,
    sourceModuleId: "test",
    operations: [{
      id: "codex-shared-op-1",
      type: "remove",
      targetItemIds: params.targetItemIds,
      targetItemFingerprints: params.fingerprints,
      taskIds: [params.taskId ?? "task-completed"],
      rationale: "remove completed task",
      estimatedSavedChars: 100,
    }],
    createdAt: "2026-08-09T00:00:00.000Z",
  };
}

test("Codex canonical snapshot builder matches the shared backend and stays deterministic", async () => {
  const request = requestFor([
    message("system", "system", "protected system"),
    message("developer", "developer", "protected developer"),
    message("active-user", "user", "keep current work"),
  ]);
  request.currentInput = [{ type: "message", role: "user", content: "current request" }];
  request.taskIdsByItemId = {
    system: ["task-root"],
    developer: ["task-root"],
    "active-user": ["task-active"],
  };
  request.activeTaskIds = [" task-active ", "task-active"];
  request.evictableTaskIds = [" task-completed ", "task-completed"];

  const first = buildCodexContextSnapshot(request);
  const second = buildCodexContextSnapshot(request);
  const backend = await codexSharedContextRewriteBackend.readSnapshot({
    sessionId: SESSION_ID,
    request,
  });

  assert.deepEqual(first, second);
  assert.deepEqual(backend, first);
  assert.deepEqual(
    first.items.map((item) => [item.stableId, item.kind, item.role, item.taskIds]),
    [
      ["system", "system", "system", ["task-root"]],
      ["developer", "developer", "developer", ["task-root"]],
      ["active-user", "user", "user", ["task-active"]],
    ],
  );
  assert.deepEqual(first.adapterMetadata?.currentInput, request.currentInput);
  assert.notEqual(first.adapterMetadata?.currentInput, request.currentInput);
  assert.deepEqual(first.adapterMetadata?.activeTaskIds, ["task-active"]);
  assert.deepEqual(first.adapterMetadata?.evictableTaskIds, ["task-completed"]);

  await assert.rejects(
    codexSharedContextRewriteBackend.readSnapshot({
      sessionId: "different-session",
      request,
    }),
    /Codex shared backend session mismatch/,
  );
});

test("Codex canonical snapshot preserves history buckets and tool closure metadata", () => {
  const call: CodexEffectiveHistoryItem = {
    stableItemId: "old-call",
    callId: "call-old",
    item: { type: "function_call", call_id: "call-old", name: "read", arguments: "{}" },
  };
  const result: CodexEffectiveHistoryItem = {
    stableItemId: "old-result",
    callId: "call-old",
    item: { type: "function_call_output", call_id: "call-old", output: "old result" },
  };
  const deferred = message("deferred-user", "user", "deferred request");
  const request = requestFor([call, result]);
  request.effectiveHistory.observationOnlyItems = [
    message("observation-assistant", "assistant", "observation only"),
  ];
  request.effectiveHistory.deferredItems = [deferred];

  const snapshot = buildCodexContextSnapshot(request);

  assert.deepEqual(
    snapshot.items.map((item) => [item.stableId, item.kind, item.callId]),
    [
      ["old-call", "tool_call", "call-old"],
      ["old-result", "tool_result", "call-old"],
      ["observation-assistant", "assistant", undefined],
      ["deferred-user", "user", undefined],
    ],
  );
  assert.deepEqual(snapshot.adapterMetadata?.replayableItemIds, ["old-call", "old-result"]);
  assert.deepEqual(
    snapshot.adapterMetadata?.effectiveHistory.observationOnlyItems,
    request.effectiveHistory.observationOnlyItems,
  );
  assert.deepEqual(
    snapshot.adapterMetadata?.effectiveHistory.deferredItems,
    request.effectiveHistory.deferredItems,
  );
  assert.notEqual(
    snapshot.adapterMetadata?.effectiveHistory,
    request.effectiveHistory,
  );
});

test("Codex shared backend maps effective history and prepares a standard rebase result", async () => {
  const items: CodexEffectiveHistoryItem[] = [
    message("old-user", "user", "old request"),
    {
      stableItemId: "old-call",
      callId: "call-old",
      item: { type: "function_call", call_id: "call-old", name: "read", arguments: "{}" },
    },
    {
      stableItemId: "old-result",
      callId: "call-old",
      item: { type: "function_call_output", call_id: "call-old", output: "old result" },
    },
    message("active-user", "user", "keep current work"),
  ];
  const request = requestFor(items);
  const snapshot = await codexSharedContextRewriteBackend.readSnapshot({
    sessionId: SESSION_ID,
    request,
  });
  assert.deepEqual(
    snapshot.items.map((item) => [item.stableId, item.kind, item.taskIds]),
    [
      ["old-user", "user", ["task-completed"]],
      ["old-call", "tool_call", ["task-completed"]],
      ["old-result", "tool_result", ["task-completed"]],
      ["active-user", "user", ["task-active"]],
    ],
  );
  const targets = ["old-user", "old-call", "old-result"];
  const plan = planFor({
    revision: snapshot.revision,
    targetItemIds: targets,
    fingerprints: Object.fromEntries(
      snapshot.items.filter((item) => targets.includes(item.stableId))
        .map((item) => [item.stableId, item.fingerprint]),
    ),
  });

  const validation = await codexSharedContextRewriteBackend.validate({ snapshot, plan });
  assert.deepEqual(validation.applicableOperationIds, ["codex-shared-op-1"]);
  assert.deepEqual(validation.deferredOperationIds, []);

  const applied = await codexSharedContextRewriteBackend.apply({ snapshot, plan, request });
  assert.equal(applied.result.mode, "response_chain_rebase");
  assert.equal(applied.result.applied, true);
  assert.equal(applied.result.changed, true);
  assert.deepEqual(applied.result.appliedOperationIds, ["codex-shared-op-1"]);
  assert.deepEqual(applied.result.removedItemIds, targets);
  assert.equal(applied.result.fallbackUsed, false);
  assert.equal(applied.result.details?.rebasePrepared, true);
  assert.equal("previous_response_id" in applied.request.payload, false);
  const replayInput = JSON.stringify(applied.request.payload.input);
  assert.doesNotMatch(replayInput, /old request|old result|call-old/);
  assert.match(replayInput, /keep current work/);
});

test("Codex shared backend defers partial tool closure and active task targets", async () => {
  const items: CodexEffectiveHistoryItem[] = [
    {
      stableItemId: "old-call",
      callId: "call-old",
      item: { type: "function_call", call_id: "call-old", name: "read", arguments: "{}" },
    },
    {
      stableItemId: "old-result",
      callId: "call-old",
      item: { type: "function_call_output", call_id: "call-old", output: "old result" },
    },
    message("active-user", "user", "keep current work"),
  ];
  const request = requestFor(items);
  const snapshot = await codexSharedContextRewriteBackend.readSnapshot({ sessionId: SESSION_ID, request });

  const partial = planFor({
    revision: snapshot.revision,
    targetItemIds: ["old-call"],
    fingerprints: { "old-call": snapshot.items.find((item) => item.stableId === "old-call")!.fingerprint },
  });
  const partialValidation = await codexSharedContextRewriteBackend.validate({ snapshot, plan: partial });
  assert.deepEqual(partialValidation.applicableOperationIds, []);
  assert.deepEqual(partialValidation.deferredOperationIds, ["codex-shared-op-1"]);
  assert.ok(partialValidation.reasons.some((reason) => reason.includes("protocol_pair_partial")));

  const active = planFor({
    revision: snapshot.revision,
    targetItemIds: ["active-user"],
    fingerprints: {
      "active-user": snapshot.items.find((item) => item.stableId === "active-user")!.fingerprint,
    },
    taskId: "task-active",
  });
  const activeValidation = await codexSharedContextRewriteBackend.validate({ snapshot, plan: active });
  assert.deepEqual(activeValidation.applicableOperationIds, []);
  assert.deepEqual(activeValidation.deferredOperationIds, ["codex-shared-op-1"]);
  assert.ok(activeValidation.reasons.some((reason) => reason.includes("active_task_targeted")));
});

test("Codex shared backend revalidates a stale revision only with exact target fingerprints", async () => {
  const request = requestFor([
    message("old-user", "user", "old request"),
    message("active-user", "user", "keep current work"),
  ]);
  const snapshot = await codexSharedContextRewriteBackend.readSnapshot({ sessionId: SESSION_ID, request });
  const fingerprint = snapshot.items.find((item) => item.stableId === "old-user")!.fingerprint;
  const plan = planFor({
    revision: "codex-stale-revision",
    targetItemIds: ["old-user"],
    fingerprints: { "old-user": fingerprint },
  });
  const validation = await codexSharedContextRewriteBackend.validate({ snapshot, plan });
  assert.deepEqual(validation.applicableOperationIds, ["codex-shared-op-1"]);
  assert.ok(validation.reasons.includes("revision_mismatch"));
  const applied = await codexSharedContextRewriteBackend.apply({ snapshot, plan, request });
  assert.equal(applied.result.applied, true);

  plan.operations[0]!.targetItemFingerprints = { "old-user": "changed-fingerprint" };
  const drifted = await codexSharedContextRewriteBackend.validate({ snapshot, plan });
  assert.deepEqual(drifted.applicableOperationIds, []);
  assert.deepEqual(drifted.deferredOperationIds, ["codex-shared-op-1"]);
});

test("Codex GUA-02 fixture API returns deterministic logical target sets", async () => {
  const fixture = {
    id: "codex-fixture-api",
    tasks: [
      {
        id: "task-completed",
        status: "completed" as const,
        items: [
          { id: "item-old", kind: "message", role: "user", content: "old task" },
        ],
      },
      {
        id: "task-active",
        status: "active" as const,
        current: true,
        items: [
          { id: "item-current", kind: "message", role: "user", content: "current task" },
        ],
      },
    ],
  };
  const first = await runCodexSharedGoldenFixture(fixture);
  const second = await runCodexSharedGoldenFixture(structuredClone(fixture));
  assert.deepEqual(first, second);
  assert.deepEqual(first.selectedTaskIds, ["task-completed"]);
  assert.deepEqual(first.keptTaskIds, ["task-active"]);
  assert.deepEqual(first.selectedItemIds, ["item-old"]);
  assert.deepEqual(first.keptItemIds, ["item-current"]);
  assert.equal(first.result.applied, true);
});

test("Codex shared backend defers incomplete effective history without mutating the request", async () => {
  const request = requestFor([
    message("old-user", "user", "old request"),
    message("active-user", "user", "keep current work"),
  ]);
  request.effectiveHistory.incomplete = true;
  const snapshot = await codexSharedContextRewriteBackend.readSnapshot({ sessionId: SESSION_ID, request });
  const oldItem = snapshot.items.find((item) => item.stableId === "old-user")!;
  const plan = planFor({
    revision: snapshot.revision,
    targetItemIds: ["old-user"],
    fingerprints: { "old-user": oldItem.fingerprint },
  });
  const applied = await codexSharedContextRewriteBackend.apply({ snapshot, plan, request });
  assert.equal(applied.result.applied, false);
  assert.equal(applied.result.changed, false);
  assert.deepEqual(applied.result.deferredOperationIds, ["codex-shared-op-1"]);
  assert.equal(applied.request, request);
  assert.deepEqual(applied.request.payload as JsonObject, request.payload);
});
