import { createHash } from "node:crypto";

import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  type ContextMutationOperation,
  type ContextMutationPlan,
  type ModelContextSnapshot,
} from "@lightmem2/host-adapter";
import type { SessionTaskRegistry } from "@lightmem2/history";

import type { EvictionBlock, EvictionDecision, EvictionInstruction } from "./types.js";

const EVICTION_PLAN_ID_VERSION = 1 as const;

export type EvictionContextMutationPlanParams<TAdapterMetadata = never> = {
  decision: EvictionDecision;
  registry: SessionTaskRegistry;
  snapshot: ModelContextSnapshot<TAdapterMetadata>;
  /** Maps history message/segment IDs to their normalized context stable IDs. */
  stableItemIdsByMessageId?: Readonly<Record<string, readonly string[]>>;
  createdAt: string;
  sourcePresetId?: string;
};

export type EvictionContextMutationPlanResult = {
  plan?: ContextMutationPlan;
  deferredBlockIds: string[];
  reasons: string[];
};

function uniqueNonEmptyStrings(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function digestId(prefix: string, value: unknown): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
  return `${prefix}-v${EVICTION_PLAN_ID_VERSION}-${digest}`;
}

function instructionTaskIds(
  instruction: EvictionInstruction,
  block: EvictionBlock,
  registry: SessionTaskRegistry,
): string[] {
  const direct = Array.isArray(instruction.parameters?.taskIds)
    ? uniqueNonEmptyStrings(instruction.parameters.taskIds)
    : [];
  if (direct.length > 0) return direct;

  return uniqueNonEmptyStrings([
    ...(registry.blockToTaskIds[block.id] ?? []),
    ...block.messageIds.flatMap(
      (messageId) => registry.blockToTaskIds[messageId] ?? [],
    ),
  ]);
}

function resolveTargetItemIds(
  block: EvictionBlock,
  stableItemIdsByMessageId: Readonly<Record<string, readonly string[]>> | undefined,
  itemsByStableId: ReadonlyMap<string, { fingerprint: string }>,
): string[] | undefined {
  const targetItemIds: string[] = [];
  for (const messageId of uniqueNonEmptyStrings(block.messageIds)) {
    const mappedIds = stableItemIdsByMessageId?.[messageId];
    const candidates = mappedIds === undefined
      ? [messageId]
      : uniqueNonEmptyStrings(mappedIds);
    if (
      candidates.length === 0
      || candidates.some((stableId) => !itemsByStableId.has(stableId))
    ) {
      return undefined;
    }
    targetItemIds.push(...candidates);
  }
  const uniqueTargetItemIds = uniqueNonEmptyStrings(targetItemIds);
  return uniqueTargetItemIds.length > 0 ? uniqueTargetItemIds : undefined;
}

function operationForInstruction(params: {
  instruction: EvictionInstruction;
  block: EvictionBlock;
  taskIds: string[];
  targetItemIds: string[];
  snapshot: ModelContextSnapshot<unknown>;
}): ContextMutationOperation {
  const targetItemFingerprints = Object.fromEntries(
    params.targetItemIds.map((stableId) => [
      stableId,
      params.snapshot.items.find((item) => item.stableId === stableId)!.fingerprint,
    ]),
  );
  const rationale = params.instruction.rationale.trim();
  const id = digestId("ctxop", {
    baseRevision: params.snapshot.revision,
    blockId: params.block.id,
    estimatedSavedChars: params.instruction.estimatedSavedChars,
    rationale,
    sessionId: params.snapshot.sessionId,
    targetItemFingerprints,
    targetItemIds: params.targetItemIds,
    taskIds: params.taskIds,
  });
  return {
    id,
    type: "remove",
    targetItemIds: params.targetItemIds,
    targetItemFingerprints,
    taskIds: params.taskIds,
    rationale,
    estimatedSavedChars: params.instruction.estimatedSavedChars,
  };
}

export function buildContextMutationPlanFromEviction<
  TAdapterMetadata = never,
>(
  params: EvictionContextMutationPlanParams<TAdapterMetadata>,
): EvictionContextMutationPlanResult {
  if (!params.decision.enabled) {
    return { deferredBlockIds: [], reasons: ["eviction_disabled"] };
  }
  if (params.decision.instructions.length === 0) {
    return { deferredBlockIds: [], reasons: ["no_eviction_instructions"] };
  }

  const itemsByStableId = new Map(
    params.snapshot.items.map((item) => [item.stableId, item]),
  );
  const blocksById = new Map<string, EvictionBlock[]>();
  for (const block of params.decision.blocks) {
    const normalizedId = block.id.trim();
    if (!normalizedId) continue;
    blocksById.set(normalizedId, [
      ...(blocksById.get(normalizedId) ?? []),
      block,
    ]);
  }

  const evictableTaskIds = new Set(
    uniqueNonEmptyStrings(params.registry.evictableTaskIds),
  );
  const claimedTargetItemIds = new Set<string>();
  const deferredBlockIds: string[] = [];
  const reasons: string[] = [];
  const operations: ContextMutationOperation[] = [];

  const defer = (blockId: string, reason: string): void => {
    if (!deferredBlockIds.includes(blockId)) deferredBlockIds.push(blockId);
    reasons.push(`block:${blockId || "<empty>"}:${reason}`);
  };

  for (const instruction of params.decision.instructions) {
    const blockId = instruction.blockId.trim();
    const matchingBlocks = blocksById.get(blockId) ?? [];
    if (matchingBlocks.length !== 1) {
      defer(blockId, matchingBlocks.length === 0 ? "missing" : "ambiguous");
      continue;
    }
    const block = matchingBlocks[0]!;
    const taskIds = instructionTaskIds(instruction, block, params.registry);
    if (taskIds.length === 0) {
      defer(blockId, "task_ids_missing");
      continue;
    }
    if (!taskIds.some((taskId) => evictableTaskIds.has(taskId))) {
      defer(blockId, "task_not_evictable");
      continue;
    }

    const targetItemIds = resolveTargetItemIds(
      block,
      params.stableItemIdsByMessageId,
      itemsByStableId,
    );
    if (!targetItemIds) {
      defer(blockId, "target_unresolved");
      continue;
    }
    if (targetItemIds.some((stableId) => claimedTargetItemIds.has(stableId))) {
      defer(blockId, "target_overlap");
      continue;
    }

    const operation = operationForInstruction({
      instruction,
      block,
      taskIds,
      targetItemIds,
      snapshot: params.snapshot,
    });
    operations.push(operation);
    for (const stableId of targetItemIds) claimedTargetItemIds.add(stableId);
  }

  if (operations.length === 0) {
    return { deferredBlockIds, reasons };
  }

  const createdAt = params.createdAt.trim();
  if (!createdAt) throw new TypeError("createdAt must not be empty");
  const planId = digestId("ctxplan", {
    baseRevision: params.snapshot.revision,
    hostId: params.snapshot.hostId,
    operationIds: operations.map((operation) => operation.id),
    sessionId: params.snapshot.sessionId,
    sourceModuleId: "eviction",
    sourcePresetId: params.sourcePresetId?.trim() || null,
  });
  return {
    plan: {
      schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
      planId,
      hostId: params.snapshot.hostId,
      sessionId: params.snapshot.sessionId,
      baseRevision: params.snapshot.revision,
      sourceModuleId: "eviction",
      ...(params.sourcePresetId?.trim()
        ? { sourcePresetId: params.sourcePresetId.trim() }
        : {}),
      operations,
      createdAt,
    },
    deferredBlockIds,
    reasons,
  };
}
