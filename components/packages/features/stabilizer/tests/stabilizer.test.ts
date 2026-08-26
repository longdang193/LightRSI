import assert from "node:assert/strict";
import test from "node:test";

import {
  applyStablePrefixToInstructions,
  buildStabilityVisualSnapshotFromTexts,
  canonicalizeTools,
  defaultPrepareStablePrefix,
  fingerprintStablePrefixEnvelope,
  rewriteTextForStablePrefix,
  type StabilizerRequestEnvelope,
} from "../src/index.js";

function envelope(userText: string): StabilizerRequestEnvelope & { transport: string } {
  return {
    session: { host: { hostId: "test-host" } },
    model: "test-model",
    instructions: "Runtime: agent=agent-123 | session_id=session-456\nCurrent date: 2026-07-21",
    messages: [{ role: "user", content: userText }],
    tools: [],
    transport: "responses",
  };
}

test("canonicalizeTools stabilizes tool order and nested object keys", () => {
  const tools = canonicalizeTools([
    { type: "function", function: { parameters: { z: 1, a: 2 }, name: "zeta" } },
    { type: "function", function: { name: "alpha", parameters: { b: 1, a: 2 } } },
  ]);

  assert.equal((tools?.[0] as any).function.name, "alpha");
  assert.deepEqual(Object.keys((tools?.[0] as any).function.parameters), ["a", "b"]);
});

test("stable prefix rewrite preserves ordinary business text", () => {
  const source = "Invoice 2026-07-21 covers order 123456789012 for customer request planning.";
  const rewritten = rewriteTextForStablePrefix(source);

  assert.equal(rewritten.forwardedText, source);
  assert.equal(rewritten.dynamicContextText, "");
});

test("stable prefix preparation preserves host-specific envelope fields", () => {
  const input = envelope("Review the repository");
  const prepared = applyStablePrefixToInstructions({ envelope: input });

  assert.equal(prepared.transport, "responses");
  assert.equal(prepared.instructions, "Runtime: agent=agent-123");
  assert.match(String(prepared.messages[0].content), /Current date: 2026-07-21/);
});

test("default stable prefix preparation preserves user payload bytes", () => {
  const userText = " [request-123] \r\n- CURRENT_DATE: 2026-08-26\r\nSender (untrusted metadata): ```json\n{\"x\":1}\n```\r\nKeep exact.";
  const input: StabilizerRequestEnvelope = {
    session: { host: { hostId: "test-host" } },
    model: "test-model",
    instructions: "Stable instructions",
    messages: [{ role: "user", content: userText }],
    tools: [],
  };

  const prepared = defaultPrepareStablePrefix(input);

  assert.equal(prepared.messages[0]?.content, userText);
});

test("default stable prefix preparation preserves adversarial user payloads and envelope identity", () => {
  const payloads = [
    "[IMPORTANT] preserve this marker",
    "---\nUSER: keep this uppercase YAML-like text\n---",
    "---\ntitle: user document\n---\nBody stays exact.",
    '{"session_id":"user-owned","value":"keep exact"}',
    "```json\n{\"request_id\":\"user-owned\"}\n```",
    "UUID 123e4567-e89b-12d3-a456-426614174000 and timestamp 2026-08-26T12:34:56Z",
    "C:\\Users\\user\\repo\\file.txt and /tmp/user/file.txt",
    "  leading and trailing whitespace  \r\n\r\nkeep blank lines\r\n",
    "Sender (untrusted metadata): ```json\n{\"agent\":\"user-owned\"}\n```\r\nKeep exact.",
  ];

  for (const userText of payloads) {
    const input = envelope(userText);
    input.instructions = "Stable instructions";
    const prepared = defaultPrepareStablePrefix(input);

    assert.equal(prepared, input);
    assert.equal(prepared.messages[0]?.content, userText);
  }
});

test("default stable prefix preparation preserves structured user content while injecting context additively", () => {
  const content: Array<{ type: "text"; text: string } | { type: "image"; imageUrl: string }> = [
    { type: "text", text: "[IMPORTANT] keep exact\r\n---\nvalue: user-owned" },
    { type: "image", imageUrl: "https://example.com/user-owned.png" },
  ];
  const input: StabilizerRequestEnvelope = {
    session: { host: { hostId: "test-host" } },
    model: "test-model",
    instructions: "Your working directory is: C:\\repo\\project\nRuntime: agent=agent-123 | session_id=session-456",
    messages: [{ role: "user", content }],
    tools: [],
  };

  const prepared = defaultPrepareStablePrefix(input);

  assert.notEqual(prepared, input);
  assert.deepEqual(input.messages[0]?.content, content);
  assert.deepEqual(prepared.messages[0]?.content, [
    { type: "input_text", text: "- WORKDIR: C:\\repo\\project\n- AGENT_ID: agent-123\nsession_id=session-456" },
    ...content,
  ]);
});

test("stable prefix fingerprint excludes volatile user tail", () => {
  const first = envelope("first request");
  const second = envelope("second request");

  assert.equal(fingerprintStablePrefixEnvelope(first), fingerprintStablePrefixEnvelope(second));
});

test("stability visual builder derives canonical prompt and user rewrite count", () => {
  const snapshot = buildStabilityVisualSnapshotFromTexts({
    at: "2026-06-29T13:00:00.000Z",
    sessionId: "session-2",
    model: "gpt-5.4-mini",
    upstreamModel: "gpt-5.4-mini",
    promptCacheKeyBefore: "",
    promptCacheKeyAfter: "pk-2",
    dynamicContextTarget: "user",
    developerBefore: "Your working directory is: /repo/demo\nRuntime: agent=agent-1 |\nBe precise.",
    developerForwarded: "Your working directory is: <WORKDIR>\nRuntime: agent=<AGENT_ID> |\nBe precise.",
    userBefore: "hello",
    userForwarded: "- WORKDIR: /repo/demo\n- AGENT_ID: agent-1\n\nhello",
    firstTurnCandidate: true,
  });

  assert.match(snapshot.developerCanonical, /<WORKDIR>/);
  assert.match(snapshot.dynamicContextText ?? "", /WORKDIR: \/repo\/demo/);
  assert.equal(snapshot.userContentRewrites, 1);
});
