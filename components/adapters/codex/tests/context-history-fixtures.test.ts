import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendCodexRequestJournalEntry,
  appendCodexResponseJournalEntry,
  buildCodexEffectiveHistory,
  codexContextHistoryJournalPath,
  readCodexContextHistoryJournal,
  type JsonObject,
} from "../src/context-history/index.js";

async function withTempState(
  fn: (stateDir: string) => Promise<void>,
): Promise<void> {
  const stateDir = await mkdtemp(join(tmpdir(), "lightmem2-codex-history-fixtures-"));
  try {
    await fn(stateDir);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
}

function sseBlock(event: string | undefined, data: JsonObject | string): string {
  const lines = event ? [`event: ${event}`] : [];
  const text = typeof data === "string" ? data : JSON.stringify(data);
  for (const line of text.split("\n")) lines.push(`data: ${line}`);
  lines.push("");
  return lines.join("\n");
}

function sseStream(...blocks: string[]): string {
  return blocks.join("\n");
}

function completeStreamJournalFixture(responseId: string): string {
  return sseStream(
    sseBlock("response.created", { response: { id: responseId } }),
    sseBlock("response.output_item.added", {
      output_index: 0,
      item: { id: "msg-1", type: "message", role: "assistant", content: [] },
    }),
    sseBlock("response.output_text.delta", {
      item_id: "msg-1",
      output_index: 0,
      delta: "stream",
    }),
    sseBlock("response.output_text.done", {
      item_id: "msg-1",
      output_index: 0,
      text: "stream done",
    }),
    sseBlock("response.completed", { response: { id: responseId } }),
  );
}

async function appendLegacySchemaRecord(stateDir: string, sessionId: string): Promise<void> {
  await appendFile(
    codexContextHistoryJournalPath(stateDir, sessionId),
    `${JSON.stringify({
      schema: "lightmem2.codex.context-history.response/v0",
      kind: "response",
      sessionId,
      status: "completed",
      stream: false,
      observedAt: "2026-07-24T10:00:00.000Z",
      outputItems: [{ type: "message", role: "assistant", content: "legacy" }],
      outputItemRefs: [],
    })}\n`,
    "utf8",
  );
}

test("CDH-06 History fixtures rebuild a complete stream journal after restart", async () => {
  await withTempState(async (stateDir) => {
    await appendCodexRequestJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      payload: {
        stream: true,
        input: [{ role: "user", content: "stream fixture" }],
      },
      status: "completed",
    });
    await appendCodexResponseJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      rawStreamText: completeStreamJournalFixture("resp-stream-fixture"),
    });

    const first = await buildCodexEffectiveHistory({
      stateDir,
      sessionId: "codex-session-1",
      headResponseId: "resp-stream-fixture",
    });
    const afterRestart = await buildCodexEffectiveHistory({
      stateDir,
      sessionId: "codex-session-1",
      headResponseId: "resp-stream-fixture",
    });

    assert.equal(afterRestart.incomplete, false);
    assert.equal(afterRestart.revision, first.revision);
    assert.deepEqual(afterRestart.replayableItems, first.replayableItems);
    assert.match(JSON.stringify(afterRestart.replayableItems), /stream done/);
  });
});

test("CDH-06 History fixtures keep function and custom call closure resolved after restart", async () => {
  await withTempState(async (stateDir) => {
    await appendCodexRequestJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      payload: { input: [{ role: "user", content: "call tools" }] },
      status: "completed",
    });
    await appendCodexResponseJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      response: {
        id: "resp-1",
        output: [
          { id: "fc-1", type: "function_call", call_id: "call-1", name: "run_tests", arguments: "{}" },
          { id: "cc-1", type: "custom_tool_call", call_id: "custom-1", name: "edit", input: "payload" },
        ],
      },
      status: "completed",
    });
    await appendCodexRequestJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-2",
      payload: {
        previous_response_id: "resp-1",
        input: [
          { type: "function_call_output", call_id: "call-1", output: "{\"ok\":true}" },
          { type: "custom_tool_call_output", call_id: "custom-1", output: "{\"edited\":true}" },
          { role: "user", content: "continue" },
        ],
      },
      status: "completed",
    });
    await appendCodexResponseJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-2",
      response: {
        id: "resp-2",
        previous_response_id: "resp-1",
        output: [{ id: "msg-2", type: "message", role: "assistant", content: [] }],
      },
      status: "completed",
    });

    const history = await buildCodexEffectiveHistory({
      stateDir,
      sessionId: "codex-session-1",
      headResponseId: "resp-2",
    });

    assert.deepEqual(history.unresolvedCallIds, []);
    assert.match(JSON.stringify(history.replayableItems), /function_call_output/);
    assert.match(JSON.stringify(history.replayableItems), /custom_tool_call_output/);
  });
});

test("CDH-06 History fixtures isolate old schema records without dropping valid history", async () => {
  await withTempState(async (stateDir) => {
    await appendCodexRequestJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      payload: { input: [{ role: "user", content: "valid history" }] },
      status: "completed",
    });
    await appendCodexResponseJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      response: {
        id: "resp-1",
        output: [{ id: "msg-1", type: "message", role: "assistant", content: [] }],
      },
      status: "completed",
    });
    await appendLegacySchemaRecord(stateDir, "codex-session-1");

    const journal = await readCodexContextHistoryJournal(stateDir, "codex-session-1");
    const history = await buildCodexEffectiveHistory({
      stateDir,
      sessionId: "codex-session-1",
      headResponseId: "resp-1",
    });

    assert.equal(journal.entries.length, 2);
    assert.equal(journal.malformedLineCount, 1);
    assert.equal(history.incomplete, true);
    assert.match(JSON.stringify(history.replayableItems), /valid history/);
    assert.doesNotMatch(JSON.stringify(history.replayableItems), /legacy/);
  });
});
