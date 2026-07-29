import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendCodexRequestJournalEntry,
  appendCodexResponseJournalEntry,
  codexContextHistoryJournalPath,
  loadCodexContextHistoryJournal,
  readCodexContextHistoryJournal,
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

test("CDH-01 request journal deduplicates retries after sanitizing volatile input metadata", async () => {
  await withTempState(async (stateDir) => {
    const first = await appendCodexRequestJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      payload: {
        model: "gpt-5.4-mini",
        previous_response_id: "resp-prev-1",
        input: [
          {
            role: "user",
            content: "same request body",
            headers: { authorization: "Bearer first-token" },
          },
        ],
      },
      status: "completed",
    });
    const retry = await appendCodexRequestJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      payload: {
        model: "gpt-5.4-mini",
        previous_response_id: "resp-prev-1",
        input: [
          {
            role: "user",
            content: "same request body",
            headers: { authorization: "Bearer second-token" },
          },
        ],
      },
      status: "completed",
    });

    const journal = await loadCodexContextHistoryJournal(stateDir, "codex-session-1");

    assert.equal(first.requestId, retry.requestId);
    assert.equal(journal.length, 1);
    assert.doesNotMatch(JSON.stringify(journal[0]), /authorization|Bearer first-token|Bearer second-token/i);
  });
});

test("CDH-01 request journal advances pending requests to a terminal state", async () => {
  await withTempState(async (stateDir) => {
    const params = {
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      payload: { input: [{ role: "user", content: "continue" }] },
    };
    await appendCodexRequestJournalEntry({ ...params, status: "pending" });
    const completed = await appendCodexRequestJournalEntry({ ...params, status: "completed" });

    const journal = await loadCodexContextHistoryJournal(stateDir, "codex-session-1");
    const requestStates = journal.filter((entry) => entry.kind === "request");
    assert.deepEqual(requestStates.map((entry) => entry.status), ["pending", "completed"]);
    assert.equal(completed.status, "completed");
    assert.equal(requestStates[0]?.turnOrdinal, requestStates[1]?.turnOrdinal);
  });
});

test("CDH-01 isolates malformed JSONL records without discarding valid history", async () => {
  await withTempState(async (stateDir) => {
    await appendCodexRequestJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      payload: { input: [{ role: "user", content: "valid" }] },
      status: "completed",
    });
    await appendFile(
      codexContextHistoryJournalPath(stateDir, "codex-session-1"),
      [
        "{\"truncated\":",
        JSON.stringify({
          schema: "lightmem2.codex.context-history.request/v1",
          kind: "request",
          status: "completed",
        }),
      ].join("\n"),
      "utf8",
    );

    const journal = await readCodexContextHistoryJournal(stateDir, "codex-session-1");
    assert.equal(journal.entries.length, 1);
    assert.equal(journal.malformedLineCount, 2);
    assert.equal(journal.readError, undefined);
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

test("CDH-02 response journal respects failed non-stream response bodies", async () => {
  await withTempState(async (stateDir) => {
    const entry = await appendCodexResponseJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      response: {
        id: "resp-body-failed",
        status: "failed",
        output: [
          { id: "msg-1", type: "message", role: "assistant", content: [{ type: "output_text", text: "partial" }] },
        ],
      },
      status: "completed",
    });

    assert.equal(entry.status, "failed");
    assert.equal(entry.responseId, "resp-body-failed");
    assert.match(JSON.stringify(entry.outputItems), /partial/);
  });
});

test("CDH-02 response journal respects incomplete non-stream response bodies", async () => {
  await withTempState(async (stateDir) => {
    const entry = await appendCodexResponseJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      response: {
        id: "resp-body-incomplete",
        status: "incomplete",
        output: [
          { id: "msg-1", type: "message", role: "assistant", content: [{ type: "output_text", text: "partial" }] },
        ],
      },
      status: "completed",
    });

    assert.equal(entry.status, "incomplete");
    assert.equal(entry.responseId, "resp-body-incomplete");
    assert.match(JSON.stringify(entry.outputItems), /partial/);
  });
});

test("CDH-02 response journal stores stream output items and stream metadata", async () => {
  await withTempState(async (stateDir) => {
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

    const complete = await appendCodexResponseJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      rawStreamText: completeStream,
    });
    const incomplete = await appendCodexResponseJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-2",
      rawStreamText: completeStream.replace("event: response.completed", "event: response.output_text.delta"),
    });

    const journal = await loadCodexContextHistoryJournal(stateDir, "codex-session-1");

    assert.equal(complete.stream, true);
    assert.equal(complete.status, "completed");
    assert.equal(complete.responseId, "resp-stream-1");
    assert.equal(complete.previousResponseId, "resp-prev-1");
    assert.equal(complete.outputItems.length, 2);
    assert.match(JSON.stringify(complete.outputItems), /hello/);
    assert.match(JSON.stringify(complete.outputItems), /npm test/);
    assert.equal(complete.eventTypeCounts?.["response.output_text.delta"], 1);
    assert.equal(incomplete.status, "incomplete");
    assert.equal(journal.length, 2);
  });
});

test("CDH-02 response journal marks malformed completed streams incomplete", async () => {
  await withTempState(async (stateDir) => {
    const entry = await appendCodexResponseJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      rawStreamText: [
        "event: response.created",
        "data: {\"response\":{\"id\":\"resp-malformed-completed\"}}",
        "",
        "event: response.output_item.done",
        "data: {\"output_index\":0,\"item\":{\"id\":\"msg-1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"kept\"}]}}",
        "",
        "event: response.output_text.delta",
        "data: {\"truncated\":",
        "",
        "event: response.completed",
        "data: {\"response\":{\"id\":\"resp-malformed-completed\"}}",
        "",
      ].join("\n"),
    });

    assert.equal(entry.status, "incomplete");
    assert.equal(entry.responseId, "resp-malformed-completed");
    assert.equal(entry.malformedEventCount, 1);
    assert.match(JSON.stringify(entry.outputItems), /kept/);
  });
});

test("CDH-02 response journal keeps interrupted 2xx streams incomplete", async () => {
  await withTempState(async (stateDir) => {
    const entry = await appendCodexResponseJournalEntry({
      stateDir,
      sessionId: "codex-session-1",
      requestId: "request-1",
      rawStreamText: [
        "event: response.created",
        "data: {\"response\":{\"id\":\"resp-interrupted-2xx\"}}",
        "",
        "event: response.output_item.done",
        "data: {\"output_index\":0,\"item\":{\"id\":\"msg-1\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"partial\"}]}}",
        "",
      ].join("\n"),
      status: "completed",
    });

    assert.equal(entry.status, "incomplete");
    assert.equal(entry.responseId, "resp-interrupted-2xx");
    assert.match(JSON.stringify(entry.outputItems), /partial/);
  });
});
