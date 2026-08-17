import assert from "node:assert/strict";
import test from "node:test";

import {
  forbiddenLifecycleFixtureContent,
  observeLifecycleFixture,
  readLifecycleFixtures,
  sortedUnique,
  type LifecycleFixture,
} from "./lifecycle-fixture-support.js";

function assertPartition(params: {
  all: readonly string[];
  evict: readonly string[];
  keep: readonly string[];
  label: string;
}): void {
  assert.equal(new Set(params.all).size, params.all.length, `${params.label} source ids must be unique`);
  assert.equal(new Set(params.evict).size, params.evict.length, `${params.label} evict ids must be unique`);
  assert.equal(new Set(params.keep).size, params.keep.length, `${params.label} keep ids must be unique`);
  assert.deepEqual(
    params.evict.filter((value) => params.keep.includes(value)),
    [],
    `${params.label} evict/keep sets must be disjoint`,
  );
  assert.deepEqual(
    sortedUnique([...params.evict, ...params.keep]),
    sortedUnique(params.all),
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
    pair.taskIds.push(sortedUnique(item.taskIds ?? []));
    discovered.set(item.callId!, pair);
  }

  assert.equal(
    new Set(fixture.expected.toolPairs.map((pair) => pair.callId)).size,
    fixture.expected.toolPairs.length,
    `${fixture.id} declared tool pair ids must be unique`,
  );
  assert.deepEqual(
    sortedUnique(fixture.expected.toolPairs.map((pair) => pair.callId)),
    sortedUnique([...discovered.keys()]),
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
  const serialized = JSON.stringify(fixture);
  for (const pattern of forbiddenLifecycleFixtureContent) {
    assert.doesNotMatch(serialized, pattern, `${fixture.id} contains sensitive fixture content`);
  }
}

test("GUA lifecycle fixtures are sanitized and define the complete planner matrix", () => {
  const fixtures = readLifecycleFixtures();
  assert.deepEqual(
    fixtures.map((fixture) => fixture.id),
    [
      "completed-tool-pair-evicts-current-keeps",
      "unresolved-task-is-protected",
      "insufficient-batch-defers-before-estimator",
      "successful-noop-advances-watermark",
      "estimator-failure-bypasses",
      "base-version-conflict-defers",
      "missing-candidate-defers",
      "ambiguous-candidate-defers",
    ],
  );
  assert.equal(new Set(fixtures.map((fixture) => fixture.id)).size, fixtures.length);
  for (const fixture of fixtures) validateFixture(fixture);
});

test("GUA lifecycle fixture validation rejects duplicate decisions", () => {
  const fixture = structuredClone(readLifecycleFixtures()[0]!);
  fixture.expected.evictItemIds.push(fixture.expected.evictItemIds[0]!);
  assert.throws(() => validateFixture(fixture), /must be unique/);
});

test("GUA lifecycle fixture validation requires every discovered tool pair", () => {
  const fixture = structuredClone(readLifecycleFixtures()[0]!);
  fixture.expected.toolPairs = [];
  assert.throws(() => validateFixture(fixture), /cover every discovered pair/);
});

test("GUA lifecycle fixture validation rejects split tool pairs", () => {
  const fixture = structuredClone(readLifecycleFixtures()[0]!);
  const resultItemId = fixture.expected.toolPairs[0]!.resultItemId;
  fixture.expected.evictItemIds = fixture.expected.evictItemIds.filter((id) => id !== resultItemId);
  fixture.expected.keepItemIds.push(resultItemId);
  assert.throws(() => validateFixture(fixture), /must remain closed/);
});

test("GUA lifecycle oracle is produced by the real shared planner", async () => {
  for (const fixture of readLifecycleFixtures()) {
    const observed = await observeLifecycleFixture(fixture);
    assert.equal(observed.result.status, fixture.expected.status, `${fixture.id} status`);
    assert.deepEqual(observed.result.reasonCodes, fixture.expected.reasonCodes, `${fixture.id} reasons`);
    assert.equal(observed.result.registry.version, fixture.expected.registryVersion, `${fixture.id} version`);
    assert.equal(
      observed.result.registry.lastProcessedTurnSeq,
      fixture.expected.lastProcessedTurnSeq,
      `${fixture.id} watermark`,
    );
    assert.deepEqual(observed.evictTaskIds, sortedUnique(fixture.expected.evictTaskIds), `${fixture.id} evict tasks`);
    assert.deepEqual(observed.keepTaskIds, sortedUnique(fixture.expected.keepTaskIds), `${fixture.id} keep tasks`);
    assert.deepEqual(observed.evictItemIds, sortedUnique(fixture.expected.evictItemIds), `${fixture.id} evict items`);
    assert.deepEqual(observed.keepItemIds, sortedUnique(fixture.expected.keepItemIds), `${fixture.id} keep items`);
    assert.deepEqual(
      sortedUnique(observed.result.deferredBlockIds),
      sortedUnique(fixture.expected.deferredBlockIds),
      `${fixture.id} deferred blocks`,
    );
  }
});
