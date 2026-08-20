import assert from "node:assert/strict";
import test from "node:test";

import { computeEncodedProviderWirePrefixDiagnostics } from "../src/proxy-runtime.js";

test("provider wire prefix diagnostics isolate volatile item fields without values", () => {
  const first = computeEncodedProviderWirePrefixDiagnostics({
    instructions: "stable instructions",
    tools: [{ type: "function", name: "read_file" }],
    input: [
      {
        type: "message",
        role: "system",
        metadata: { session_id: "session-a" },
        content: "stable policy",
      },
      { type: "message", role: "user", content: "task" },
    ],
  });
  const second = computeEncodedProviderWirePrefixDiagnostics({
    instructions: "stable instructions",
    tools: [{ type: "function", name: "read_file" }],
    input: [
      {
        type: "message",
        role: "system",
        metadata: { session_id: "session-b" },
        content: "stable policy",
      },
      { type: "message", role: "user", content: "task" },
    ],
  });

  assert.equal(first.instructionsHash, second.instructionsHash);
  assert.equal(first.toolsHash, second.toolsHash);
  assert.notEqual(first.inputHash, second.inputHash);
  assert.notEqual(
    first.inputItems[0]?.fieldFingerprints.metadata,
    second.inputItems[0]?.fieldFingerprints.metadata,
  );
  assert.doesNotMatch(JSON.stringify(first), /session-a|stable policy/);
});

test("provider wire prefix identity ignores generated message ids", () => {
  const first = computeEncodedProviderWirePrefixDiagnostics({
    instructions: "stable instructions",
    tools: [{ type: "function", name: "read_file" }],
    input: [
      { id: "msg_generated_a", type: "message", role: "developer", content: "stable policy" },
      { type: "message", role: "user", content: "task" },
    ],
  });
  const second = computeEncodedProviderWirePrefixDiagnostics({
    instructions: "stable instructions",
    tools: [{ type: "function", name: "read_file" }],
    input: [
      { id: "msg_generated_b", type: "message", role: "developer", content: "stable policy" },
      { type: "message", role: "user", content: "task" },
    ],
  });

  assert.equal(first.inputHash, second.inputHash);
  assert.equal(first.fullHash, second.fullHash);
});
