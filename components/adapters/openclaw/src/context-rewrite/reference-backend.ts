import { createHash } from "node:crypto";

import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  type ContextItemKind,
  type ContextItemRef,
  type ContextMutationPlan,
  type ContextRewriteResult,
  type ContextRewriteValidation,
  type ModelContextRewriteBackend,
  type ModelContextSnapshot,
} from "@lightmem2/host-adapter";
import { estimateMessagesChars, type CanonicalTranscriptState } from "@lightmem2/history";

import { rewriteCanonicalState } from "../context-stack/page-out/canonical-rewrite-adapter.js";

const OPENCLAW_HOST_ID = "openclaw";

type CanonicalRewriteRequest = Parameters<typeof rewriteCanonicalState>[0];

export type OpenClawReferenceBackendRequest = CanonicalRewriteRequest;

export type OpenClawReferenceBackendMetadata = {
  canonicalState: CanonicalTranscriptState;
};

export type OpenClawReferenceBackendDetails = {
  appliedTaskIds: string[];
  beforeMessageCount: number;
  afterMessageCount: number;
  replacementMode: "pointer_stub" | "drop";
};

type OpenClawReferenceBackend = ModelContextRewriteBackend<
  OpenClawReferenceBackendRequest,
  OpenClawReferenceBackendMetadata,
  never,
  OpenClawReferenceBackendDetails
>;

type ReferenceBackendDependencies = {
  rewriteCanonicalState: typeof rewriteCanonicalState;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function hash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value) ?? "undefined")
    .digest("hex");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function contentBlocks(
  message: Record<string, unknown>,
): Record<string, unknown>[] {
  return Array.isArray(message.content)
    ? message.content
        .map(asRecord)
        .filter(
          (block): block is Record<string, unknown> => block !== undefined,
        )
    : [];
}

function normalizedType(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("-", "_");
}

function firstToolCall(
  message: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const direct = calls
    .map(asRecord)
    .find(
      (call): call is Record<string, unknown> => call !== undefined,
    );

  if (direct) return direct;

  return contentBlocks(message).find((block) =>
    [
      "toolcall",
      "tool_call",
      "tool_use",
      "function_call",
      "custom_tool_call",
    ].includes(normalizedType(block.type)),
  );
}

function messageCallId(
  message: Record<string, unknown>,
): string | undefined {
  return (
    stringValue(message.tool_call_id)
    ?? stringValue(message.toolCallId)
    ?? stringValue(firstToolCall(message)?.id)
    ?? stringValue(firstToolCall(message)?.call_id)
    ?? contentBlocks(message)
      .map(
        (block) =>
          stringValue(block.tool_use_id)
          ?? stringValue(block.call_id),
      )
      .find((id): id is string => id !== undefined)
  );
}

function messageTaskIds(
  message: Record<string, unknown>,
  request: OpenClawReferenceBackendRequest,
): string[] | undefined {
  const fromHelper = request.helpers.canonicalMessageTaskIds(message);
  const direct = Array.isArray(message.taskIds)
    ? message.taskIds.filter(
        (value): value is string => stringValue(value) !== undefined,
      )
    : [];

  const taskIds = [
    ...new Set(
      [...fromHelper, ...direct]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];

  return taskIds.length > 0 ? taskIds : undefined;
}

function isPointerStub(message: Record<string, unknown>): boolean {
  const details = asRecord(message.details);
  const contextSafe = asRecord(details?.contextSafe);
  const eviction = asRecord(contextSafe?.eviction);

  return eviction?.kind === "cached_pointer_stub";
}

function messageKind(
  message: Record<string, unknown>,
  request: OpenClawReferenceBackendRequest,
): ContextItemKind {
  if (isPointerStub(message)) return "compaction";

  const role = String(message.role ?? "").trim().toLowerCase();
  const type = normalizedType(message.type);
  const blockTypes = contentBlocks(message).map((block) =>
    normalizedType(block.type),
  );

  if (
    request.helpers.isToolResultLikeMessage(message)
    || role === "tool"
    || role === "toolresult"
    || type === "tool_result"
    || type === "toolresult"
    || type === "function_call_output"
    || type === "custom_tool_call_output"
    || blockTypes.includes("tool_result")
  ) {
    return "tool_result";
  }

  if (
    type === "tool_call"
    || type === "function_call"
    || type === "custom_tool_call"
    || Array.isArray(message.tool_calls)
    || blockTypes.some((blockType) =>
      [
        "toolcall",
        "tool_call",
        "tool_use",
        "function_call",
        "custom_tool_call",
      ].includes(blockType),
    )
  ) {
    return "tool_call";
  }

  if (role === "system") return "system";
  if (role === "developer") return "developer";
  if (role === "user") return "user";
  if (role === "assistant") return "assistant";
  if (role === "reasoning" || type === "reasoning") return "reasoning";
  if (type === "compaction") return "compaction";

  return "unknown";
}

function explicitMessageId(
  message: Record<string, unknown>,
): string | undefined {
  return (
    stringValue(message.messageId)
    ?? stringValue(message.message_id)
    ?? stringValue(message.id)
  );
}

function buildItems(
  request: OpenClawReferenceBackendRequest,
): ContextItemRef[] {
  const occurrences = new Map<string, number>();

  return request.state.messages.map((rawMessage) => {
    const message = asRecord(rawMessage) ?? {};
    const fingerprint = hash(message);
    const kind = messageKind(message, request);
    const occurrence = occurrences.get(fingerprint) ?? 0;

    occurrences.set(fingerprint, occurrence + 1);

    const stableId =
      explicitMessageId(message)
      ?? `openclaw:${fingerprint.slice(0, 24)}:${occurrence}`;
    const role = stringValue(message.role);
    const callId = messageCallId(message);
    const taskIds = messageTaskIds(message, request);

    return {
      stableId,
      kind,
      ...(role ? { role } : {}),
      ...(callId && (kind === "tool_call" || kind === "tool_result")
        ? { callId }
        : {}),
      ...(taskIds ? { taskIds } : {}),
      fingerprint,
      chars: request.helpers.contentToText(
        message.content ?? "",
      ).length,
    };
  });
}

function revisionFor(state: CanonicalTranscriptState): string {
  return hash({
    version: state.version,
    sessionId: state.sessionId,
    messages: state.messages,
  });
}

function snapshotFor(
  sessionId: string,
  request: OpenClawReferenceBackendRequest,
): ModelContextSnapshot<OpenClawReferenceBackendMetadata> {
  if (
    request.sessionId !== sessionId
    || request.state.sessionId !== sessionId
  ) {
    throw new Error(`OpenClaw session mismatch: expected ${sessionId}`);
  }

  return {
    schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    hostId: OPENCLAW_HOST_ID,
    sessionId,
    revision: revisionFor(request.state),
    items: buildItems(request),
    adapterMetadata: {
      canonicalState: request.state,
    },
  };
}

function unchangedResult(params: {
  snapshot: ModelContextSnapshot<OpenClawReferenceBackendMetadata>;
  plan: ContextMutationPlan;
  validation: ContextRewriteValidation;
}): ContextRewriteResult<OpenClawReferenceBackendDetails> {
  return {
    schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    mode: "canonical",
    planId: params.plan.planId,
    applied: false,
    changed: false,
    previousRevision: params.snapshot.revision,
    nextRevision: params.snapshot.revision,
    appliedOperationIds: [],
    deferredOperationIds: params.validation.deferredOperationIds,
    removedItemIds: [],
    savedChars: 0,
    fallbackUsed: false,
  };
}

export function createOpenClawReferenceBackend(
  dependencies: Partial<ReferenceBackendDependencies> = {},
): OpenClawReferenceBackend {
  const rewrite =
    dependencies.rewriteCanonicalState ?? rewriteCanonicalState;

  return {
    hostId: OPENCLAW_HOST_ID,
    mode: "canonical",

    async readSnapshot({ sessionId, request }) {
      return snapshotFor(sessionId, request);
    },

    async validate({ snapshot, plan }) {
      const fatalReasons: string[] = [];
      const reasons: string[] = [];
      const deferredOperationIds: string[] = [];
      const applicableOperationIds: string[] = [];

      const snapshotItemIds = new Set(
        snapshot.items.map((item) => item.stableId),
      );
      const allTargetIds = new Set(
        plan.operations.flatMap(
          (operation) => operation.targetItemIds,
        ),
      );
      const callIdsByTarget = new Map(
        snapshot.items
          .filter((item) => item.callId)
          .map(
            (item) =>
              [item.stableId, item.callId!] as const,
          ),
      );
      const itemIdsByCallId = new Map<string, string[]>();

      for (const item of snapshot.items) {
        if (!item.callId) continue;

        itemIdsByCallId.set(item.callId, [
          ...(itemIdsByCallId.get(item.callId) ?? []),
          item.stableId,
        ]);
      }

      if (
        plan.schemaVersion
        !== MODEL_CONTEXT_REWRITE_SCHEMA_VERSION
      ) {
        fatalReasons.push(
          `unsupported schema version: ${plan.schemaVersion}`,
        );
      }

      if (
        snapshot.hostId !== OPENCLAW_HOST_ID
        || plan.hostId !== OPENCLAW_HOST_ID
      ) {
        fatalReasons.push("hostId must be openclaw");
      }

      if (plan.sessionId !== snapshot.sessionId) {
        fatalReasons.push(
          "plan sessionId does not match snapshot",
        );
      }

      if (plan.baseRevision !== snapshot.revision) {
        fatalReasons.push(
          "plan baseRevision does not match snapshot",
        );
      }

      const seenOperationIds = new Set<string>();

      for (const operation of plan.operations) {
        let deferredReason: string | undefined;

        if (
          !operation.id
          || seenOperationIds.has(operation.id)
        ) {
          deferredReason =
            `duplicate or empty operation id: ${
              operation.id || "<empty>"
            }`;
        } else if (operation.targetItemIds.length === 0) {
          deferredReason =
            `operation ${operation.id} has no targets`;
        } else if (
          operation.targetItemIds.some(
            (id) => !snapshotItemIds.has(id),
          )
        ) {
          deferredReason =
            `operation ${operation.id} targets missing items`;
        } else {
          const affectedCallIds = new Set(
            operation.targetItemIds
              .map((id) => callIdsByTarget.get(id))
              .filter(
                (id): id is string => id !== undefined,
              ),
          );

          const breaksToolClosure =
            [...affectedCallIds].some((callId) =>
              (itemIdsByCallId.get(callId) ?? []).some(
                (id) => !allTargetIds.has(id),
              ),
            );

          if (breaksToolClosure) {
            deferredReason =
              `operation ${operation.id} would break tool closure`;
          }
        }

        seenOperationIds.add(operation.id);

        if (deferredReason) {
          deferredOperationIds.push(operation.id);
          reasons.push(deferredReason);
        } else {
          applicableOperationIds.push(operation.id);
        }
      }

      reasons.unshift(...fatalReasons);

      if (fatalReasons.length > 0) {
        return {
          valid: false,
          applicableOperationIds: [],
          deferredOperationIds: plan.operations.map(
            (operation) => operation.id,
          ),
          reasons,
        };
      }

      return {
        valid: true,
        applicableOperationIds,
        deferredOperationIds,
        reasons,
      };
    },

    async apply({ snapshot, plan, request }) {
      const validation = await this.validate({
        snapshot,
        plan,
      });

      if (
        !validation.valid
        || validation.applicableOperationIds.length === 0
      ) {
        return {
          request,
          result: unchangedResult({
            snapshot,
            plan,
            validation,
          }),
        };
      }

      const beforeChars = estimateMessagesChars(
        request.state.messages,
        request.helpers.contentToText,
      );

      const rewritten = await rewrite(request);

      const nextRequest: OpenClawReferenceBackendRequest = {
        ...request,
        state: rewritten.state,
      };
      const nextSnapshot = snapshotFor(
        request.sessionId,
        nextRequest,
      );
      const nextItemIds = new Set(
        nextSnapshot.items.map((item) => item.stableId),
      );
      const nextItemsById = new Map(
        nextSnapshot.items.map(
          (item) => [item.stableId, item],
        ),
      );
      const previousItemsById = new Map(
        snapshot.items.map(
          (item) => [item.stableId, item],
        ),
      );
      const removedItemIds = snapshot.items
        .map((item) => item.stableId)
        .filter((id) => !nextItemIds.has(id));
      const removedSet = new Set(removedItemIds);
      const applicableSet = new Set(
        validation.applicableOperationIds,
      );

      const appliedOperationIds = plan.operations
        .filter((operation) => {
          if (!applicableSet.has(operation.id)) {
            return false;
          }

          return operation.targetItemIds.every((id) => {
            if (removedSet.has(id)) return true;
            if (operation.type !== "replace") return false;

            return (
              nextItemsById.get(id)?.fingerprint
              !== previousItemsById.get(id)?.fingerprint
            );
          });
        })
        .map((operation) => operation.id);

      const appliedSet = new Set(appliedOperationIds);
      const deferredOperationIds = [
        ...validation.deferredOperationIds,
        ...validation.applicableOperationIds.filter(
          (id) => !appliedSet.has(id),
        ),
      ];

      const afterChars = estimateMessagesChars(
        rewritten.state.messages,
        request.helpers.contentToText,
      );

      return {
        request: nextRequest,
        result: {
          schemaVersion:
            MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
          mode: "canonical",
          planId: plan.planId,
          applied: appliedOperationIds.length > 0,
          changed: rewritten.changed,
          previousRevision: snapshot.revision,
          nextRevision: nextSnapshot.revision,
          appliedOperationIds,
          deferredOperationIds,
          removedItemIds,
          savedChars: Math.max(
            0,
            beforeChars - afterChars,
          ),
          fallbackUsed: false,
          details: {
            appliedTaskIds:
              rewritten.appliedEvictionTaskIds,
            beforeMessageCount:
              request.state.messages.length,
            afterMessageCount:
              rewritten.state.messages.length,
            replacementMode:
              request.evictionReplacementMode === "drop"
                ? "drop"
                : "pointer_stub",
          },
        },
      };
    },
  };
}

export const openClawReferenceBackend =
  createOpenClawReferenceBackend();
