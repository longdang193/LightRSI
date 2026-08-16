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
  /\bAKIA[A-Z0-9]{16}\b/,
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
  assert.equal(
    new Set(params.evict).size,
    params.evict.length,
    `${params.label} evict ids must be unique`,
  );
  assert.equal(
    new Set(params.keep).size,
    params.keep.length,
    `${params.label} keep ids must be unique`,
  );
  const overlap = params.evict.filter((value) => params.keep.includes(value));
  assert.deepEqual(overlap, [], `${params.label} evict/keep sets must be disjoint`);
  assert.deepEqual(
    sorted([...params.evict, ...params.keep]),
    sorted(params.all),
    `${params.label} must classify every id exactly once`,
  );
}

function expectedAction(fixture: LifecycleFixture, itemId: string): "evict" | "keep" {
  const evicted = fixture.expected.evictItemIds.includes(itemId);
  const kept = fixture.expected.keepItemIds.includes(itemId);
  assert.notEqual(evicted, kept, `${fixture.id} ${itemId} must have exactly one action`);
  return evicted ? "evict" : "keep";
}

function validateToolPairs(fixture: LifecycleFixture): void {
  const discovered = new Map<string, { calls: string[]; results: string[]; taskIds: string[][] }>();
  for (const item of fixture.input.snapshot.items) {
    if (item.kind !== "tool_call" && item.kind !== "tool_result") continue;
    assert.ok(item.callId?.trim(), `${fixture.id} ${item.stableId} must have a callId`);
    const pair = discovered.get(item.callId!) ?? { calls: [], results: [], taskIds: [] };
    (item.kind === "tool_call" ? pair.calls : pair.results).push(item.stableId);
    pair.taskIds.push(sorted(item.taskIds ?? []));
    discovered.set(item.callId!, pair);
  }

  assert.equal(
    new Set(fixture.expected.toolPairs.map((pair) => pair.callId)).size,
    fixture.expected.toolPairs.length,
    `${fixture.id} declared tool pair ids must be unique`,
  );
  assert.deepEqual(
    sorted(fixture.expected.toolPairs.map((pair) => pair.callId)),
    sorted([...discovered.keys()]),
    `${fixture.id} tool pair declarations must cover every discovered pair`,
  );

  for (const [callId, pair] of discovered) {
    assert.equal(pair.calls.length, 1, `${fixture.id} ${callId} must have one call`);
    assert.equal(pair.results.length, 1, `${fixture.id} ${callId} must have one result`);
    assert.deepEqual(pair.taskIds[0], pair.taskIds[1], `${fixture.id} ${callId} task ids must match`);
    const callItemId = pair.calls[0]!;
    const resultItemId = pair.results[0]!;
    const action = expectedAction(fixture, callItemId);
    assert.equal(expectedAction(fixture, resultItemId), action, `${fixture.id} ${callId} must remain closed`);
    const declared = fixture.expected.toolPairs.find((entry) => entry.callId === callId);
    assert.ok(declared, `${fixture.id} ${callId} must be declared`);
    assert.equal(declared.callItemId, callItemId);
    assert.equal(declared.resultItemId, resultItemId);
    assert.equal(declared.action, action);
  }
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
  validateToolPairs(fixture);
}

test("GUA lifecycle fixtures are sanitized and define complete semantic oracles", () => {
  for (const fixture of readFixtures().cases) validateFixture(fixture);
});

test("GUA lifecycle fixture validation rejects duplicate decisions", () => {
  const fixture = structuredClone(readFixtures().cases[0]!);
  fixture.expected.evictItemIds.push(fixture.expected.evictItemIds[0]!);
  assert.throws(() => validateFixture(fixture), /must be unique/);
});

test("GUA lifecycle fixture validation requires every discovered tool pair", () => {
  const fixture = structuredClone(readFixtures().cases[0]!);
  fixture.expected.toolPairs = [];
  assert.throws(() => validateFixture(fixture), /cover every discovered pair/);
});

test("GUA lifecycle fixture validation rejects split tool pairs", () => {
  const fixture = structuredClone(readFixtures().cases[0]!);
  const resultItemId = fixture.expected.toolPairs[0]!.resultItemId;
  fixture.expected.evictItemIds = fixture.expected.evictItemIds.filter((id) => id !== resultItemId);
  fixture.expected.keepItemIds.push(resultItemId);
  assert.throws(() => validateFixture(fixture), /must remain closed/);
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
