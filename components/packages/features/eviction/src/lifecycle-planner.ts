import {
  applySessionTaskRegistryPatch,
  type DeltaView,
  type HistoryBlock,
  type SessionTaskRegistry,
} from "@lightmem2/history";
import type {
  ContextMutationPlan,
  ModelContextSnapshot,
} from "@lightmem2/host-adapter";

import { buildContextMutationPlanFromEviction } from "./context-mutation-plan.js";
import { analyzeEvictionFromTaskRegistry } from "./planning/analyzer.js";
import {
  mapTaskUpdatesToRegistryPatch,
  type RejectedTaskUpdate,
} from "./task-update-mapper.js";
import type {
  EvictionDecision,
  EvictionPolicy,
  TaskStateEstimator,
  TaskStateEstimatorOutput,
  TaskStateTransition,
} from "./types.js";

export type LifecyclePlannerStatus = "applied" | "deferred" | "bypassed";

export type LifecyclePlannerReasonCode =
  | "planner_disabled"
  | "estimator_missing"
  | "insufficient_pending_turns"
  | "duplicate_estimator_window"
  | "empty_delta_window"
  | "planner_input_invalid"
  | "session_mismatch"
  | "estimator_failed"
  | "estimator_output_invalid"
  | "base_version_mismatch"
  | "task_update_turn_out_of_scope"
  | "task_updates_rejected"
  | "registry_updated"
  | "registry_watermark_advanced"
  | "no_eviction_candidates"
  | "mutation_plan_deferred"
  | "mutation_plan_created";

export type LifecyclePlannerConfig = {
  enabled: boolean;
  batchTurns: number;
  evictionEnabled: boolean;
  evictionPolicy: EvictionPolicy;
  evictionMinBlockChars?: number;
};

export type LifecyclePlannerInput<TAdapterMetadata = never> = {
  registry: SessionTaskRegistry;
  delta: DeltaView;
  pendingTurnCount: number;
  duplicateWindow?: boolean;
  estimator?: TaskStateEstimator | null;
  historyBlocks: HistoryBlock[];
  snapshot: ModelContextSnapshot<TAdapterMetadata>;
  stableItemIdsByMessageId?: Readonly<Record<string, readonly string[]>>;
  activeTaskIds?: string[];
  currentTaskIds?: string[];
  currentTurnAbsId?: string;
  closureDeferredTaskIds?: string[];
  config: LifecyclePlannerConfig;
  createdAt: string;
  sourcePresetId?: string;
};

export type LifecyclePlannerResult = {
  status: LifecyclePlannerStatus;
  reasonCodes: LifecyclePlannerReasonCode[];
  registry: SessionTaskRegistry;
  expectedRegistryVersion: number;
  registryChanged: boolean;
  registryUpdateRequired: boolean;
  attemptedEstimator: boolean;
  transitions: TaskStateTransition[];
  rejectedUpdates: RejectedTaskUpdate[];
  decision?: EvictionDecision;
  plan?: ContextMutationPlan;
  deferredBlockIds: string[];
  estimatorUsage?: TaskStateEstimatorOutput["usage"];
};

function uniqueStrings(values: Iterable<string | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function baseResult(
  input: LifecyclePlannerInput<unknown>,
  status: LifecyclePlannerStatus,
  reasonCodes: LifecyclePlannerReasonCode[],
  attemptedEstimator = false,
): LifecyclePlannerResult {
  return {
    status,
    reasonCodes,
    registry: input.registry,
    expectedRegistryVersion: input.registry.version,
    registryChanged: false,
    registryUpdateRequired: false,
    attemptedEstimator,
    transitions: [],
    rejectedUpdates: [],
    deferredBlockIds: [],
  };
}

function validEstimatorOutput(value: unknown): value is TaskStateEstimatorOutput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const output = value as Partial<TaskStateEstimatorOutput>;
  if (!Number.isInteger(output.baseVersion) || !Array.isArray(output.taskUpdates)) return false;
  const optionalStringArray = (value: unknown): boolean =>
    value === undefined
    || (Array.isArray(value) && value.every((entry) => typeof entry === "string"));
  return output.taskUpdates.every((update) => {
    if (!update || typeof update !== "object" || Array.isArray(update)) return false;
    return typeof update.taskId === "string"
      && typeof update.objective === "string"
      && ["active", "blocked", "completed", "evictable"].includes(update.lifecycle)
      && optionalStringArray(update.coveredTurnAbsIds)
      && optionalStringArray(update.completionEvidence)
      && optionalStringArray(update.unresolvedQuestions);
  });
}

function blockTaskIds(block: HistoryBlock, registry: SessionTaskRegistry): string[] {
  const direct = uniqueStrings(block.taskIds ?? []);
  if (direct.length > 0) return direct;
  const byTurns = uniqueStrings(
    (block.turnAbsIds ?? []).flatMap((turnId) => registry.turnToTaskIds[turnId] ?? []),
  );
  if (byTurns.length > 0) return byTurns;
  return uniqueStrings([
    ...(registry.blockToTaskIds[block.blockId] ?? []),
    ...block.segmentIds.flatMap((segmentId) => registry.blockToTaskIds[segmentId] ?? []),
  ]);
}

function protectedTaskIds(input: LifecyclePlannerInput<unknown>, registry: SessionTaskRegistry): Set<string> {
  return new Set(uniqueStrings([
    ...input.registry.activeTaskIds,
    ...registry.activeTaskIds,
    ...Object.values(registry.tasks)
      .filter((task) => task.lifecycle === "blocked" || task.unresolvedQuestions.length > 0)
      .map((task) => task.taskId),
    ...(input.activeTaskIds ?? []),
    ...(input.currentTaskIds ?? []),
    ...(input.closureDeferredTaskIds ?? []),
  ]));
}

function safeHistoryBlocks(
  input: LifecyclePlannerInput<unknown>,
  registry: SessionTaskRegistry,
): HistoryBlock[] {
  const protectedIds = protectedTaskIds(input, registry);
  const currentTurnAbsId = input.currentTurnAbsId?.trim();
  return input.historyBlocks.filter(
    (block) => !(currentTurnAbsId && block.turnAbsIds?.includes(currentTurnAbsId))
      && !blockTaskIds(block, registry).some((taskId) => protectedIds.has(taskId)),
  );
}

function taskStateChanged(
  before: SessionTaskRegistry,
  after: SessionTaskRegistry,
): boolean {
  return JSON.stringify({
    tasks: before.tasks,
    activeTaskIds: before.activeTaskIds,
    completedTaskIds: before.completedTaskIds,
    evictableTaskIds: before.evictableTaskIds,
    turnToTaskIds: before.turnToTaskIds,
  }) !== JSON.stringify({
    tasks: after.tasks,
    activeTaskIds: after.activeTaskIds,
    completedTaskIds: after.completedTaskIds,
    evictableTaskIds: after.evictableTaskIds,
    turnToTaskIds: after.turnToTaskIds,
  });
}

/**
 * Runs the Host-neutral estimator-to-plan lifecycle. The caller owns history
 * loading, duplicate-window persistence, registry CAS, tracing, and mutation
 * execution. This function performs no I/O and fails closed to no plan.
 */
export async function planLifecycleEviction<TAdapterMetadata = never>(
  input: LifecyclePlannerInput<TAdapterMetadata>,
): Promise<LifecyclePlannerResult> {
  if (!input.config.enabled) {
    return baseResult(input, "bypassed", ["planner_disabled"]);
  }
  if (!input.estimator) {
    return baseResult(input, "bypassed", ["estimator_missing"]);
  }
  if (
    !Number.isFinite(input.config.batchTurns)
    || input.config.batchTurns < 1
    || !Number.isInteger(input.pendingTurnCount)
    || input.pendingTurnCount < 0
    || !input.createdAt.trim()
  ) {
    return baseResult(input, "bypassed", ["planner_input_invalid"]);
  }
  const batchTurns = Math.floor(input.config.batchTurns);
  if (input.pendingTurnCount < batchTurns) {
    return baseResult(input, "deferred", ["insufficient_pending_turns"]);
  }
  if (input.duplicateWindow) {
    return baseResult(input, "deferred", ["duplicate_estimator_window"]);
  }
  if (input.delta.coveredTurnAbsIds.length === 0) {
    return baseResult(input, "deferred", ["empty_delta_window"]);
  }
  if (
    input.registry.sessionId !== input.snapshot.sessionId
    || input.delta.coveredTurnAbsIds.some(
      (turnId) => !turnId.startsWith(`${input.registry.sessionId}:`),
    )
  ) {
    return baseResult(input, "bypassed", ["session_mismatch"]);
  }

  let output: unknown;
  try {
    output = await input.estimator.estimate({
      registry: input.registry,
      delta: input.delta,
    });
  } catch {
    return baseResult(input, "bypassed", ["estimator_failed"], true);
  }
  if (!validEstimatorOutput(output)) {
    return baseResult(input, "bypassed", ["estimator_output_invalid"], true);
  }
  if (output.baseVersion !== input.registry.version) {
    const result = baseResult(input, "deferred", ["base_version_mismatch"], true);
    return { ...result, estimatorUsage: output.usage };
  }

  const coveredTurnAbsIds = new Set(input.delta.coveredTurnAbsIds);
  if (output.taskUpdates.some((update) =>
    (update.coveredTurnAbsIds ?? []).some(
      (turnAbsId) => !coveredTurnAbsIds.has(turnAbsId),
    ))) {
    const result = baseResult(
      input,
      "deferred",
      ["task_update_turn_out_of_scope"],
      true,
    );
    return { ...result, estimatorUsage: output.usage };
  }

  const mapped = mapTaskUpdatesToRegistryPatch({
    registry: input.registry,
    updates: output.taskUpdates,
    coveredTurnAbsIds: input.delta.coveredTurnAbsIds,
    toTurnSeqInclusive: input.delta.toTurnSeqInclusive,
  });
  if (mapped.rejectedUpdates.length > 0) {
    const result = baseResult(input, "deferred", ["task_updates_rejected"], true);
    return {
      ...result,
      rejectedUpdates: mapped.rejectedUpdates,
      estimatorUsage: output.usage,
    };
  }

  const registry = applySessionTaskRegistryPatch(input.registry, mapped.patch);
  const registryChanged = taskStateChanged(input.registry, registry);
  const reasonCodes: LifecyclePlannerReasonCode[] = [
    registryChanged ? "registry_updated" : "registry_watermark_advanced",
  ];
  const decision = analyzeEvictionFromTaskRegistry(
    safeHistoryBlocks(input, registry),
    registry,
    {
      enabled: input.config.evictionEnabled,
      policy: input.config.evictionPolicy,
      minBlockChars: input.config.evictionMinBlockChars,
    },
  );
  const built = buildContextMutationPlanFromEviction({
    decision,
    registry,
    snapshot: input.snapshot,
    stableItemIdsByMessageId: input.stableItemIdsByMessageId,
    createdAt: input.createdAt,
    sourcePresetId: input.sourcePresetId,
  });
  if (built.plan) {
    reasonCodes.push("mutation_plan_created");
  } else if (built.deferredBlockIds.length > 0) {
    reasonCodes.push("mutation_plan_deferred");
  } else {
    reasonCodes.push("no_eviction_candidates");
  }

  return {
    status: "applied",
    reasonCodes,
    registry,
    expectedRegistryVersion: input.registry.version,
    registryChanged,
    registryUpdateRequired: true,
    attemptedEstimator: true,
    transitions: mapped.transitions,
    rejectedUpdates: [],
    decision,
    plan: built.plan,
    deferredBlockIds: built.deferredBlockIds,
    estimatorUsage: output.usage,
  };
}
