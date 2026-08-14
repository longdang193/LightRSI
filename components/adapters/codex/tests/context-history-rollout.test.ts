import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseCodexRollout,
  parseCodexRolloutFile,
  parseCodexRolloutText,
} from "../src/context-history/index.js";

const fixturesDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "rollout",
);

test("GUA-04 parses the latest compacted rollout baseline and post-baseline items", async () => {
  const rolloutPath = join(fixturesDirectory, "sanitized-tool-chain.jsonl");
  const before = await stat(rolloutPath);
  const beforeText = await readFile(rolloutPath, "utf8");
  const snapshot = await parseCodexRollout(rolloutPath);
  assert.ok(snapshot);

  const { history } = snapshot;
  assert.equal(history.source, "rollout_bootstrap");
  assert.equal(history.incomplete, false);
  assert.equal(snapshot.compactionBaselineApplied, true);
  assert.equal(snapshot.view.history, snapshot.history);
  assert.equal(snapshot.view.semanticComplete, false);
  assert.deepEqual(snapshot.view.turns, []);
  assert.deepEqual(snapshot.view.reasonCodes, ["rollout_compaction_turn_boundary_unavailable"]);
  assert.deepEqual(history.unresolvedCallIds, []);
  assert.match(history.revision, /^rev-[0-9a-f]{24}$/);
  assert.deepEqual(
    history.replayableItems.map((entry) => entry.item.type),
    [
      "message",
      "reasoning",
      "function_call",
      "function_call_output",
      "custom_tool_call",
      "custom_tool_call_output",
      "message",
    ],
  );
  assert.doesNotMatch(JSON.stringify(history.replayableItems), /PRE_COMPACTION_SENTINEL/);
  assert.equal(history.observationOnlyItems.length, 2);
  assert.deepEqual(snapshot.taskEvidence.completedTurnIds, ["00000000-0000-4000-8000-000000000002"]);
  assert.deepEqual(snapshot.taskEvidence.abortedTurnIds, []);
  assert.deepEqual(snapshot.unknownRecordTypeCounts, { future_record_type: 1 });
  assert.deepEqual(snapshot.sessionMeta, {
    sessionId: "00000000-0000-4000-8000-000000000001",
    cwd: "/workspace/sample-project",
    originator: "codex_cli_rs",
    cliVersion: "0.0.0-test",
    source: "cli",
    modelProvider: "openai",
  });

  const repeated = await parseCodexRolloutFile({ rolloutPath });
  assert.ok(repeated);
  assert.equal(repeated.history.revision, history.revision);
  assert.deepEqual(
    repeated.history.replayableItems.map((entry) => entry.stableItemId),
    history.replayableItems.map((entry) => entry.stableItemId),
  );
  assert.equal((await stat(rolloutPath)).mtimeMs, before.mtimeMs);
  assert.equal(await readFile(rolloutPath, "utf8"), beforeText);
});

test("GUA-04 does not convert Codex UUID turn ids into shared turn sequences", () => {
  const snapshot = parseCodexRolloutText({
    text: [
      JSON.stringify({
        type: "session_meta",
        payload: { id: "codex-session-rollout-uuid" },
      }),
      JSON.stringify({
        type: "turn_context",
        payload: { turn_id: "00000000-0000-4000-8000-000000000099" },
      }),
      JSON.stringify({
        type: "response_item",
        payload: { id: "msg-uuid", type: "message", role: "assistant", content: "answer" },
      }),
    ].join("\n"),
  });

  assert.ok(snapshot);
  assert.deepEqual(snapshot.view.turns, []);
  assert.equal(snapshot.view.semanticComplete, false);
  assert.deepEqual(snapshot.view.reasonCodes, ["rollout_turn_boundary_unavailable"]);
});

test("GUA-04 builds rollout sidecars only from explicit positive turn sequences", () => {
  const snapshot = parseCodexRolloutText({
    text: [
      JSON.stringify({
        type: "session_meta",
        payload: { id: "codex-session-rollout-seq" },
      }),
      JSON.stringify({
        type: "turn_context",
        payload: { turn_id: "opaque-host-turn", turn_seq: 7 },
      }),
      JSON.stringify({
        type: "response_item",
        payload: { id: "call-7", type: "function_call", call_id: "tool-7", name: "run", arguments: "{}" },
      }),
      JSON.stringify({
        type: "turn_context",
        payload: { turn_id: "opaque-host-turn-next", turn_ordinal: 8 },
      }),
      JSON.stringify({
        type: "response_item",
        payload: { id: "output-8", type: "function_call_output", call_id: "tool-7", output: "done" },
      }),
      JSON.stringify({
        type: "response_item",
        payload: { id: "user-8", type: "message", role: "user", content: "continue" },
      }),
    ].join("\n"),
  });

  assert.ok(snapshot);
  assert.equal(snapshot.view.semanticComplete, true);
  assert.deepEqual(snapshot.view.reasonCodes, []);
  assert.deepEqual(snapshot.view.turns.map((turn) => ({
    turnSeq: turn.turnSeq,
    turnAbsId: turn.turnAbsId,
    inputCount: turn.inputItemIds.length,
    outputCount: turn.outputItemIds.length,
  })), [
    { turnSeq: 7, turnAbsId: "codex-session-rollout-seq:t7", inputCount: 0, outputCount: 1 },
    { turnSeq: 8, turnAbsId: "codex-session-rollout-seq:t8", inputCount: 2, outputCount: 0 },
  ]);
});

test("GUA-04 isolates malformed lines without discarding valid items", async () => {
  const snapshot = await parseCodexRolloutFile({
    rolloutPath: join(fixturesDirectory, "malformed-line.jsonl"),
  });
  assert.ok(snapshot);
  assert.equal(snapshot.malformedLineCount, 1);
  assert.equal(snapshot.history.incomplete, true);
  assert.equal(snapshot.history.replayableItems.length, 2);
  assert.deepEqual(
    snapshot.history.replayableItems.map((entry) => entry.item.role),
    ["user", "assistant"],
  );
});

test("GUA-04 filters orphan tool outputs and reports unresolved calls", () => {
  const snapshot = parseCodexRolloutText({
    text: [
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call_orphan",
          output: "orphan output",
        },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          call_id: "call_unresolved",
          name: "custom",
          input: "payload",
        },
      }),
    ].join("\n"),
  });
  assert.ok(snapshot);
  assert.equal(snapshot.history.incomplete, true);
  assert.equal(snapshot.history.replayableItems.length, 1);
  assert.deepEqual(snapshot.history.unresolvedCallIds, ["call_unresolved"]);
});

test("GUA-04 uses only the latest compaction baseline", () => {
  const snapshot = parseCodexRolloutText({
    text: [
      "{malformed before baseline",
      JSON.stringify({
        type: "event_msg",
        payload: { type: "task_complete", turn_id: "turn-before-baseline" },
      }),
      JSON.stringify({
        type: "compacted",
        payload: {
          replacement_history: [{ role: "user", content: "FIRST_BASELINE_SENTINEL" }],
        },
      }),
      JSON.stringify({
        type: "response_item",
        payload: { role: "assistant", content: "between baselines" },
      }),
      JSON.stringify({
        type: "compacted",
        payload: {
          replacement_history: [{ role: "user", content: "LATEST_BASELINE_SENTINEL" }],
        },
      }),
      JSON.stringify({
        type: "response_item",
        payload: { role: "assistant", content: "after latest baseline" },
      }),
      JSON.stringify({
        type: "event_msg",
        payload: { type: "task_complete", turn_id: "turn-after-baseline" },
      }),
    ].join("\n"),
  });
  assert.ok(snapshot);
  assert.equal(snapshot.malformedLineCount, 1);
  assert.equal(snapshot.history.incomplete, false);
  const replayed = JSON.stringify(snapshot.history.replayableItems);
  assert.doesNotMatch(replayed, /FIRST_BASELINE_SENTINEL|between baselines/);
  assert.match(replayed, /LATEST_BASELINE_SENTINEL|after latest baseline/);
  assert.deepEqual(snapshot.taskEvidence.completedTurnIds, ["turn-after-baseline"]);
});

test("GUA-04 rejects mismatched custom and function tool outputs", () => {
  const snapshot = parseCodexRolloutText({
    text: [
      JSON.stringify({
        type: "response_item",
        payload: { type: "custom_tool_call", call_id: "call-1", name: "custom", input: "payload" },
      }),
      JSON.stringify({
        type: "response_item",
        payload: { type: "function_call_output", call_id: "call-1", output: "wrong protocol" },
      }),
    ].join("\n"),
  });
  assert.ok(snapshot);
  assert.equal(snapshot.history.incomplete, true);
  assert.deepEqual(snapshot.history.unresolvedCallIds, ["call-1"]);
  assert.deepEqual(
    snapshot.history.replayableItems.map((entry) => entry.item.type),
    ["custom_tool_call"],
  );
});

test("GUA-04 defers unsafe rollout items instead of replaying them", () => {
  const snapshot = parseCodexRolloutText({
    text: [
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "reasoning",
          summary: [{ type: "summary_text", text: "missing encrypted payload" }],
        },
      }),
      JSON.stringify({
        type: "response_item",
        payload: { type: "future_provider_item", payload: "opaque" },
      }),
    ].join("\n"),
  });

  assert.ok(snapshot);
  assert.equal(snapshot.history.incomplete, true);
  assert.equal(snapshot.history.replayableItems.length, 0);
  assert.deepEqual(
    snapshot.history.deferredItems.map((entry) => entry.item.type),
    ["reasoning", "future_provider_item"],
  );
});

test("GUA-04 records completion and abort evidence without failing on unknown rows", () => {
  const snapshot = parseCodexRolloutText({
    text: [
      JSON.stringify({
        type: "event_msg",
        payload: { type: "task_complete", turn_id: "turn-complete" },
      }),
      JSON.stringify({
        type: "event_msg",
        payload: { type: "turn_aborted", turn_id: "turn-aborted" },
      }),
      JSON.stringify({ type: "future_record", payload: { ok: true } }),
    ].join("\n"),
  });
  assert.ok(snapshot);
  assert.deepEqual(snapshot.taskEvidence.completedTurnIds, ["turn-complete"]);
  assert.deepEqual(snapshot.taskEvidence.abortedTurnIds, ["turn-aborted"]);
  assert.deepEqual(snapshot.unknownRecordTypeCounts, { future_record: 1 });
  assert.equal(snapshot.history.incomplete, false);
});

test("GUA-04 returns null for missing rollout files", async () => {
  assert.equal(await parseCodexRollout(join(fixturesDirectory, "missing.jsonl")), null);
});
