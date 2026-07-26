import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseCodexRolloutFile,
  parseCodexRolloutText
} from "../src/context-history/rollout-parser.js";

const fixturesDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "rollout"
);

test("CDH-03 parses a sanitized rollout into effective history", async () => {
  const rolloutPath = join(
    fixturesDirectory,
    "sanitized-tool-chain.jsonl"
  );

  const history = await parseCodexRolloutFile({ rolloutPath });
  assert.ok(history);

  assert.equal(history.source, "rollout_bootstrap");
  assert.equal(history.incomplete, false);
  assert.equal(history.observationOnlyItems.length, 1);
  assert.deepEqual(history.unresolvedCallIds, []);
  assert.match(history.revision, /^rev-[0-9a-f]{24}$/);

  assert.deepEqual(
    history.replayableItems.map((entry) => entry.item.type),
    [
      "message",
      "reasoning",
      "function_call",
      "function_call_output",
      "message"
    ]
  );

  const repeated = await parseCodexRolloutFile({ rolloutPath });
  assert.ok(repeated);

  assert.equal(repeated.revision, history.revision);
  assert.deepEqual(
    repeated.replayableItems.map((entry) => entry.id),
    history.replayableItems.map((entry) => entry.id)
  );
});

test("CDH-03 isolates malformed lines without discarding valid items", async () => {
  const history = await parseCodexRolloutFile({
    rolloutPath: join(fixturesDirectory, "malformed-line.jsonl")
  });

  assert.ok(history);
  assert.equal(history.source, "rollout_bootstrap");
  assert.equal(history.incomplete, true);
  assert.equal(history.replayableItems.length, 2);

  assert.deepEqual(
    history.replayableItems.map((entry) => entry.item.role),
    ["user", "assistant"]
  );
});

test("CDH-03 filters orphan tool outputs", () => {
  const history = parseCodexRolloutText({
    text: [
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call_orphan",
          output: "orphan output"
        }
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: "The valid message remains."
            }
          ]
        }
      })
    ].join("\n")
  });

  assert.ok(history);
  assert.equal(history.incomplete, true);
  assert.equal(history.replayableItems.length, 1);
  assert.equal(history.replayableItems[0].item.type, "message");
});
