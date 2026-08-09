import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  type ContextMutationPlan,
  type ContextRewriteResult,
  type ContextRewriteValidation,
  type ModelContextSnapshot,
} from "@lightmem2/host-adapter";
import type { RuntimeMessage } from "@lightmem2/kernel";

import {
  claudeContextRewriteBackend,
  type ClaudeOverlayRequest,
} from "../../../claude-code/src/context-rewrite/backend.js";
import {
  runCodexSharedGoldenFixture,
  type CodexSharedGoldenFixture,
} from "../../../codex/src/context-rewrite/backend.js";
import {
  createOpenClawReferenceBackend,
  type OpenClawReferenceBackendRequest,
} from "./reference-backend.js";

type GoldenItem = {
  id: string;
  kind: string;
  role?: string;
  content?: string;
  tool_name?: string;
  tool_call_id?: string;
  arguments?: Record<string, unknown>;
  result?: string;
};

type GoldenTask = {
  id: string;
  status: "active" | "completed" | "unresolved";
  current?: boolean;
  items: GoldenItem[];
};

type GoldenFixture = CodexSharedGoldenFixture & {
  schema: string;
  description: string;
  tasks: GoldenTask[];
  expected: {
    evict_task_ids: string[];
    keep_task_ids: string[];
    evict_item_ids: string[];
    keep_item_ids: string[];
  };
};

type BackendDecision = {
  hostId: "openclaw" | "claude-code" | "codex";
  mode: string;
  selectedTaskIds: string[];
  keptTaskIds: string[];
  selectedItemIds: string[];
  keptItemIds: string[];
  validation: ContextRewriteValidation;
  result: ContextRewriteResult<unknown>;
};

const fixtureDirectory = path.join(__dirname, "fixtures");
const fixtureFiles = [
  "active-turn.json",
  "completed-task.json",
  "tool-closure.json",
  "unresolved-task.json",
];

function readFixture(fileName: string): GoldenFixture {
  return JSON.parse(
    fs.readFileSync(path.join(fixtureDirectory, fileName), "utf8"),
  ) as GoldenFixture;
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function completedTasks(fixture: GoldenFixture): GoldenTask[] {
  return fixture.tasks.filter((task) => task.status === "completed" && task.current !== true);
}

function buildPlan(params: {
  fixture: GoldenFixture;
  hostId: string;
  sessionId: string;
  snapshot: ModelContextSnapshot<unknown>;
  stableIdByLogicalId: Map<string, string>;
  operationType: "remove" | "replace";
}): ContextMutationPlan {
  const snapshotItemById = new Map(params.snapshot.items.map((item) => [item.stableId, item]));
  return {
    schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    planId: `gua-02-${params.hostId}-${params.fixture.id}`,
    hostId: params.hostId,
    sessionId: params.sessionId,
    baseRevision: params.snapshot.revision,
    sourceModuleId: "gua-02",
    operations: completedTasks(params.fixture).map((task) => {
      const targetItemIds = task.items.map((item) => params.stableIdByLogicalId.get(item.id)!);
      return {
        id: `gua-02-op-${task.id}`,
        type: params.operationType,
        targetItemIds,
        targetItemFingerprints: Object.fromEntries(
          targetItemIds.map((itemId) => [itemId, snapshotItemById.get(itemId)!.fingerprint]),
        ),
        taskIds: [task.id],
        rationale: "evict completed golden task",
        estimatedSavedChars: targetItemIds.reduce(
          (total, itemId) => total + (snapshotItemById.get(itemId)?.chars ?? 0),
          0,
        ),
      };
    }),
    createdAt: "2026-08-09T00:00:00.000Z",
  };
}

function normalizeDecision(params: {
  fixture: GoldenFixture;
  hostId: BackendDecision["hostId"];
  mode: string;
  plan: ContextMutationPlan;
  logicalIdByStableId: Map<string, string>;
  validation: ContextRewriteValidation;
  result: ContextRewriteResult<unknown>;
}): BackendDecision {
  const appliedOperationIds = new Set(params.result.appliedOperationIds);
  const selectedTaskIds = completedTasks(params.fixture)
    .filter((task) => appliedOperationIds.has(`gua-02-op-${task.id}`))
    .map((task) => task.id);
  const selectedStableIds = new Set(params.plan.operations
    .filter((operation) => appliedOperationIds.has(operation.id))
    .flatMap((operation) => operation.targetItemIds));
  const selectedItemIds = params.fixture.tasks.flatMap((task) => task.items)
    .map((item) => item.id)
    .filter((logicalId) => {
      const stableId = [...params.logicalIdByStableId.entries()]
        .find(([, candidateLogicalId]) => candidateLogicalId === logicalId)?.[0];
      return stableId ? selectedStableIds.has(stableId) : false;
    });
  const selectedTasks = new Set(selectedTaskIds);
  const selectedItems = new Set(selectedItemIds);
  return {
    hostId: params.hostId,
    mode: params.mode,
    selectedTaskIds,
    keptTaskIds: params.fixture.tasks.map((task) => task.id)
      .filter((taskId) => !selectedTasks.has(taskId)),
    selectedItemIds,
    keptItemIds: params.fixture.tasks.flatMap((task) => task.items.map((item) => item.id))
      .filter((itemId) => !selectedItems.has(itemId)),
    validation: params.validation,
    result: params.result,
  };
}

function claudeMessage(item: GoldenItem): RuntimeMessage {
  if (item.kind === "tool_call") {
    return {
      role: "assistant",
      content: [{
        type: "tool_use",
        id: item.tool_call_id,
        name: item.tool_name ?? "fixture_tool",
        input: item.arguments ?? {},
      }],
    } as unknown as RuntimeMessage;
  }
  if (item.kind === "tool_result") {
    return {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: item.tool_call_id,
        content: item.result ?? "",
      }],
    } as unknown as RuntimeMessage;
  }
  return {
    role: item.role ?? "user",
    content: [{ type: "text", text: item.content ?? "" }],
  } as RuntimeMessage;
}

async function runClaudeFixture(fixture: GoldenFixture): Promise<BackendDecision> {
  const sessionId = `gua-02-claude-${fixture.id}`;
  const logicalItems = fixture.tasks.flatMap((task) => task.items);
  const request: ClaudeOverlayRequest = {
    sessionId,
    revision: `claude-gua-rev-${fixture.id}`,
    messages: logicalItems.map(claudeMessage),
  };
  const snapshot = await claudeContextRewriteBackend.readSnapshot({ sessionId, request });
  assert.equal(snapshot.items.length, logicalItems.length);
  const stableIdByLogicalId = new Map(
    logicalItems.map((item, index) => [item.id, snapshot.items[index]!.stableId]),
  );
  const logicalIdByStableId = new Map(
    [...stableIdByLogicalId].map(([logicalId, stableId]) => [stableId, logicalId]),
  );
  const plan = buildPlan({
    fixture,
    hostId: "claude-code",
    sessionId,
    snapshot,
    stableIdByLogicalId,
    operationType: "replace",
  });
  const validation = await claudeContextRewriteBackend.validate({ snapshot, plan });
  const applied = await claudeContextRewriteBackend.apply({ snapshot, plan, request });
  return normalizeDecision({
    fixture,
    hostId: "claude-code",
    mode: claudeContextRewriteBackend.mode,
    plan,
    logicalIdByStableId,
    validation,
    result: applied.result,
  });
}

function contentToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((block) => (
    block && typeof block === "object" && "text" in block
      ? String((block as Record<string, unknown>).text ?? "")
      : ""
  )).join("");
}

function openClawTaskIds(message: Record<string, unknown>): string[] {
  const details = message.details as { contextSafe?: { taskIds?: string[] } } | undefined;
  return details?.contextSafe?.taskIds ?? [];
}

function openClawMessage(item: GoldenItem, taskId: string): Record<string, unknown> {
  const details = { contextSafe: { taskIds: [taskId] } };
  if (item.kind === "tool_call") {
    return {
      messageId: item.id,
      role: "assistant",
      content: [{
        type: "toolCall",
        id: item.tool_call_id,
        name: item.tool_name ?? "fixture_tool",
        arguments: item.arguments ?? {},
      }],
      details,
    };
  }
  if (item.kind === "tool_result") {
    return {
      messageId: item.id,
      role: "toolResult",
      toolCallId: item.tool_call_id,
      toolName: item.tool_name ?? "fixture_tool",
      content: [{ type: "text", text: item.result ?? "" }],
      details,
    };
  }
  return {
    messageId: item.id,
    role: item.role ?? "user",
    content: item.content ?? "",
    details,
  };
}

function openClawRequest(fixture: GoldenFixture): OpenClawReferenceBackendRequest {
  const messages = fixture.tasks.flatMap((task) => (
    task.items.map((item) => openClawMessage(item, task.id))
  ));
  return {
    stateDir: "fixture-state",
    sessionId: `gua-02-openclaw-${fixture.id}`,
    state: {
      version: 1,
      sessionId: `gua-02-openclaw-${fixture.id}`,
      messages,
      seenMessageIds: messages.map((message) => String(message.messageId)),
      updatedAt: "2026-08-09T00:00:00.000Z",
    },
    evictionEnabled: true,
    evictionPolicy: "model_scored",
    evictionMinBlockChars: 1,
    evictionReplacementMode: "drop",
    helpers: {
      appendTaskStateTrace: async () => undefined,
      appendEvictionVisualSnapshot: async () => undefined,
      asRecord: (value) => value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined,
      canonicalMessageTaskIds: openClawTaskIds,
      contentToText,
      dedupeStrings: (values) => [...new Set(values)],
      ensureContextSafeDetails: (_details, patch) => ({ contextSafe: patch }),
      extractPathLike: () => undefined,
      extractToolMessageText: (message) => contentToText(message.content),
      isToolResultLikeMessage: (message) => ["tool", "toolresult"].includes(
        String(message.role ?? "").toLowerCase(),
      ),
      logger: { info: () => undefined },
      messageToolCallId: (message) => typeof message.toolCallId === "string"
        ? message.toolCallId
        : typeof message.tool_call_id === "string"
          ? message.tool_call_id
          : undefined,
      safeId: (value) => value,
    },
  };
}

async function runOpenClawFixture(fixture: GoldenFixture): Promise<BackendDecision> {
  const request = openClawRequest(fixture);
  const backend = createOpenClawReferenceBackend({
    async rewriteCanonicalState(params) {
      const requestedTaskIds = new Set(params.evictionTaskIds);
      const appliedTaskIds = [...requestedTaskIds].filter((taskId) => (
        params.state.messages.some((rawMessage) => {
          const message = rawMessage as Record<string, unknown>;
          return openClawTaskIds(message).includes(taskId);
        })
      ));
      const nextMessages = params.state.messages.filter((rawMessage) => {
        const message = rawMessage as Record<string, unknown>;
        return !openClawTaskIds(message).some((taskId) => requestedTaskIds.has(taskId));
      });
      return {
        state: {
          ...params.state,
          messages: nextMessages,
          updatedAt: "2026-08-09T00:01:00.000Z",
        },
        changed: nextMessages.length !== params.state.messages.length,
        appliedEvictionTaskIds: appliedTaskIds,
      };
    },
  });
  const snapshot = await backend.readSnapshot({ sessionId: request.sessionId, request });
  const stableIdByLogicalId = new Map(snapshot.items.map((item) => [item.stableId, item.stableId]));
  const logicalIdByStableId = new Map(snapshot.items.map((item) => [item.stableId, item.stableId]));
  const plan = buildPlan({
    fixture,
    hostId: "openclaw",
    sessionId: request.sessionId,
    snapshot,
    stableIdByLogicalId,
    operationType: "remove",
  });
  const validation = await backend.validate({ snapshot, plan });
  const applied = await backend.apply({ snapshot, plan, request });
  return normalizeDecision({
    fixture,
    hostId: "openclaw",
    mode: backend.mode,
    plan,
    logicalIdByStableId,
    validation,
    result: applied.result,
  });
}

test("GUA-02 runs all three independent backends against the same logical target sets", async () => {
  for (const fixtureFile of fixtureFiles) {
    const fixture = readFixture(fixtureFile);
    const openclaw = await runOpenClawFixture(fixture);
    const claude = await runClaudeFixture(fixture);
    const codexRaw = await runCodexSharedGoldenFixture(fixture);
    const codex: BackendDecision = {
      hostId: "codex",
      mode: codexRaw.result.mode,
      selectedTaskIds: codexRaw.selectedTaskIds,
      keptTaskIds: codexRaw.keptTaskIds,
      selectedItemIds: codexRaw.selectedItemIds,
      keptItemIds: codexRaw.keptItemIds,
      validation: codexRaw.validation,
      result: codexRaw.result,
    };
    const decisions = [openclaw, claude, codex];

    for (const decision of decisions) {
      assert.equal(decision.validation.valid, true, `${fixture.id}/${decision.hostId} validation`);
      assert.deepEqual(
        sorted(decision.selectedTaskIds),
        sorted(fixture.expected.evict_task_ids),
        `${fixture.id}/${decision.hostId} selected tasks`,
      );
      assert.deepEqual(
        sorted(decision.keptTaskIds),
        sorted(fixture.expected.keep_task_ids),
        `${fixture.id}/${decision.hostId} kept tasks`,
      );
      assert.deepEqual(
        sorted(decision.selectedItemIds),
        sorted(fixture.expected.evict_item_ids),
        `${fixture.id}/${decision.hostId} selected items`,
      );
      assert.deepEqual(
        sorted(decision.keptItemIds),
        sorted(fixture.expected.keep_item_ids),
        `${fixture.id}/${decision.hostId} kept items`,
      );
      assert.equal(
        decision.result.applied,
        fixture.expected.evict_task_ids.length > 0,
        `${fixture.id}/${decision.hostId} apply outcome`,
      );
      assert.equal(decision.result.fallbackUsed, false);
    }

    assert.deepEqual(
      decisions.map((decision) => sorted(decision.selectedTaskIds)),
      decisions.map(() => sorted(fixture.expected.evict_task_ids)),
      `${fixture.id} cross-host task targets`,
    );
    assert.deepEqual(
      decisions.map((decision) => sorted(decision.selectedItemIds)),
      decisions.map(() => sorted(fixture.expected.evict_item_ids)),
      `${fixture.id} cross-host item targets`,
    );
  }
});
