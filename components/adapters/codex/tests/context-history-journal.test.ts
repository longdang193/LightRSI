import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendCodexRequestJournalEntry,
  appendCodexResponseJournalEntry,
  buildCodexEffectiveHistory,
  collectCodexResponseItemsFromStream,
  loadCodexContextHistoryJournal,
} from "../src/context-history/index.js";

async function withTempState(
  fn: (stateDir: string) => Promise<void>,
): Promise<void> {
  const stateDir = await mkdtemp(join(tmpdir(), "lightmem2-codex-context-history-"));
  try {
    await fn(stateDir);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
}

test("CDH-01 request journal stores sanitized input metadata and deduplicates request retries", async () => {
  await withTempState(async (stateDir) => {
    const payload = {
      model: "gpt-5.4-mini",
      stream: false,
      previous_response_id: "resp-prev-1",
      prompt_cache_key: "pk-session-1",
      api_key: "sk-should-not-persist",
      input: [
        {
          role: "developer",
          content: "stable instructions",
          headers: { authorization: "Bearer secret" },
        },
        {
          role: "user",
          content: [{ type: "input_text", text: "continue" }],
        },
      ],
    };

    const first = await appendCodexRequestJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      turnOrdinal: 7,
      payload,
      status: "completed",
      observedAt: "2026-07-24T10:00:00.000Z",
    });
    const retry = await appendCodexRequestJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      turnOrdinal: 7,
      payload,
      status: "completed",
      observedAt: "2026-07-24T10:00:01.000Z",
    });

    const journal = await loadCodexContextHistoryJournal(stateDir, "codex-session-1");
    assert.equal(first.requestId, retry.requestId);
    assert.equal(journal.length, 1);
    assert.equal(journal[0]?.kind, "request");
    assert.equal(journal[0]?.model, "gpt-5.4-mini");
    assert.equal(journal[0]?.previousResponseId, "resp-prev-1");
    assert.equal(journal[0]?.turnOrdinal, 7);
    assert.equal(journal[0]?.inputItems.length, 2);
    assert.doesNotMatch(JSON.stringify(journal[0]), /authorization|headers|sk-should-not-persist|Bearer secret/i);
  });
});

test("CDH-02 response journal stores full non-stream output items and native refs", async () => {
  await withTempState(async (stateDir) => {
    const entry = await appendCodexResponseJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      response: {
        id: "resp-1",
        previous_response_id: "resp-prev-1",
        output: [
          { id: "rs-1", type: "reasoning", encrypted_content: "opaque" },
          {
            id: "msg-1",
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "done" }],
          },
          { id: "fc-1", type: "function_call", call_id: "call-1", name: "run_tests", arguments: "{\"ok\":true}" },
          { id: "cc-1", type: "custom_tool_call", call_id: "custom-1", name: "custom", input: "payload" },
          { id: "ws-1", type: "web_search_call", query: "observation only" },
        ],
      },
      observedAt: "2026-07-24T10:00:02.000Z",
    });

    assert.equal(entry.responseId, "resp-1");
    assert.equal(entry.previousResponseId, "resp-prev-1");
    assert.equal(entry.outputItems.length, 5);
    assert.deepEqual(
      entry.outputItems.map((item) => item.type),
      ["reasoning", "message", "function_call", "custom_tool_call", "web_search_call"],
    );
    assert.deepEqual(
      entry.outputItemRefs.map((ref) => ref.callId).filter(Boolean),
      ["call-1", "custom-1"],
    );
  });
});

test("CDH-02 stream collector aggregates output items and marks incomplete streams", () => {
  const completeStream = [
    "event: response.created",
    "data: {\"response\":{\"id\":\"resp-stream-1\",\"previous_response_id\":\"resp-prev-1\"}}",
    "",
    "event: response.output_item.added",
    "data: {\"output_index\":0,\"item\":{\"id\":\"msg-1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"\"}]}}",
    "",
    "event: response.output_text.delta",
    "data: {\"item_id\":\"msg-1\",\"output_index\":0,\"delta\":\"hello\"}",
    "",
    "event: response.output_item.added",
    "data: {\"output_index\":1,\"item\":{\"id\":\"fc-1\",\"type\":\"function_call\",\"call_id\":\"call-1\",\"name\":\"run_tests\",\"arguments\":\"\"}}",
    "",
    "event: response.function_call_arguments.delta",
    "data: {\"item_id\":\"fc-1\",\"output_index\":1,\"delta\":\"{\\\"command\\\":\"}",
    "",
    "event: response.function_call_arguments.delta",
    "data: {\"item_id\":\"fc-1\",\"output_index\":1,\"delta\":\"\\\"npm test\\\"}\"}",
    "",
    "event: response.completed",
    "data: {\"response\":{\"id\":\"resp-stream-1\"}}",
    "",
    "data: [DONE]",
    "",
  ].join("\n");

  const complete = collectCodexResponseItemsFromStream(completeStream);
  assert.equal(complete.status, "completed");
  assert.equal(complete.responseId, "resp-stream-1");
  assert.equal(complete.previousResponseId, "resp-prev-1");
  assert.equal(complete.outputItems.length, 2);
  assert.match(JSON.stringify(complete.outputItems), /hello/);
  assert.match(JSON.stringify(complete.outputItems), /npm test/);
  assert.equal(complete.eventTypeCounts["response.output_text.delta"], 1);

  const incomplete = collectCodexResponseItemsFromStream(completeStream.replace("event: response.completed", "event: response.output_text.delta"));
  assert.equal(incomplete.status, "incomplete");
});

test("CDH-04 builds effective history from proxy journal in strict order with replay and observation split", async () => {
  await withTempState(async (stateDir) => {
    await appendCodexRequestJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      payload: {
        model: "gpt-5.4-mini",
        input: [
          { role: "developer", content: "stable instructions" },
          { role: "user", content: "turn one" },
        ],
      },
      status: "completed",
      observedAt: "2026-07-24T10:00:00.000Z",
    });
    await appendCodexResponseJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      response: {
        id: "resp-1",
        output: [
          { id: "msg-1", type: "message", role: "assistant", content: [{ type: "output_text", text: "need tool" }] },
          { id: "fc-1", type: "function_call", call_id: "call-1", name: "run_tests", arguments: "{}" },
          { id: "ws-1", type: "web_search_call", query: "observed but not replayed" },
        ],
      },
      observedAt: "2026-07-24T10:00:01.000Z",
    });
    await appendCodexRequestJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-2",
      payload: {
        model: "gpt-5.4-mini",
        previous_response_id: "resp-1",
        input: [
          { type: "function_call_output", call_id: "call-1", output: "{\"passed\":true}" },
          { role: "user", content: "turn two" },
        ],
      },
      status: "completed",
      observedAt: "2026-07-24T10:00:02.000Z",
    });

    const history = await buildCodexEffectiveHistory({
      stateDir,
      sessionId: "codex-session-1",
    });

    assert.equal(history.source, "proxy_journal");
    assert.equal(history.incomplete, false);
    assert.equal(history.unresolvedCallIds.length, 0);
    assert.equal(history.observationOnlyItems.length, 1);
    assert.equal(history.observationOnlyItems[0]?.item.type, "web_search_call");
    assert.deepEqual(
      history.replayableItems.map((entry) => entry.item.type ?? entry.item.role),
      ["developer", "user", "message", "function_call", "function_call_output", "user"],
    );
    assert.match(history.revision, /^rev-[0-9a-f]+$/);
  });
});

test("CDH-04 delegates to rollout parser bootstrap when proxy journal is incomplete", async () => {
  await withTempState(async (stateDir) => {
    await appendCodexResponseJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      rawStreamText: [
        "event: response.created",
        "data: {\"response\":{\"id\":\"resp-incomplete\"}}",
        "",
        "event: response.output_text.delta",
        "data: {\"item_id\":\"msg-1\",\"delta\":\"partial\"}",
        "",
      ].join("\n"),
    });

    const history = await buildCodexEffectiveHistory({
      stateDir,
      sessionId: "codex-session-1",
      async rolloutParserBootstrap() {
        return {
          revision: "rollout-rev-1",
          replayableItems: [
            {
              stableItemId: "rollout-user-1",
              nativeId: "rollout-msg-1",
              item: { role: "user", content: "bootstrapped from rollout parser fake" },
            },
          ],
          observationOnlyItems: [],
          unresolvedCallIds: [],
          source: "rollout_bootstrap",
          incomplete: false,
        };
      },
    });

    assert.equal(history.source, "rollout_bootstrap");
    assert.equal(history.revision, "rollout-rev-1");
    assert.equal(history.replayableItems[0]?.item.content, "bootstrapped from rollout parser fake");
  });
});
