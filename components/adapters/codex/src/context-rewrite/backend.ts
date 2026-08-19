import { createHash } from "node:crypto";

import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  revalidateContextMutationPlan,
  validateContextMutationProtocolClosure,
  type ContextItemKind,
  type ContextItemRef,
  type ContextMutationPlan,
  type ContextRewriteResult,
  type ContextRewriteValidation,
  type ModelContextRewriteBackend,
  type ModelContextSnapshot,
} from "@lightrsi/host-adapter";

import { codexReplayPairRef } from "../context-history/replayability.js";
import type {
  CodexEffectiveHistory,
  CodexEffectiveHistoryItem,
  JsonObject,
} from "../context-history/types.js";
import { buildCodexRebaseRequest, validateCodexRebaseRequest } from "./rebase-request.js";
import type { CodexRebaseAccounting, CodexMutationPlan } from "./types.js";

const CODEX_HOST_ID = "codex";

export type CodexSharedBackendRequest = {
  sessionId: string;
  payload: JsonObject;
  effectiveHistory: CodexEffectiveHistory;
  currentInput?: unknown;
  taskIdsByItemId?: Record<string, string[]>;
  activeTaskIds?: string[];
  evictableTaskIds?: string[];
};

export type CodexSharedBackendMetadata = {
  effectiveHistory: CodexEffectiveHistory;
  currentInput: unknown;
  replayableItemIds: string[];
  activeTaskIds: string[];
  evictableTaskIds: string[];
};

export type CodexSharedBackendDetails = {
  rebasePrepared: true;
  accounting: CodexRebaseAccounting;
};

export type CodexSharedContextRewriteBackend = ModelContextRewriteBackend<
  CodexSharedBackendRequest,
  CodexSharedBackendMetadata,
  never,
  CodexSharedBackendDetails
>;

function hashJson(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value) ?? "undefined")
    .digest("hex");
}

function normalizedStrings(values: readonly string[] | undefined): string[] {
  return [...new Set(
    (values ?? [])
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}

function textChars(value: unknown): number {
  const serialized = JSON.stringify(value);
  return typeof serialized === "string" ? serialized.length : 0;
}

function itemKind(item: JsonObject): ContextItemKind {
  const type = String(item.type ?? "").trim().toLowerCase();
  const role = String(item.role ?? "").trim().toLowerCase();
  const replayPair = codexReplayPairRef(item);
  if (replayPair.side === "call") return "tool_call";
  if (replayPair.side === "output") return "tool_result";
  if (type === "reasoning") return "reasoning";
  if (type === "compaction") return "compaction";
  if (role === "system") return "system";
  if (role === "developer") return "developer";
  if (role === "user") return "user";
  if (role === "assistant" || type === "message") return "assistant";
  return "unknown";
}

function itemRef(
  entry: CodexEffectiveHistoryItem,
  taskIdsByItemId: Record<string, string[]> | undefined,
): ContextItemRef {
  const role = typeof entry.item.role === "string" && entry.item.role.trim()
    ? entry.item.role.trim()
    : undefined;
  const callId = entry.callId
    ?? (typeof entry.item.call_id === "string" ? entry.item.call_id.trim() : undefined);
  const taskIds = normalizedStrings(taskIdsByItemId?.[entry.stableItemId]);
  return {
    stableId: entry.stableItemId,
    kind: itemKind(entry.item),
    ...(role ? { role } : {}),
    ...(callId ? { callId } : {}),
    ...(taskIds.length > 0 ? { taskIds } : {}),
    fingerprint: hashJson(entry.item),
    chars: textChars(entry.item),
  };
}

function orderedOperationIds(
  plan: ContextMutationPlan,
  ids: ReadonlySet<string>,
): string[] {
  return [...new Set(plan.operations.map((operation) => operation.id))]
    .filter((operationId) => ids.has(operationId));
}

export function buildCodexContextSnapshot(
  request: CodexSharedBackendRequest,
): ModelContextSnapshot<CodexSharedBackendMetadata> {
  const sessionId = request.sessionId;
  const history = structuredClone(request.effectiveHistory);
  const allItems = [
    ...history.replayableItems,
    ...history.observationOnlyItems,
    ...history.deferredItems,
  ];
  const currentInput = structuredClone(request.currentInput ?? request.payload.input ?? []);
  return {
    schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    hostId: CODEX_HOST_ID,
    sessionId,
    revision: history.revision,
    items: allItems.map((entry) => itemRef(entry, request.taskIdsByItemId)),
    adapterMetadata: {
      effectiveHistory: history,
      currentInput,
      replayableItemIds: history.replayableItems.map((entry) => entry.stableItemId),
      activeTaskIds: normalizedStrings(request.activeTaskIds),
      evictableTaskIds: normalizedStrings(request.evictableTaskIds),
    },
  };
}

function snapshotsMatch(
  left: ModelContextSnapshot<CodexSharedBackendMetadata>,
  right: ModelContextSnapshot<CodexSharedBackendMetadata>,
): boolean {
  if (left.hostId !== right.hostId
    || left.sessionId !== right.sessionId
    || left.revision !== right.revision
    || left.items.length !== right.items.length) return false;
  const rightItems = new Map(right.items.map((item) => [item.stableId, item.fingerprint]));
  return left.items.every((item) => rightItems.get(item.stableId) === item.fingerprint);
}

function codexMutationPlanFor(
  plan: ContextMutationPlan,
  applicableOperationIds: ReadonlySet<string>,
): CodexMutationPlan {
  return {
    baseRevision: plan.baseRevision,
    operations: plan.operations
      .filter((operation) => applicableOperationIds.has(operation.id))
      .flatMap((operation) => operation.targetItemIds.map((stableItemId) => ({
        type: "evict",
        stableItemId,
      }))),
  };
}

function unchangedResult(params: {
  snapshot: ModelContextSnapshot<CodexSharedBackendMetadata>;
  plan: ContextMutationPlan;
  deferredOperationIds: string[];
  fallbackUsed: boolean;
}): ContextRewriteResult<CodexSharedBackendDetails> {
  return {
    schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    mode: "response_chain_rebase",
    planId: params.plan.planId,
    applied: false,
    changed: false,
    previousRevision: params.snapshot.revision,
    nextRevision: params.snapshot.revision,
    appliedOperationIds: [],
    deferredOperationIds: params.deferredOperationIds,
    removedItemIds: [],
    savedChars: 0,
    fallbackUsed: params.fallbackUsed,
  };
}

export const codexSharedContextRewriteBackend: CodexSharedContextRewriteBackend = {
  hostId: CODEX_HOST_ID,
  mode: "response_chain_rebase",

  async readSnapshot({ sessionId, request }) {
    if (request.sessionId !== sessionId) {
      throw new Error(`Codex shared backend session mismatch: expected ${sessionId}`);
    }
    return buildCodexContextSnapshot(request);
  },

  async validate({ snapshot, plan }) {
    const structural = revalidateContextMutationPlan({ snapshot, plan });
    if (!structural.valid) return structural;

    const metadata = snapshot.adapterMetadata;
    if (!metadata || metadata.effectiveHistory.revision !== snapshot.revision) {
      return {
        valid: false,
        applicableOperationIds: [],
        deferredOperationIds: [...new Set(plan.operations.map((operation) => operation.id))],
        reasons: [...structural.reasons, "codex_snapshot_metadata_invalid"],
      };
    }

    const reasons = [...structural.reasons];
    const deferred = new Set(structural.deferredOperationIds);
    const candidates = new Set(structural.applicableOperationIds);
    const replayableItemIds = new Set(metadata.replayableItemIds);
    const claimedItemIds = new Set<string>();

    const defer = (operationId: string, reason: string): void => {
      candidates.delete(operationId);
      deferred.add(operationId);
      reasons.push(`operation:${operationId || "<empty>"}:${reason}`);
    };

    if (metadata.effectiveHistory.incomplete) {
      for (const operationId of [...candidates]) {
        defer(operationId, "effective_history_incomplete");
      }
    }

    for (const operation of plan.operations) {
      if (!candidates.has(operation.id)) continue;
      if (operation.type !== "remove") {
        defer(operation.id, "unsupported_operation");
        continue;
      }
      if (Array.isArray(operation.replacementItems)
        && operation.replacementItems.length > 0) {
        defer(operation.id, "native_replacement_unsupported");
        continue;
      }
      if (operation.targetItemIds.some((itemId) => !replayableItemIds.has(itemId))) {
        defer(operation.id, "target_not_replayable");
        continue;
      }
      if (operation.targetItemIds.some((itemId) => claimedItemIds.has(itemId))) {
        defer(operation.id, "target_overlap");
        continue;
      }
      for (const itemId of operation.targetItemIds) claimedItemIds.add(itemId);
    }

    const closure = validateContextMutationProtocolClosure({
      snapshot,
      plan,
      activeTaskIds: metadata.activeTaskIds,
      evictableTaskIds: metadata.evictableTaskIds,
      candidateOperationIds: orderedOperationIds(plan, candidates),
    });
    reasons.push(...closure.reasons);
    for (const operationId of closure.deferredOperationIds) {
      candidates.delete(operationId);
      deferred.add(operationId);
    }

    if (candidates.size > 0) {
      const codexValidation = validateCodexRebaseRequest({
        baseRevision: snapshot.revision,
        effectiveHistory: metadata.effectiveHistory,
        currentInput: metadata.currentInput,
        mutationPlan: codexMutationPlanFor(plan, candidates),
      });
      if (!codexValidation.valid) {
        reasons.push(...codexValidation.reasons.map((reason) => `codex:${reason}`));
        for (const operationId of [...candidates]) deferred.add(operationId);
        candidates.clear();
      }
    }

    return {
      valid: true,
      applicableOperationIds: orderedOperationIds(plan, candidates),
      deferredOperationIds: orderedOperationIds(plan, deferred),
      reasons: [...new Set(reasons)],
    };
  },

  async apply({ snapshot, plan, request }) {
    const validation = await this.validate({ snapshot, plan });
    const allOperationIds = [...new Set(plan.operations.map((operation) => operation.id))];
    if (!validation.valid || validation.applicableOperationIds.length === 0) {
      return {
        request,
        result: unchangedResult({
          snapshot,
          plan,
          deferredOperationIds: validation.valid
            ? validation.deferredOperationIds
            : allOperationIds,
          fallbackUsed: false,
        }),
      };
    }

    try {
      const currentSnapshot = buildCodexContextSnapshot(request);
      if (!snapshotsMatch(snapshot, currentSnapshot)) {
        return {
          request,
          result: unchangedResult({
            snapshot,
            plan,
            deferredOperationIds: allOperationIds,
            fallbackUsed: false,
          }),
        };
      }

      const applicable = new Set(validation.applicableOperationIds);
      const mutationPlan = codexMutationPlanFor(plan, applicable);
      const rebased = buildCodexRebaseRequest({
        sessionId: snapshot.sessionId,
        planId: plan.planId,
        baseRevision: snapshot.revision,
        originalPayload: request.payload,
        effectiveHistory: request.effectiveHistory,
        currentInput: request.currentInput ?? request.payload.input,
        mutationPlan,
      });
      const removedItemIds = plan.operations
        .filter((operation) => applicable.has(operation.id))
        .flatMap((operation) => operation.targetItemIds);
      return {
        request: {
          ...request,
          payload: rebased.payload,
        },
        result: {
          schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
          mode: "response_chain_rebase",
          planId: plan.planId,
          applied: validation.applicableOperationIds.length > 0,
          changed: removedItemIds.length > 0,
          previousRevision: snapshot.revision,
          nextRevision: rebased.rebaseRevision,
          appliedOperationIds: validation.applicableOperationIds,
          deferredOperationIds: validation.deferredOperationIds,
          removedItemIds,
          savedChars: rebased.accounting.actuallyRemovedChars,
          fallbackUsed: false,
          details: {
            rebasePrepared: true,
            accounting: rebased.accounting,
          },
        },
      };
    } catch {
      return {
        request,
        result: unchangedResult({
          snapshot,
          plan,
          deferredOperationIds: allOperationIds,
          fallbackUsed: true,
        }),
      };
    }
  },
};

export type CodexSharedGoldenItem = {
  id: string;
  kind: string;
  role?: string;
  content?: string;
  tool_name?: string;
  tool_call_id?: string;
  arguments?: Record<string, unknown>;
  result?: string;
};

export type CodexSharedGoldenTask = {
  id: string;
  status: "active" | "completed" | "unresolved";
  current?: boolean;
  items: CodexSharedGoldenItem[];
};

export type CodexSharedGoldenFixture = {
  id: string;
  tasks: CodexSharedGoldenTask[];
  expectedEvictTaskIds?: string[];
  expectedEvictItemIds?: string[];
};

export type CodexSharedGoldenDecision = {
  hostId: "codex";
  fixtureId: string;
  selectedTaskIds: string[];
  keptTaskIds: string[];
  selectedItemIds: string[];
  keptItemIds: string[];
  validation: ContextRewriteValidation;
  result: ContextRewriteResult<CodexSharedBackendDetails>;
};

function fixtureItemPayload(item: CodexSharedGoldenItem): JsonObject {
  if (item.kind === "tool_call") {
    return {
      type: "function_call",
      call_id: item.tool_call_id,
      name: item.tool_name ?? "fixture_tool",
      arguments: JSON.stringify(item.arguments ?? {}),
    };
  }
  if (item.kind === "tool_result") {
    return {
      type: "function_call_output",
      call_id: item.tool_call_id,
      output: item.result ?? "",
    };
  }
  const role = item.role ?? "user";
  return {
    type: "message",
    role,
    content: [{
      type: role === "assistant" ? "output_text" : "input_text",
      text: item.content ?? "",
    }],
  };
}

export async function runCodexSharedGoldenFixture(
  fixture: CodexSharedGoldenFixture,
): Promise<CodexSharedGoldenDecision> {
  const sessionId = `gua-02-${fixture.id}`;
  const allItems = fixture.tasks.flatMap((task) => task.items);
  const historyItems: CodexEffectiveHistoryItem[] = allItems.map((item) => ({
    stableItemId: item.id,
    nativeId: `fixture:${item.id}`,
    callId: item.tool_call_id,
    item: fixtureItemPayload(item),
  }));
  const taskIdsByItemId = Object.fromEntries(
    fixture.tasks.flatMap((task) => task.items.map((item) => [item.id, [task.id]])),
  );
  const selectedTaskIds = new Set(fixture.expectedEvictTaskIds ?? fixture.tasks
    .filter((task) => task.status === "completed" && task.current !== true)
    .map((task) => task.id));
  const selectedItemIds = fixture.expectedEvictItemIds
    ? new Set(fixture.expectedEvictItemIds)
    : undefined;
  const evictableTasks = fixture.tasks.filter((task) => selectedTaskIds.has(task.id));
  const activeTasks = fixture.tasks.filter((task) => !selectedTaskIds.has(task.id));
  const request: CodexSharedBackendRequest = {
    sessionId,
    payload: {
      model: "fixture-model",
      previous_response_id: "fixture-parent",
      input: [],
    },
    effectiveHistory: {
      revision: `codex-gua-rev-${hashJson(fixture)}`,
      replayableItems: historyItems,
      observationOnlyItems: [],
      deferredItems: [],
      unresolvedCallIds: [],
      source: "proxy_journal",
      incomplete: false,
    },
    currentInput: [],
    taskIdsByItemId,
    activeTaskIds: activeTasks.map((task) => task.id),
    evictableTaskIds: evictableTasks.map((task) => task.id),
  };
  const snapshot = await codexSharedContextRewriteBackend.readSnapshot({ sessionId, request });
  const itemById = new Map(snapshot.items.map((item) => [item.stableId, item]));
  const plan: ContextMutationPlan = {
    schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    planId: `gua-02-plan-${fixture.id}`,
    hostId: CODEX_HOST_ID,
    sessionId,
    baseRevision: snapshot.revision,
    sourceModuleId: "gua-02",
    operations: evictableTasks.map((task) => {
      const targetItemIds = task.items
        .map((item) => item.id)
        .filter((itemId) => selectedItemIds?.has(itemId) ?? true);
      return {
        id: `gua-02-op-${task.id}`,
        type: "remove",
        targetItemIds,
        targetItemFingerprints: Object.fromEntries(
          targetItemIds.map((itemId) => [itemId, itemById.get(itemId)!.fingerprint]),
        ),
        taskIds: [task.id],
        rationale: "evict completed fixture task",
        estimatedSavedChars: targetItemIds.reduce(
          (total, itemId) => total + (itemById.get(itemId)?.chars ?? 0),
          0,
        ),
      };
    }),
    createdAt: "2026-08-09T00:00:00.000Z",
  };
  const validation = await codexSharedContextRewriteBackend.validate({ snapshot, plan });
  const applied = await codexSharedContextRewriteBackend.apply({ snapshot, plan, request });
  const appliedOperationIds = new Set(applied.result.appliedOperationIds);
  const appliedTaskIds = evictableTasks
    .filter((task) => appliedOperationIds.has(`gua-02-op-${task.id}`))
    .map((task) => task.id);
  const selectedItems = new Set(plan.operations
    .filter((operation) => appliedOperationIds.has(operation.id))
    .flatMap((operation) => operation.targetItemIds));
  const selectedTasks = new Set(appliedTaskIds);
  return {
    hostId: "codex",
    fixtureId: fixture.id,
    selectedTaskIds: appliedTaskIds,
    keptTaskIds: fixture.tasks.map((task) => task.id).filter((taskId) => !selectedTasks.has(taskId)),
    selectedItemIds: allItems.map((item) => item.id).filter((itemId) => selectedItems.has(itemId)),
    keptItemIds: allItems.map((item) => item.id).filter((itemId) => !selectedItems.has(itemId)),
    validation,
    result: applied.result,
  };
}
