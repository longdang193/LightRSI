import fs from "node:fs";
import path from "node:path";

import {
  planLifecycleEviction,
  type LifecyclePlannerInput,
  type LifecyclePlannerReasonCode,
  type LifecyclePlannerResult,
  type LifecyclePlannerStatus,
  type TaskStateEstimator,
  type TaskStateEstimatorOutput,
} from "@lightrsi/eviction";

export type FixtureEstimator = {
  kind: "output" | "throw" | "must_not_run";
  output?: TaskStateEstimatorOutput;
};

export type LifecycleFixtureInput = Omit<LifecyclePlannerInput, "estimator"> & {
  estimator: FixtureEstimator;
};

export type LifecycleFixtureToolPair = {
  callId: string;
  callItemId: string;
  resultItemId: string;
  action: "evict" | "keep";
};

export type LifecycleFixtureExpected = {
  status: LifecyclePlannerStatus;
  reasonCodes: LifecyclePlannerReasonCode[];
  registryVersion: number;
  lastProcessedTurnSeq: number;
  evictTaskIds: string[];
  keepTaskIds: string[];
  evictItemIds: string[];
  keepItemIds: string[];
  toolPairs: LifecycleFixtureToolPair[];
  deferredBlockIds: string[];
};

export type LifecycleFixture = {
  id: string;
  description: string;
  input: LifecycleFixtureInput;
  expected: LifecycleFixtureExpected;
};

type LifecycleFixtureFile = {
  schema: "lightmem2.lifecycle-planner-fixtures/v1";
  cases: LifecycleFixture[];
};

export type LifecycleFixtureObservation = {
  result: LifecyclePlannerResult;
  evictTaskIds: string[];
  keepTaskIds: string[];
  evictItemIds: string[];
  keepItemIds: string[];
};

export const forbiddenLifecycleFixtureContent = [
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{16,}/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bBearer\s+[A-Za-z0-9._~-]{16,}/i,
  /[A-Za-z]:\\\\/,
  /\/(?:Users|home|root|mnt|disk(?:_[^/]+)?)\//i,
];

const fixturePath = path.join(__dirname, "fixtures", "lifecycle-planner.json");

export function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function estimatorFor(fixture: LifecycleFixture): TaskStateEstimator {
  const configured = fixture.input.estimator;
  return {
    async estimate() {
      if (configured.kind === "throw") {
        throw new Error("sanitized fixture estimator failure");
      }
      if (configured.kind === "must_not_run") {
        throw new Error(`${fixture.id} estimator must not run`);
      }
      if (!configured.output) {
        throw new Error(`${fixture.id} estimator output is missing`);
      }
      return structuredClone(configured.output);
    },
  };
}

function emptyRegistry(sessionId: string, version = 0) {
  return {
    sessionId,
    version,
    tasks: {},
    activeTaskIds: [],
    completedTaskIds: [],
    evictableTaskIds: [],
    taskToBlockIds: {},
    blockToTaskIds: {},
    turnToTaskIds: {},
    lastProcessedTurnSeq: 0,
  };
}

function controlFixture(params: {
  id: string;
  description: string;
  registryVersion?: number;
  estimator: FixtureEstimator;
  expectedStatus: LifecyclePlannerStatus;
  expectedReasons: LifecyclePlannerReasonCode[];
  expectedRegistryVersion: number;
  expectedWatermark: number;
}): LifecycleFixture {
  const sessionId = `gua-lifecycle-${params.id}`;
  return {
    id: params.id,
    description: params.description,
    input: {
      registry: emptyRegistry(sessionId, params.registryVersion),
      delta: {
        fromTurnSeqExclusive: 0,
        toTurnSeqInclusive: 1,
        coveredTurnAbsIds: [`${sessionId}:t1`],
        messages: [],
        toolCalls: [],
        toolResults: [],
        filesRead: [],
        filesWritten: [],
      },
      pendingTurnCount: 1,
      estimator: params.estimator,
      historyBlocks: [],
      snapshot: {
        schemaVersion: 1,
        hostId: "fixture-host",
        sessionId,
        revision: `fixture-revision-${params.id}`,
        items: [],
      },
      stableItemIdsByMessageId: {},
      activeTaskIds: [],
      currentTaskIds: [],
      closureDeferredTaskIds: [],
      config: {
        enabled: true,
        batchTurns: 1,
        evictionEnabled: true,
        evictionPolicy: "model_scored",
        evictionMinBlockChars: 256,
      },
      createdAt: "2026-08-16T00:00:00.000Z",
      sourcePresetId: "tokenpilot",
    },
    expected: {
      status: params.expectedStatus,
      reasonCodes: params.expectedReasons,
      registryVersion: params.expectedRegistryVersion,
      lastProcessedTurnSeq: params.expectedWatermark,
      evictTaskIds: [],
      keepTaskIds: [],
      evictItemIds: [],
      keepItemIds: [],
      toolPairs: [],
      deferredBlockIds: [],
    },
  };
}

function candidateDeferralFixture(
  source: LifecycleFixture,
  id: string,
  description: string,
  mutate: (fixture: LifecycleFixture) => void,
): LifecycleFixture {
  const fixture = structuredClone(source);
  fixture.id = id;
  fixture.description = description;
  fixture.expected.status = "completed";
  fixture.expected.reasonCodes = ["registry_updated", "mutation_plan_deferred"];
  fixture.expected.evictTaskIds = [];
  fixture.expected.keepTaskIds = Object.keys(fixture.input.registry.tasks);
  fixture.expected.evictItemIds = [];
  fixture.expected.keepItemIds = fixture.input.snapshot.items.map((item) => item.stableId);
  fixture.expected.toolPairs = fixture.expected.toolPairs.map((pair) => ({
    ...pair,
    action: "keep",
  }));
  fixture.expected.deferredBlockIds = ["block-completed"];
  mutate(fixture);
  return fixture;
}

function expandedMatrix(fileFixtures: LifecycleFixture[]): LifecycleFixture[] {
  const completed = fileFixtures.find(
    (fixture) => fixture.id === "completed-tool-pair-evicts-current-keeps",
  );
  if (!completed) throw new Error("completed lifecycle fixture is missing");

  const noOp = controlFixture({
    id: "successful-noop-advances-watermark",
    description: "A successful empty estimate advances the registry watermark without creating a plan.",
    estimator: { kind: "output", output: { baseVersion: 0, taskUpdates: [] } },
    expectedStatus: "completed",
    expectedReasons: ["registry_watermark_advanced", "no_eviction_candidates"],
    expectedRegistryVersion: 1,
    expectedWatermark: 1,
  });
  const estimatorFailure = controlFixture({
    id: "estimator-failure-bypasses",
    description: "An estimator failure leaves the registry and context unchanged.",
    estimator: { kind: "throw" },
    expectedStatus: "bypassed",
    expectedReasons: ["estimator_failed"],
    expectedRegistryVersion: 0,
    expectedWatermark: 0,
  });
  const baseVersionConflict = controlFixture({
    id: "base-version-conflict-defers",
    description: "An estimator result based on an old registry version is deferred without persistence.",
    registryVersion: 2,
    estimator: { kind: "output", output: { baseVersion: 1, taskUpdates: [] } },
    expectedStatus: "deferred",
    expectedReasons: ["base_version_mismatch"],
    expectedRegistryVersion: 2,
    expectedWatermark: 0,
  });
  const missingTarget = candidateDeferralFixture(
    completed,
    "missing-candidate-defers",
    "A planner candidate with no matching snapshot item is deferred without a partial rewrite.",
    (fixture) => {
      fixture.input.stableItemIdsByMessageId = {
        ...fixture.input.stableItemIdsByMessageId,
        "item-tool-call-evict": ["missing-tool-call"],
      };
    },
  );
  const ambiguousBlock = candidateDeferralFixture(
    completed,
    "ambiguous-candidate-defers",
    "Duplicate candidate block identities are deferred instead of selecting one arbitrarily.",
    (fixture) => {
      fixture.input.historyBlocks.push(structuredClone(fixture.input.historyBlocks[0]!));
    },
  );

  return [
    ...fileFixtures,
    noOp,
    estimatorFailure,
    baseVersionConflict,
    missingTarget,
    ambiguousBlock,
  ];
}

export function readLifecycleFixtures(): LifecycleFixture[] {
  const raw = fs.readFileSync(fixturePath, "utf8");
  for (const pattern of forbiddenLifecycleFixtureContent) {
    if (pattern.test(raw)) throw new Error("lifecycle fixtures must remain sanitized");
  }
  const parsed = JSON.parse(raw) as LifecycleFixtureFile;
  if (parsed.schema !== "lightmem2.lifecycle-planner-fixtures/v1") {
    throw new Error(`unsupported lifecycle fixture schema: ${String(parsed.schema)}`);
  }
  return expandedMatrix(parsed.cases);
}

export async function observeLifecycleFixture(
  fixture: LifecycleFixture,
): Promise<LifecycleFixtureObservation> {
  const { estimator: _fixtureEstimator, ...input } = fixture.input;
  const result = await planLifecycleEviction({
    ...structuredClone(input),
    estimator: estimatorFor(fixture),
  });
  const evictItemIds = sortedUnique(
    result.plan?.operations.flatMap((operation) => operation.targetItemIds) ?? [],
  );
  const evictTaskIds = sortedUnique(
    result.plan?.operations.flatMap((operation) => operation.taskIds ?? []) ?? [],
  );
  const allItemIds = fixture.input.snapshot.items.map((item) => item.stableId);
  const allTaskIds = Object.keys(fixture.input.registry.tasks);
  return {
    result,
    evictTaskIds,
    keepTaskIds: sortedUnique(allTaskIds.filter((taskId) => !evictTaskIds.includes(taskId))),
    evictItemIds,
    keepItemIds: sortedUnique(allItemIds.filter((itemId) => !evictItemIds.includes(itemId))),
  };
}
