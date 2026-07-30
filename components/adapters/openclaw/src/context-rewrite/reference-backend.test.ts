import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  type ContextMutationPlan,
} from "@lightmem2/host-adapter";

import {
  createOpenClawReferenceBackend,
  type OpenClawReferenceBackendRequest,
} from "./reference-backend.js";

const fixtureDirectory = path.join(
  __dirname,
  "fixtures",
  "reference-backend",
);

function readFixture(
  fileName: string,
): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(
      path.join(fixtureDirectory, fileName),
      "utf8",
    ),
  ) as Record<string, unknown>;
}

function contentToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";

  return value
    .map((block) => {
      if (!block || typeof block !== "object") {
        return "";
      }

      return String(
        (block as Record<string, unknown>).text ?? "",
      );
    })
    .join("");
}

function taskIdsFor(
  message: Record<string, unknown>,
): string[] {
  const details = message.details as {
    contextSafe?: {
      taskIds?: string[];
    };
  } | undefined;

  return details?.contextSafe?.taskIds ?? [];
}

function createRequest(
  messages: Record<string, unknown>[],
): OpenClawReferenceBackendRequest {
  return {
    stateDir: "/tmp/openclaw-reference-backend",
    sessionId: "session-1",
    state: {
      version: 1,
      sessionId: "session-1",
      messages,
      seenMessageIds: messages.map(
        (message) => String(message.messageId),
      ),
      updatedAt: "2026-07-30T00:00:00.000Z",
    },
    evictionEnabled: true,
    evictionPolicy: "model_scored",
    evictionMinBlockChars: 1,
    evictionReplacementMode: "pointer_stub",
    helpers: {
      appendTaskStateTrace: async () => undefined,
      appendEvictionVisualSnapshot:
        async () => undefined,

      asRecord: (value) =>
        value
        && typeof value === "object"
        && !Array.isArray(value)
          ? value as Record<string, unknown>
          : undefined,

      canonicalMessageTaskIds: taskIdsFor,
      contentToText,

      dedupeStrings: (values) => [
        ...new Set(values),
      ],

      ensureContextSafeDetails: (
        _details,
        patch,
      ) => ({
        contextSafe: patch,
      }),

      extractPathLike: () => undefined,

      extractToolMessageText: (message) =>
        contentToText(message.content),

      isToolResultLikeMessage: (message) =>
        ["tool", "toolresult"].includes(
          String(
            message.role ?? "",
          ).toLowerCase(),
        ),

      logger: {
        info: () => undefined,
      },

      messageToolCallId: (message) =>
        typeof message.tool_call_id === "string"
          ? message.tool_call_id
          : typeof message.toolCallId === "string"
            ? message.toolCallId
            : undefined,

      safeId: (value) => value,
    },
  };
}

function createPlan(params: {
  snapshotRevision: string;
  targetItemIds: string[];
  type?: "remove" | "replace";
}): ContextMutationPlan {
  return {
    schemaVersion:
      MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    planId: "plan-1",
    hostId: "openclaw",
    sessionId: "session-1",
    baseRevision: params.snapshotRevision,
    sourceModuleId: "eviction",
    operations: [
      {
        id: "operation-1",
        type: params.type ?? "replace",
        targetItemIds: params.targetItemIds,
        taskIds: ["task-completed"],
        rationale: "page out completed task",
        estimatedSavedChars: 20,
      },
    ],
    createdAt: "2026-07-30T00:00:00.000Z",
  };
}

test(
  "maps canonical, tool, and pointer fixtures into shared item kinds",
  async () => {
    const request = createRequest([
      readFixture("canonical-message.json"),
      readFixture("tool-call.json"),
      readFixture("tool-result.json"),
      readFixture("pointer-stub.json"),
    ]);

    const backend =
      createOpenClawReferenceBackend();

    const snapshot = await backend.readSnapshot({
      sessionId: request.sessionId,
      request,
    });

    assert.equal(snapshot.hostId, "openclaw");

    assert.deepEqual(
      snapshot.items.map((item) => item.kind),
      [
        "user",
        "tool_call",
        "tool_result",
        "compaction",
      ],
    );

    assert.equal(
      snapshot.items[1]?.callId,
      "call-fixture-1",
    );

    assert.equal(
      snapshot.items[2]?.callId,
      "call-fixture-1",
    );

    assert.deepEqual(
      snapshot.items[0]?.taskIds,
      ["task-completed"],
    );
  },
);

test(
  "defers a plan that would split a tool call from its result",
  async () => {
    const request = createRequest([
      readFixture("tool-call.json"),
      readFixture("tool-result.json"),
    ]);

    const backend =
      createOpenClawReferenceBackend();

    const snapshot = await backend.readSnapshot({
      sessionId: request.sessionId,
      request,
    });

    const plan = createPlan({
      snapshotRevision: snapshot.revision,
      targetItemIds: ["fixture-tool-call"],
      type: "remove",
    });

    const validation = await backend.validate({
      snapshot,
      plan,
    });

    assert.equal(validation.valid, true);

    assert.deepEqual(
      validation.applicableOperationIds,
      [],
    );

    assert.deepEqual(
      validation.deferredOperationIds,
      ["operation-1"],
    );

    assert.match(
      validation.reasons[0] ?? "",
      /tool closure/,
    );
  },
);

test(
  "delegates canonical rewrite and emits ContextRewriteResult",
  async () => {
    const active = {
      ...readFixture("canonical-message.json"),
      messageId: "fixture-active",
      content: "active task must remain",
      details: {
        contextSafe: {
          taskIds: ["task-active"],
        },
      },
    };

    const request = createRequest([
      readFixture("canonical-message.json"),
      readFixture("tool-call.json"),
      readFixture("tool-result.json"),
      active,
    ]);

    const backend =
      createOpenClawReferenceBackend({
        rewriteCanonicalState:
          async (params) => ({
            state: {
              ...params.state,
              messages: [
                readFixture(
                  "pointer-stub.json",
                ),
                params.state.messages[3],
              ],
              updatedAt:
                "2026-07-30T00:01:00.000Z",
            },
            changed: true,
            appliedEvictionTaskIds: [
              "task-completed",
            ],
          }),
      });

    const snapshot = await backend.readSnapshot({
      sessionId: request.sessionId,
      request,
    });

    const plan = createPlan({
      snapshotRevision: snapshot.revision,
      targetItemIds: [
        "fixture-canonical",
        "fixture-tool-call",
        "fixture-tool-result",
      ],
    });

    const applied = await backend.apply({
      snapshot,
      plan,
      request,
    });

    assert.equal(
      applied.result.mode,
      "canonical",
    );

    assert.equal(
      applied.result.applied,
      true,
    );

    assert.equal(
      applied.result.changed,
      true,
    );

    assert.deepEqual(
      applied.result.appliedOperationIds,
      ["operation-1"],
    );

    assert.deepEqual(
      applied.result.deferredOperationIds,
      [],
    );

    assert.deepEqual(
      applied.result.removedItemIds,
      [
        "fixture-canonical",
        "fixture-tool-call",
        "fixture-tool-result",
      ],
    );

    assert.deepEqual(
      applied.result.details?.appliedTaskIds,
      ["task-completed"],
    );

    assert.equal(
      applied.result.details?.replacementMode,
      "pointer_stub",
    );

    assert.equal(
      applied.request.state.messages.length,
      2,
    );
  },
);
