import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTEXT_ITEM_ID_ALGORITHM_VERSION,
  createContextItemFingerprint,
  createContextItemIdentity,
  createStableContextItemId,
  normalizeContextItemContent,
} from "../src/index.js";

test("context item ID algorithm version is locked to 1", () => {
  assert.equal(CONTEXT_ITEM_ID_ALGORITHM_VERSION, 1);
});

test("native item ID takes priority over call ID and mutable content", () => {
  const first = createContextItemIdentity({
    sessionId: "session-1",
    kind: "assistant",
    nativeItemId: "item-1",
    callId: "call-1",
    content: { text: "before" },
    ordinal: 0,
  });
  const replayed = createContextItemIdentity({
    sessionId: "session-1",
    kind: "assistant",
    nativeItemId: "item-1",
    callId: "call-changed",
    content: { text: "after" },
    ordinal: 99,
  });

  assert.equal(first.source, "native_item_id");
  assert.equal(first.stableId, replayed.stableId);
  assert.notEqual(first.fingerprint, replayed.fingerprint);
});

test("call ID is the stable fallback when no native item ID exists", () => {
  const first = createContextItemIdentity({
    sessionId: "session-1",
    kind: "tool_result",
    callId: "call-1",
    content: { output: "before" },
    ordinal: 2,
  });
  const replayed = createContextItemIdentity({
    sessionId: "session-1",
    kind: "tool_result",
    callId: "call-1",
    content: { output: "after" },
    ordinal: 20,
  });

  assert.equal(first.source, "call_id");
  assert.equal(first.stableId, replayed.stableId);
  assert.notEqual(first.fingerprint, replayed.fingerprint);
});

test("synthetic IDs are deterministic across object key order", () => {
  const first = createContextItemIdentity({
    sessionId: "session-1",
    kind: "user",
    role: "user",
    content: { text: "hello", metadata: { a: 1, b: 2 } },
    ordinal: 3,
  });
  const replayed = createContextItemIdentity({
    sessionId: "session-1",
    kind: "user",
    role: "user",
    content: { metadata: { b: 2, a: 1 }, text: "hello" },
    ordinal: 3,
  });

  assert.equal(first.source, "synthetic");
  assert.deepEqual(first, replayed);
  assert.equal(
    createStableContextItemId({
      sessionId: "session-1",
      kind: "user",
      role: "user",
      content: { text: "hello", metadata: { a: 1, b: 2 } },
      ordinal: 3,
    }),
    first.stableId,
  );
});

test("content changes the fingerprint and synthetic stable ID", () => {
  const first = createContextItemIdentity({
    sessionId: "session-1",
    kind: "user",
    content: "first",
    ordinal: 0,
  });
  const changed = createContextItemIdentity({
    sessionId: "session-1",
    kind: "user",
    content: "second",
    ordinal: 0,
  });

  assert.notEqual(first.fingerprint, changed.fingerprint);
  assert.notEqual(first.stableId, changed.stableId);
});

test("ordinal changes only the synthetic stable ID", () => {
  const input = {
    sessionId: "session-1",
    kind: "assistant",
    content: { text: "same content" },
  };
  const first = createContextItemIdentity({ ...input, ordinal: 0 });
  const second = createContextItemIdentity({ ...input, ordinal: 1 });

  assert.equal(first.fingerprint, second.fingerprint);
  assert.notEqual(first.stableId, second.stableId);
});

test("Claude full-message replay keeps the same synthetic identity", () => {
  const first = createContextItemIdentity({
    sessionId: "claude-session",
    kind: "user",
    role: "user",
    content: [
      { type: "text", text: "summarize" },
      { type: "tool_result", tool_use_id: "tool-1", content: "result" },
    ],
    ordinal: 4,
  });
  const replayed = createContextItemIdentity({
    sessionId: "claude-session",
    kind: "user",
    role: "user",
    content: [
      { text: "summarize", type: "text" },
      { content: "result", tool_use_id: "tool-1", type: "tool_result" },
    ],
    ordinal: 4,
  });

  assert.deepEqual(first, replayed);
});

test("Codex journal replay keeps native state-event identity", () => {
  const first = createContextItemIdentity({
    sessionId: "codex-session",
    kind: "assistant",
    role: "assistant",
    nativeItemId: "item-message-1",
    content: { type: "message", content: [{ type: "output_text", text: "done" }] },
    ordinal: 5,
  });
  const replayed = createContextItemIdentity({
    sessionId: "codex-session",
    kind: "assistant",
    role: "assistant",
    nativeItemId: "item-message-1",
    content: { content: [{ text: "done", type: "output_text" }], type: "message" },
    ordinal: 5,
  });

  assert.equal(first.source, "native_item_id");
  assert.deepEqual(first, replayed);
});

test("normalization rejects non-JSON and cyclic content", () => {
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;

  assert.throws(
    () => normalizeContextItemContent({ missing: undefined }),
    /JSON-compatible/,
  );
  assert.throws(
    () => normalizeContextItemContent({ value: Number.POSITIVE_INFINITY }),
    /finite numbers/,
  );
  assert.throws(
    () => normalizeContextItemContent(cyclic),
    /must not contain cycles/,
  );
});

test("synthetic identity rejects an invalid ordinal", () => {
  assert.throws(
    () => createContextItemIdentity({
      sessionId: "session-1",
      kind: "user",
      content: "hello",
      ordinal: -1,
    }),
    /non-negative safe integer/,
  );
});

test("fingerprints are independent of session and ordinal", () => {
  const fingerprint = createContextItemFingerprint({
    kind: "user",
    role: "user",
    content: { text: "hello" },
  });
  const identity = createContextItemIdentity({
    sessionId: "another-session",
    kind: "user",
    role: "user",
    content: { text: "hello" },
    ordinal: 42,
  });

  assert.equal(identity.fingerprint, fingerprint);
});
