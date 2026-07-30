import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

type GoldenItem = {
  id: string;
  kind: string;
  role?: string;
  content?: string;
  tool_name?: string;
  tool_call_id?: string;
  arguments?: Record<string, unknown>;
  result?: string;
};

type GoldenTask = {
  id: string;
  status: string;
  current?: boolean;
  items: GoldenItem[];
};

type ToolPair = {
  tool_call_id: string;
  action: "evict" | "keep";
  call_item_id: string;
  result_item_id: string;
};

type GoldenExpected = {
  evict_task_ids: string[];
  keep_task_ids: string[];
  evict_item_ids: string[];
  keep_item_ids: string[];
  current_task_id?: string;
  tool_pairs?: ToolPair[];
};

type GoldenFixture = {
  schema: string;
  id: string;
  description: string;
  tasks: GoldenTask[];
  expected: GoldenExpected;
};

const fixtureDirectory = path.join(__dirname, "fixtures");

const fixtureFiles = [
  "active-turn.json",
  "completed-task.json",
  "tool-closure.json",
  "unresolved-task.json",
];

function readFixture(fileName: string): GoldenFixture {
  const file = path.join(fixtureDirectory, fileName);
  return JSON.parse(fs.readFileSync(file, "utf8")) as GoldenFixture;
}

function assertUnique(values: string[], label: string): void {
  assert.equal(
    new Set(values).size,
    values.length,
    `${label} must contain unique ids`,
  );
}

function assertDisjoint(
  left: string[],
  right: string[],
  label: string,
): void {
  const rightSet = new Set(right);
  const overlap = left.filter((value) => rightSet.has(value));

  assert.deepEqual(overlap, [], `${label} must not overlap`);
}

test("cross-host golden fixtures define valid logical rewrite targets", () => {
  const fixtures = fixtureFiles.map(readFixture);

  assert.deepEqual(
    fixtures.map((fixture) => fixture.id).sort(),
    [
      "active-turn",
      "completed-task",
      "tool-closure",
      "unresolved-task",
    ],
  );

  for (const fixture of fixtures) {
    assert.equal(
      fixture.schema,
      "lightmem2.context-rewrite-golden/v1",
    );
    assert.ok(fixture.description.length > 0);
    assert.ok(fixture.tasks.length > 0);

    const taskIds = fixture.tasks.map((task) => task.id);
    const items = fixture.tasks.flatMap((task) => task.items);
    const itemIds = items.map((item) => item.id);

    assertUnique(taskIds, `${fixture.id} task ids`);
    assertUnique(itemIds, `${fixture.id} item ids`);

    assertDisjoint(
      fixture.expected.evict_task_ids,
      fixture.expected.keep_task_ids,
      `${fixture.id} task decisions`,
    );
    assertDisjoint(
      fixture.expected.evict_item_ids,
      fixture.expected.keep_item_ids,
      `${fixture.id} item decisions`,
    );

    const knownTaskIds = new Set(taskIds);
    const knownItemIds = new Set(itemIds);

    for (const taskId of [
      ...fixture.expected.evict_task_ids,
      ...fixture.expected.keep_task_ids,
    ]) {
      assert.ok(
        knownTaskIds.has(taskId),
        `${fixture.id} references unknown task ${taskId}`,
      );
    }

    for (const itemId of [
      ...fixture.expected.evict_item_ids,
      ...fixture.expected.keep_item_ids,
    ]) {
      assert.ok(
        knownItemIds.has(itemId),
        `${fixture.id} references unknown item ${itemId}`,
      );
    }

    if (fixture.expected.current_task_id) {
      assert.ok(
        fixture.expected.keep_task_ids.includes(
          fixture.expected.current_task_id,
        ),
        `${fixture.id} current task must be kept`,
      );
      assert.equal(
        fixture.expected.evict_task_ids.includes(
          fixture.expected.current_task_id,
        ),
        false,
        `${fixture.id} current task must not be evicted`,
      );
    }

    for (const pair of fixture.expected.tool_pairs ?? []) {
      const call = items.find(
        (item) => item.id === pair.call_item_id,
      );
      const result = items.find(
        (item) => item.id === pair.result_item_id,
      );

      assert.equal(call?.kind, "tool_call");
      assert.equal(result?.kind, "tool_result");
      assert.equal(call?.tool_call_id, pair.tool_call_id);
      assert.equal(result?.tool_call_id, pair.tool_call_id);

      const targetIds =
        pair.action === "evict"
          ? fixture.expected.evict_item_ids
          : fixture.expected.keep_item_ids;

      assert.ok(targetIds.includes(pair.call_item_id));
      assert.ok(targetIds.includes(pair.result_item_id));
    }

    const serialized = JSON.stringify(fixture);

    assert.doesNotMatch(serialized, /sk-[A-Za-z0-9]{16,}/);
    assert.doesNotMatch(serialized, /[A-Za-z]:\\\\/);
    assert.doesNotMatch(serialized, /\/Users\/|\/home\//);
  }
});
