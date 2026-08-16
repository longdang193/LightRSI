import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  planLifecycleEviction,
  type LifecyclePlannerInput,
  type LifecyclePlannerReasonCode,
  type LifecyclePlannerStatus,
  type TaskStateEstimator,
  type TaskStateEstimatorOutput,
} from "@lightmem2/eviction";

type FixtureEstimator = {
  kind: "output" | "throw" | "must_not_run";
  output?: TaskStateEstimatorOutput;
};

type FixtureInput = Omit<LifecyclePlannerInput, "estimator"> & {
  estimator: FixtureEstimator;
};

type FixtureToolPair = {
  callId: string;
  callItemId: string;
  resultItemId: string;
  action: "evict" | "keep";
};

type FixtureExpected = {
  status: LifecyclePlannerStatus;
  reasonCodes: LifecyclePlannerReasonCode[];
  registryVersion: number;
  lastProcessedTurnSeq: number;
  evictTaskIds: string[];
  keepTaskIds: string[];
  evictItemIds: string[];
  keepItemIds: string[];
  toolPairs: FixtureToolPair[];
  deferredBlockIds: string[];
};

type LifecycleFixture = {
  id: string;
  description: string;
  input: FixtureInput;
  expected: FixtureExpected;
};

type LifecycleFixtureFile = {
  schema: "lightmem2.lifecycle-planner-fixtures/v1";
  cases: LifecycleFixture[];
};

const fixturePath = path.join(__dirname, "fixtures", "lifecycle-planner.json");
const forbiddenFixtureContent = [
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{16,}/,
  /\bBearer\s+[A-Za-z0-9._~-]{16,}/i,
  /[A-Za-z]:\\\\/,
  /\/(?:Users|home|root|mnt|disk(?:_[^/]+)?)\//i,
];

function sorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function assertPartition(params: {
  all: readonly string[];
  evict: readonly string[];
  keep: readonly string[];
  label: string;
}): void {
  const overlap = params.evict.filter((value) => params.keep.includes(value));
  assert.deepEqual(overlap, [], `${params.label} evict/keep sets must be disjoint`);
  assert.deepEqual(
    sorted([...params.evict, ...params.keep]),
    sorted(params.all),
    `${params.label} must classify every id exactly once`,
  );
}

function readFixtures(): LifecycleFixtureFile {
  const raw = fs.readFileSync(fixturePath, "utf8");
  for (const pattern of forbiddenFixtureContent) {
    assert.doesNotMatch(raw, pattern, "lifecycle fixtures must remain sanitized");
  }
  const parsed = JSON.parse(raw) as LifecycleFixtureFile;
  assert.equal(parsed.schema, "lightmem2.lifecycle-planner-fixtures/v1");
  assert.ok(parsed.cases.length > 0);
  assert.equal(new Set(parsed.cases.map((fixture) => fixture.id)).size, parsed.cases.length);
  return parsed;
}

function estimatorFor(fixture: LifecycleFixture): TaskStateEstimator {
  const configured = fixture.input.estimator;
  return {
    async estimate() {
      if (configured.kind === "throw") {
        throw new Error("sanitized fixture estimator failure");
      }
      if (configured.kind === "must_not_run") {
        assert.fail(`${fixture.id} estimator must not run`);
      }
      assert.ok(configured.output, `${fixture.id} must provide estimator output`);
      return structuredClone(configured.output);
    },
  };
}

function validateFixture(fixture: LifecycleFixture): void {
  assert.ok(fixture.id.trim());
  assert.ok(fixture.description.trim());
  assertPartition({
    all: Object.keys(fixture.input.registry.tasks),
    evict: fixture.expected.evictTaskIds,
    keep: fixture.expected.keepTaskIds,
    label: `${fixture.id} task oracle`,
  });
  assertPartition({
    all: fixture.input.snapshot.items.map((item) => item.stableId),
    evict: fixture.expected.evictItemIds,
    keep: fixture.expected.keepItemIds,
    label: `${fixture.id} item oracle`,
  });
  const itemIds = new Set(fixture.input.snapshot.items.map((item) => item.stableId));
  for (const pair of fixture.expected.toolPairs) {
    assert.ok(pair.callId.trim());
    assert.ok(itemIds.has(pair.callItemId), `${fixture.id} missing tool call item`);
    assert.ok(itemIds.has(pair.resultItemId), `${fixture.id} missing tool result item`);
    const expectedIds = pair.action === "evict"
      ? fixture.expected.evictItemIds
      : fixture.expected.keepItemIds;
    assert.ok(expectedIds.includes(pair.callItemId), `${fixture.id} tool call action mismatch`);
    assert.ok(expectedIds.includes(pair.resultItemId), `${fixture.id} tool result action mismatch`);
  }
}

test("GUA lifecycle fixtures are sanitized and define complete semantic oracles", () => {
  for (const fixture of readFixtures().cases) validateFixture(fixture);
});

test("GUA lifecycle oracle is produced by the real shared planner", async () => {
  for (const fixture of readFixtures().cases) {
    const { estimator: _fixtureEstimator, ...input } = fixture.input;
    const result = await planLifecycleEviction({
      ...structuredClone(input),
      estimator: estimatorFor(fixture),
    });
    const evictItemIds = sorted(
      result.plan?.operations.flatMap((operation) => operation.targetItemIds) ?? [],
    );
    const evictTaskIds = sorted(
      result.plan?.operations.flatMap((operation) => operation.taskIds ?? []) ?? [],
    );
    const allItemIds = fixture.input.snapshot.items.map((item) => item.stableId);
    const allTaskIds = Object.keys(fixture.input.registry.tasks);

    assert.equal(result.status, fixture.expected.status, `${fixture.id} status`);
    assert.deepEqual(result.reasonCodes, fixture.expected.reasonCodes, `${fixture.id} reasons`);
    assert.equal(result.registry.version, fixture.expected.registryVersion, `${fixture.id} version`);
    assert.equal(
      result.registry.lastProcessedTurnSeq,
      fixture.expected.lastProcessedTurnSeq,
      `${fixture.id} watermark`,
    );
    assert.deepEqual(evictTaskIds, sorted(fixture.expected.evictTaskIds), `${fixture.id} evict tasks`);
    assert.deepEqual(
      sorted(allTaskIds.filter((taskId) => !evictTaskIds.includes(taskId))),
      sorted(fixture.expected.keepTaskIds),
      `${fixture.id} keep tasks`,
    );
    assert.deepEqual(evictItemIds, sorted(fixture.expected.evictItemIds), `${fixture.id} evict items`);
    assert.deepEqual(
      sorted(allItemIds.filter((itemId) => !evictItemIds.includes(itemId))),
      sorted(fixture.expected.keepItemIds),
      `${fixture.id} keep items`,
    );
    assert.deepEqual(
      sorted(result.deferredBlockIds),
      sorted(fixture.expected.deferredBlockIds),
      `${fixture.id} deferred blocks`,
    );
  }
});
