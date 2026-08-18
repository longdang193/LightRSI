import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type {
  CodexEffectiveHistoryItem,
  CodexEffectiveHistoryReasonCode,
  CodexEffectiveHistoryView,
  JsonObject,
} from "../src/context-history/index.js";
import {
  appendCodexRequestJournalEntry,
  appendCodexResponseJournalEntry,
  buildCodexEffectiveHistoryView,
  parseCodexRolloutText,
} from "../src/context-history/index.js";
import { buildCodexRawSemanticTurns } from "../src/index.js";

const SESSION_ID = "codex-semantic-session";

function effective(stableItemId: string, item: JsonObject): CodexEffectiveHistoryItem {
  return { stableItemId, item };
}

function view(params: {
  items: CodexEffectiveHistoryItem[];
  turns: Array<{ turnSeq: number; inputItemIds?: string[]; outputItemIds?: string[] }>;
  semanticComplete?: boolean;
  reasonCodes?: CodexEffectiveHistoryReasonCode[];
  deferredItems?: CodexEffectiveHistoryItem[];
}): CodexEffectiveHistoryView {
  return {
    history: {
      revision: "semantic-revision",
      replayableItems: params.items,
      observationOnlyItems: [],
      deferredItems: params.deferredItems ?? [],
      unresolvedCallIds: [],
      source: "proxy_journal",
      incomplete: params.semanticComplete === false,
    },
    turns: params.turns.map((turn) => ({
      turnSeq: turn.turnSeq,
      turnAbsId: `${SESSION_ID}:t${turn.turnSeq}`,
      inputItemIds: turn.inputItemIds ?? [],
      outputItemIds: turn.outputItemIds ?? [],
    })),
    semanticComplete: params.semanticComplete ?? true,
    reasonCodes: params.reasonCodes ?? [],
  };
}

test("semantic mapping preserves deterministic multi-turn user and assistant text order", () => {
  const source = view({
    items: [
      effective("u1", { type: "message", role: "user", content: "first user" }),
      effective("a1", {
        type: "message",
        role: "assistant",
        content: [
          { type: "output_text", text: "first answer" },
          { type: "text", text: "second answer part" },
        ],
      }),
      effective("u2", {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "second user" }],
      }),
      effective("a2", { type: "message", role: "assistant", content: "final answer" }),
    ],
    turns: [
      { turnSeq: 2, inputItemIds: ["u2"], outputItemIds: ["a2"] },
      { turnSeq: 1, inputItemIds: ["u1"], outputItemIds: ["a1"] },
    ],
  });

  const first = buildCodexRawSemanticTurns(source);
  const restarted = buildCodexRawSemanticTurns(structuredClone(source));

  assert.equal(first.complete, true);
  assert.deepEqual(first.reasonCodes, []);
  assert.deepEqual(first.turns.map((turn) => turn.turnSeq), [1, 2]);
  assert.deepEqual(first.turns[0]!.messages.map(({ role, text }) => ({ role, text })), [
    { role: "user", text: "first user" },
    { role: "assistant", text: "first answer" },
    { role: "assistant", text: "second answer part" },
  ]);
  assert.equal(first.turns[0]!.messages[0]!.anchor.turnAbsId, `${SESSION_ID}:t1`);
  assert.deepEqual(first, restarted);
});

test("semantic mapping closes function calls and results on the original call turn", () => {
  const source = view({
    items: [
      effective("call", {
        type: "function_call",
        call_id: "call-1",
        name: "run_tests",
        arguments: "{\"scope\":\"unit\"}",
      }),
      effective("result", {
        type: "function_call_output",
        call_id: "call-1",
        output: "all tests passed",
      }),
    ],
    turns: [
      { turnSeq: 1, outputItemIds: ["call"] },
      { turnSeq: 2, inputItemIds: ["result"] },
    ],
  });

  const mapped = buildCodexRawSemanticTurns(source);

  assert.equal(mapped.complete, true);
  assert.equal(mapped.turns[0]!.toolCalls[0]!.toolCallId, "call-1");
  assert.equal(mapped.turns[0]!.toolCalls[0]!.argumentsText, "{\"scope\":\"unit\"}");
  assert.equal(mapped.turns[0]!.toolResults[0]!.fullText, "all tests passed");
  assert.equal(mapped.turns[0]!.toolResults[0]!.anchor.turnSeq, 1);
  assert.deepEqual(mapped.turns[1]!.toolResults, []);
});

test("semantic mapping preserves the original call ID and rejects missing call payload", () => {
  const originalCallId = " call-with-spaces ";
  const preserved = buildCodexRawSemanticTurns(view({
    items: [
      effective("call", {
        type: "function_call",
        call_id: originalCallId,
        name: "  run  ",
        arguments: "{}",
      }),
      effective("result", {
        type: "function_call_output",
        call_id: originalCallId,
        output: "done",
      }),
    ],
    turns: [
      { turnSeq: 1, outputItemIds: ["call"] },
      { turnSeq: 2, inputItemIds: ["result"] },
    ],
  }));
  assert.equal(preserved.complete, true);
  assert.equal(preserved.turns[0]!.toolCalls[0]!.toolCallId, originalCallId);
  assert.equal(preserved.turns[0]!.toolCalls[0]!.toolName, "run");
  assert.equal(preserved.turns[0]!.toolResults[0]!.toolCallId, originalCallId);

  const missingPayload = buildCodexRawSemanticTurns(view({
    items: [
      effective("call", { type: "custom_tool_call", call_id: "missing", name: "custom" }),
      effective("result", { type: "custom_tool_call_output", call_id: "missing", output: "done" }),
    ],
    turns: [
      { turnSeq: 1, outputItemIds: ["call"] },
      { turnSeq: 2, inputItemIds: ["result"] },
    ],
  }));
  assert.equal(missingPayload.complete, false);
  assert.deepEqual(missingPayload.reasonCodes, ["semantic_tool_call_invalid"]);
  assert.deepEqual(missingPayload.turns[0]!.toolCalls, []);
  assert.deepEqual(missingPayload.turns[0]!.toolResults, []);
});

test("semantic mapping consumes a real journal effective-history view across restart", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-codex-semantic-mapping-"));
  const sessionId = "codex-semantic-journal-session";
  try {
    await appendCodexRequestJournalEntry({
      stateDir,
      sessionId,
      requestId: "request-1",
      turnOrdinal: 1,
      payload: {
        input: [{
          id: "user-1",
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "run the tests" }],
        }],
      },
      status: "completed",
    });
    await appendCodexResponseJournalEntry({
      stateDir,
      sessionId,
      requestId: "request-1",
      response: {
        id: "response-1",
        output: [{
          id: "call-1-item",
          type: "function_call",
          call_id: "call-1",
          name: "run_tests",
          arguments: "{}",
        }],
      },
      status: "completed",
    });
    await appendCodexRequestJournalEntry({
      stateDir,
      sessionId,
      requestId: "request-2",
      turnOrdinal: 2,
      payload: {
        previous_response_id: "response-1",
        input: [
          { type: "function_call_output", call_id: "call-1", output: "passed" },
          { id: "user-2", type: "message", role: "user", content: "summarize" },
        ],
      },
      status: "completed",
    });
    await appendCodexResponseJournalEntry({
      stateDir,
      sessionId,
      requestId: "request-2",
      response: {
        id: "response-2",
        previous_response_id: "response-1",
        output: [{ id: "assistant-2", type: "message", role: "assistant", content: "done" }],
      },
      status: "completed",
    });

    const first = buildCodexRawSemanticTurns(await buildCodexEffectiveHistoryView({
      stateDir,
      sessionId,
    }));
    const restarted = buildCodexRawSemanticTurns(await buildCodexEffectiveHistoryView({
      stateDir,
      sessionId,
    }));

    assert.equal(first.complete, true);
    assert.deepEqual(first, restarted);
    assert.deepEqual(first.turns.map((turn) => turn.turnSeq), [1, 2]);
    assert.deepEqual(first.turns[0]!.messages.map((entry) => entry.text), ["run the tests"]);
    assert.deepEqual(first.turns[0]!.toolCalls.map((entry) => entry.toolCallId), ["call-1"]);
    assert.deepEqual(first.turns[0]!.toolResults.map((entry) => entry.toolCallId), ["call-1"]);
    assert.deepEqual(first.turns[1]!.messages.map((entry) => entry.text), ["summarize", "done"]);
    assert.deepEqual(first.turns[1]!.toolResults, []);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("semantic mapping closes custom tool calls without treating input as a user message", () => {
  const source = view({
    items: [
      effective("custom-call", {
        type: "custom_tool_call",
        call_id: "custom-1",
        name: "apply_patch",
        input: "*** Begin Patch",
      }),
      effective("custom-result", {
        type: "custom_tool_call_output",
        call_id: "custom-1",
        output: [{ type: "output_text", text: "Done!" }],
      }),
    ],
    turns: [
      { turnSeq: 4, outputItemIds: ["custom-call"] },
      { turnSeq: 5, inputItemIds: ["custom-result"] },
    ],
  });

  const mapped = buildCodexRawSemanticTurns(source);

  assert.equal(mapped.complete, true);
  assert.deepEqual(mapped.turns[0]!.messages, []);
  assert.equal(mapped.turns[0]!.toolCalls[0]!.argumentsSummary, "*** Begin Patch");
  assert.equal(mapped.turns[0]!.toolResults[0]!.summary, "Done!");
});

test("semantic mapping preserves independent call and result item order", () => {
  const mapped = buildCodexRawSemanticTurns(view({
    items: [
      effective("call-1", { type: "function_call", call_id: "one", name: "one", arguments: "{}" }),
      effective("call-2", { type: "function_call", call_id: "two", name: "two", arguments: "{}" }),
      effective("result-2", { type: "function_call_output", call_id: "two", output: "two done" }),
      effective("result-1", { type: "function_call_output", call_id: "one", output: "one done" }),
    ],
    turns: [
      { turnSeq: 1, outputItemIds: ["call-1", "call-2"] },
      { turnSeq: 2, inputItemIds: ["result-2", "result-1"] },
    ],
  }));

  assert.equal(mapped.complete, true);
  assert.deepEqual(mapped.turns[0]!.toolCalls.map((entry) => entry.toolCallId), ["one", "two"]);
  assert.deepEqual(mapped.turns[0]!.toolResults.map((entry) => entry.toolCallId), ["two", "one"]);
});

test("semantic mapping does not disguise system or developer instructions", () => {
  const source = view({
    items: [
      effective("system", { type: "message", role: "system", content: "protected system" }),
      effective("developer", {
        type: "message",
        role: "developer",
        content: [{ type: "input_text", text: "protected developer" }],
      }),
      effective("user", { type: "message", role: "user", content: "visible user" }),
    ],
    turns: [{ turnSeq: 1, inputItemIds: ["system", "developer", "user"] }],
  });

  const mapped = buildCodexRawSemanticTurns(source);

  assert.equal(mapped.complete, true);
  assert.deepEqual(mapped.turns[0]!.messages.map(({ role, text }) => ({ role, text })), [
    { role: "user", text: "visible user" },
  ]);
  assert.doesNotMatch(JSON.stringify(mapped), /protected system|protected developer/);
});

test("semantic mapping never exposes encrypted reasoning or fabricates provider messages", () => {
  const encrypted = "opaque-encrypted-reasoning-secret";
  const source = view({
    items: [
      effective("reasoning", { type: "reasoning", encrypted_content: encrypted, summary: "private" }),
      effective("compaction", { type: "compaction", encrypted_content: "opaque-compaction" }),
      effective("provider", { type: "web_search_call", id: "search-1", status: "completed" }),
    ],
    turns: [{ turnSeq: 3, outputItemIds: ["reasoning", "compaction", "provider"] }],
  });

  const mapped = buildCodexRawSemanticTurns(source);
  const serialized = JSON.stringify(mapped);

  assert.equal(mapped.complete, true);
  assert.deepEqual(mapped.turns[0]!.messages, []);
  assert.deepEqual(mapped.turns[0]!.toolCalls, []);
  assert.deepEqual(mapped.turns[0]!.toolResults, []);
  assert.doesNotMatch(serialized, /opaque-encrypted-reasoning-secret|opaque-compaction|private/);
});

test("semantic mapping accepts trusted rollout turns with observation-only boundary records", () => {
  const snapshot = parseCodexRolloutText({
    text: [
      JSON.stringify({
        type: "session_meta",
        payload: { id: "codex-semantic-rollout" },
      }),
      JSON.stringify({
        type: "turn_context",
        payload: { turn_seq: 7 },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          id: "assistant-7",
          type: "message",
          role: "assistant",
          content: "trusted rollout answer",
        },
      }),
      JSON.stringify({
        type: "event_msg",
        payload: { type: "task_complete", turn_id: "host-turn-7" },
      }),
    ].join("\n"),
  });

  assert.ok(snapshot);
  assert.equal(snapshot.view.semanticComplete, true);
  assert.equal(snapshot.view.history.observationOnlyItems.length, 2);

  const mapped = buildCodexRawSemanticTurns(snapshot.view);

  assert.equal(mapped.complete, true);
  assert.deepEqual(mapped.reasonCodes, []);
  assert.deepEqual(mapped.turns.map((turn) => turn.turnSeq), [7]);
  assert.deepEqual(mapped.turns[0]!.messages.map((message) => message.text), [
    "trusted rollout answer",
  ]);
  assert.doesNotMatch(JSON.stringify(mapped), /turn_context|event_msg|host-turn-7/);
});

test("semantic mapping fails closed instead of dropping unsupported client tool protocols", () => {
  const mapped = buildCodexRawSemanticTurns(view({
    items: [
      effective("computer-call", { type: "computer_call", call_id: "computer-1", action: "click" }),
      effective("computer-result", {
        type: "computer_call_output",
        call_id: "computer-1",
        output: "clicked",
      }),
    ],
    turns: [{ turnSeq: 1, outputItemIds: ["computer-call"], inputItemIds: ["computer-result"] }],
  }));

  assert.equal(mapped.complete, false);
  assert.deepEqual(mapped.reasonCodes, ["semantic_item_unsupported"]);
  assert.deepEqual(mapped.turns[0]!.toolCalls, []);
  assert.deepEqual(mapped.turns[0]!.toolResults, []);
});

test("semantic mapping fails closed for partial, ambiguous and mismatched tool closure", () => {
  const partial = buildCodexRawSemanticTurns(view({
    items: [effective("call", {
      type: "function_call",
      call_id: "partial",
      name: "read",
      arguments: "{}",
    })],
    turns: [{ turnSeq: 1, outputItemIds: ["call"] }],
  }));
  assert.equal(partial.complete, false);
  assert.equal(partial.reasonCodes.includes("semantic_tool_closure_incomplete"), true);

  const ambiguous = buildCodexRawSemanticTurns(view({
    items: [
      effective("call-1", { type: "function_call", call_id: "same", name: "one", arguments: "{}" }),
      effective("call-2", { type: "function_call", call_id: "same", name: "two", arguments: "{}" }),
      effective("result", { type: "function_call_output", call_id: "same", output: "done" }),
    ],
    turns: [{ turnSeq: 1, outputItemIds: ["call-1", "call-2"], inputItemIds: ["result"] }],
  }));
  assert.equal(ambiguous.complete, false);
  assert.equal(ambiguous.reasonCodes.includes("semantic_tool_closure_ambiguous"), true);

  const mismatch = buildCodexRawSemanticTurns(view({
    items: [
      effective("call", { type: "custom_tool_call", call_id: "mixed", name: "custom", input: "go" }),
      effective("result", { type: "function_call_output", call_id: "mixed", output: "done" }),
    ],
    turns: [{ turnSeq: 1, outputItemIds: ["call"], inputItemIds: ["result"] }],
  }));
  assert.equal(mismatch.complete, false);
  assert.equal(mismatch.reasonCodes.includes("semantic_tool_protocol_mismatch"), true);
});

test("semantic mapping rejects a tool result that precedes its call", () => {
  const mapped = buildCodexRawSemanticTurns(view({
    items: [
      effective("result", { type: "function_call_output", call_id: "late", output: "too early" }),
      effective("call", { type: "function_call", call_id: "late", name: "run", arguments: "{}" }),
    ],
    turns: [
      { turnSeq: 1, inputItemIds: ["result"] },
      { turnSeq: 2, outputItemIds: ["call"] },
    ],
  }));

  assert.equal(mapped.complete, false);
  assert.deepEqual(mapped.reasonCodes, ["semantic_tool_result_precedes_call"]);
  assert.deepEqual(mapped.turns[1]!.toolCalls, []);
  assert.deepEqual(mapped.turns[1]!.toolResults, []);
});

test("semantic mapping propagates incomplete history and rejects unknown attribution", () => {
  const incomplete = buildCodexRawSemanticTurns(view({
    items: [effective("known", { type: "message", role: "user", content: "known" })],
    turns: [{ turnSeq: 1, inputItemIds: ["missing"] }],
    semanticComplete: false,
    reasonCodes: ["journal_turn_attribution_incomplete"],
  }));

  assert.equal(incomplete.complete, false);
  assert.deepEqual(incomplete.reasonCodes, [
    "journal_turn_attribution_incomplete",
    "semantic_source_incomplete",
    "semantic_item_attribution_unknown",
  ]);
});

test("semantic mapping fails closed for inconsistent deferred source history", () => {
  const deferred = effective("deferred", { type: "future_provider_item", payload: "opaque" });
  const mapped = buildCodexRawSemanticTurns(view({
    items: [],
    deferredItems: [deferred],
    turns: [{ turnSeq: 1, outputItemIds: ["deferred"] }],
  }));

  assert.equal(mapped.complete, false);
  assert.deepEqual(mapped.reasonCodes, [
    "semantic_source_incomplete",
    "semantic_item_unsupported",
  ]);
  assert.deepEqual(mapped.turns[0]!.messages, []);
});

test("semantic mapping rejects arbitrary nested provider payloads as message text", () => {
  const mapped = buildCodexRawSemanticTurns(view({
    items: [effective("message", {
      type: "message",
      role: "assistant",
      content: [{ type: "provider_payload", nested: { text: "must not leak" } }],
    })],
    turns: [{ turnSeq: 1, outputItemIds: ["message"] }],
  }));

  assert.equal(mapped.complete, false);
  assert.equal(mapped.reasonCodes.includes("semantic_message_content_unsupported"), true);
  assert.deepEqual(mapped.turns[0]!.messages, []);
  assert.doesNotMatch(JSON.stringify(mapped), /must not leak/);
});

test("semantic mapping requires explicit safe types for content array parts", () => {
  const mapped = buildCodexRawSemanticTurns(view({
    items: [effective("message", {
      type: "message",
      role: "user",
      content: ["untyped array text", { type: "input_text", text: "typed text" }],
    })],
    turns: [{ turnSeq: 1, inputItemIds: ["message"] }],
  }));

  assert.equal(mapped.complete, false);
  assert.deepEqual(mapped.reasonCodes, ["semantic_message_content_unsupported"]);
  assert.deepEqual(mapped.turns[0]!.messages.map((entry) => entry.text), ["typed text"]);
  assert.doesNotMatch(JSON.stringify(mapped), /untyped array text/);
});

test("semantic mapping fails closed on invalid turn identity and duplicate turn sequences", () => {
  const invalid = view({
    items: [effective("user", { type: "message", role: "user", content: "hello" })],
    turns: [{ turnSeq: 1, inputItemIds: ["user"] }],
  });
  invalid.turns[0]!.turnAbsId = `${SESSION_ID}:t2`;

  const invalidMapped = buildCodexRawSemanticTurns(invalid);
  assert.equal(invalidMapped.complete, false);
  assert.deepEqual(invalidMapped.reasonCodes, [
    "semantic_turn_identity_invalid",
    "semantic_item_attribution_unknown",
  ]);
  assert.deepEqual(invalidMapped.turns, []);

  const duplicate = view({
    items: [
      effective("user-1", { type: "message", role: "user", content: "first" }),
      effective("user-2", { type: "message", role: "user", content: "second" }),
    ],
    turns: [
      { turnSeq: 1, inputItemIds: ["user-1"] },
      { turnSeq: 1, inputItemIds: ["user-2"] },
    ],
  });

  const duplicateMapped = buildCodexRawSemanticTurns(duplicate);
  assert.equal(duplicateMapped.complete, false);
  assert.deepEqual(duplicateMapped.reasonCodes, [
    "semantic_turn_sequence_duplicate",
    "semantic_item_attribution_unknown",
  ]);
  assert.deepEqual(duplicateMapped.turns[0]!.messages.map((entry) => entry.text), ["first"]);
});

test("semantic mapping fails closed on duplicate stable IDs and repeated attribution", () => {
  const duplicateStableId = view({
    items: [
      effective("duplicate", { type: "message", role: "user", content: "first" }),
      effective("duplicate", { type: "message", role: "user", content: "second" }),
    ],
    turns: [{ turnSeq: 1, inputItemIds: ["duplicate"] }],
  });
  const duplicateMapped = buildCodexRawSemanticTurns(duplicateStableId);
  assert.equal(duplicateMapped.complete, false);
  assert.deepEqual(duplicateMapped.reasonCodes, ["semantic_item_attribution_ambiguous"]);
  assert.deepEqual(duplicateMapped.turns[0]!.messages.map((entry) => entry.text), ["first"]);

  const repeatedAttribution = view({
    items: [effective("shared", { type: "message", role: "user", content: "shared" })],
    turns: [
      { turnSeq: 1, inputItemIds: ["shared"] },
      { turnSeq: 2, inputItemIds: ["shared"] },
    ],
  });
  const repeatedMapped = buildCodexRawSemanticTurns(repeatedAttribution);
  assert.equal(repeatedMapped.complete, false);
  assert.deepEqual(repeatedMapped.reasonCodes, ["semantic_item_attribution_ambiguous"]);
  assert.deepEqual(repeatedMapped.turns[0]!.messages.map((entry) => entry.text), ["shared"]);
  assert.deepEqual(repeatedMapped.turns[1]!.messages, []);
});

test("semantic mapping rejects non-string tool payloads without stringifying provider data", () => {
  const mapped = buildCodexRawSemanticTurns(view({
    items: [
      effective("call", {
        type: "function_call",
        call_id: "unsafe",
        name: "unsafe_tool",
        arguments: { secret: "argument must not leak" },
      }),
      effective("result", {
        type: "function_call_output",
        call_id: "unsafe",
        output: { secret: "result must not leak" },
      }),
    ],
    turns: [
      { turnSeq: 1, outputItemIds: ["call"] },
      { turnSeq: 2, inputItemIds: ["result"] },
    ],
  }));

  assert.equal(mapped.complete, false);
  assert.equal(mapped.reasonCodes.includes("semantic_tool_call_invalid"), true);
  assert.doesNotMatch(JSON.stringify(mapped), /argument must not leak|result must not leak/);
});

test("semantic mapping bounds summaries while retaining raw result only in fullText", () => {
  const longArguments = "a".repeat(500);
  const longResult = "r".repeat(900);
  const mapped = buildCodexRawSemanticTurns(view({
    items: [
      effective("call", {
        type: "function_call",
        call_id: "long",
        name: "long_tool",
        arguments: longArguments,
      }),
      effective("result", { type: "function_call_output", call_id: "long", output: longResult }),
    ],
    turns: [
      { turnSeq: 1, outputItemIds: ["call"] },
      { turnSeq: 2, inputItemIds: ["result"] },
    ],
  }));

  assert.equal(mapped.complete, true);
  assert.equal(mapped.turns[0]!.toolCalls[0]!.argumentsSummary.length, 403);
  assert.equal(mapped.turns[0]!.toolResults[0]!.summary.length, 803);
  assert.equal(mapped.turns[0]!.toolResults[0]!.fullText, longResult);
});
