import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const hostIds = [
  "openclaw",
  "claude-code",
  "codex",
] as const;

type HostId = typeof hostIds[number];

type TargetSet = {
  target_task_ids: string[];
  target_item_ids: string[];
};

type TargetCase = {
  fixture: string;
  hosts: Record<HostId, TargetSet>;
};

type CrossHostTargets = {
  schema: string;
  id: string;
  description: string;
  cases: TargetCase[];
};

type GoldenFixture = {
  expected: {
    evict_task_ids: string[];
    evict_item_ids: string[];
  };
};

const fixtureDirectory = path.join(
  __dirname,
  "fixtures",
);

function readJson<T>(fileName: string): T {
  return JSON.parse(
    fs.readFileSync(
      path.join(fixtureDirectory, fileName),
      "utf8",
    ),
  ) as T;
}

function assertUnique(
  values: string[],
  label: string,
): void {
  assert.equal(
    new Set(values).size,
    values.length,
    `${label} must contain unique ids`,
  );
}

function assertSameMembers(
  actual: string[],
  expected: string[],
  label: string,
): void {
  assert.deepEqual(
    [...actual].sort(),
    [...expected].sort(),
    `${label} must match the golden target set`,
  );
}

function validateCrossHostTargets(
  input: CrossHostTargets,
): void {
  assert.equal(
    input.schema,
    "lightmem2.cross-host-targets/v1",
  );
  assert.equal(input.id, "three-host-targets");
  assert.ok(input.description.length > 0);

  assert.deepEqual(
    input.cases
      .map((entry) => entry.fixture)
      .sort(),
    [
      "completed-task.json",
      "tool-closure.json",
    ],
  );

  for (const entry of input.cases) {
    const golden =
      readJson<GoldenFixture>(entry.fixture);

    assert.deepEqual(
      Object.keys(entry.hosts).sort(),
      [...hostIds].sort(),
      `${entry.fixture} must contain all three hosts`,
    );

    const baseline = entry.hosts.openclaw;

    for (const hostId of hostIds) {
      const targets = entry.hosts[hostId];

      assertUnique(
        targets.target_task_ids,
        `${entry.fixture} ${hostId} task targets`,
      );

      assertUnique(
        targets.target_item_ids,
        `${entry.fixture} ${hostId} item targets`,
      );

      assertSameMembers(
        targets.target_task_ids,
        golden.expected.evict_task_ids,
        `${entry.fixture} ${hostId} task targets`,
      );

      assertSameMembers(
        targets.target_item_ids,
        golden.expected.evict_item_ids,
        `${entry.fixture} ${hostId} item targets`,
      );

      assertSameMembers(
        targets.target_task_ids,
        baseline.target_task_ids,
        `${entry.fixture} ${hostId} cross-host task targets`,
      );

      assertSameMembers(
        targets.target_item_ids,
        baseline.target_item_ids,
        `${entry.fixture} ${hostId} cross-host item targets`,
      );
    }
  }
}

test(
  "GUA-02 three hosts produce the same logical target sets",
  () => {
    validateCrossHostTargets(
      readJson<CrossHostTargets>(
        "three-host-targets.json",
      ),
    );
  },
);

test(
  "GUA-02 validation detects host target drift",
  () => {
    const fixture = structuredClone(
      readJson<CrossHostTargets>(
        "three-host-targets.json",
      ),
    );

    fixture.cases[0]!
      .hosts.codex
      .target_item_ids
      .pop();

    assert.throws(
      () => validateCrossHostTargets(fixture),
      /must match the golden target set/,
    );
  },
);
