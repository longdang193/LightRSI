import assert from "node:assert/strict";
import test from "node:test";

import { startMockCachingJsonUpstream } from "../src/testing/host-e2e.js";
import {
  defaultInjectRecoveryProtocol,
} from "../src/pipeline/recovery.js";
import { extractRecoveryReference } from "../src/testing/host-e2e.js";
import {
  MINIMAL_HOST_CAPABILITIES,
  REQUEST_RESPONSE_HOST_CAPABILITIES,
  canSupportLifecycleEvictionEquivalently,
  canSupportReductionCore,
  canSupportStablePrefix,
  canSupportToolCallMemo,
} from "../src/contracts/capabilities.js";

test("minimal host capabilities disable advanced runtime assumptions by default", () => {
  assert.equal(canSupportStablePrefix(MINIMAL_HOST_CAPABILITIES), false);
  assert.equal(canSupportReductionCore(MINIMAL_HOST_CAPABILITIES), false);
  assert.equal(canSupportLifecycleEvictionEquivalently(MINIMAL_HOST_CAPABILITIES), false);
  assert.equal(canSupportToolCallMemo(MINIMAL_HOST_CAPABILITIES), false);
});

test("request-response capability preset supports stable prefix and reduction core only", () => {
  assert.equal(canSupportStablePrefix(REQUEST_RESPONSE_HOST_CAPABILITIES), true);
  assert.equal(canSupportReductionCore(REQUEST_RESPONSE_HOST_CAPABILITIES), true);
  assert.equal(canSupportLifecycleEvictionEquivalently(REQUEST_RESPONSE_HOST_CAPABILITIES), false);
  assert.equal(canSupportToolCallMemo(REQUEST_RESPONSE_HOST_CAPABILITIES), false);
});

test("mock cache oracle hashes exact cacheable prefix bytes", async () => {
  const upstream = await startMockCachingJsonUpstream();
  try {
    const send = (text: string) => fetch(`${upstream.baseUrl}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt_cache_key: "same-key",
        input: [
          { role: "developer", content: text },
          { role: "user", content: "hello" },
        ],
      }),
    });
    await send("AAAA");
    await send("BBBB");
    await send("AAAA");

    assert.equal(upstream.requestUsages[0]?.cache_read_input_tokens, 0);
    assert.equal(upstream.requestUsages[1]?.cache_read_input_tokens, 0);
    assert.ok(Number(upstream.requestUsages[2]?.cache_read_input_tokens ?? 0) > 0);
  } finally {
    await upstream.close();
  }
});

test("recovery protocol accepts opaque refs and bounded line windows without paths", () => {
  const envelope = defaultInjectRecoveryProtocol({
    session: {
      host: { hostId: "test", displayName: "test" },
      sessionId: "private-session",
      sessionMode: "single",
    },
    model: "test-model",
    stream: false,
    messages: [],
    rawPayload: {},
  });
  const protocol = envelope.instructions ?? "";
  assert.match(protocol, /opaque artifactRef/);
  assert.match(protocol, /legacy dataKey/);
  assert.match(protocol, /1-based inclusive/);
  assert.doesNotMatch(protocol, /archivePath|stateDir|sessionId/);

  const reference = extractRecoveryReference(
    'call memory_fault_recover with {"artifactRef":"artifact:v2:' + "a".repeat(64) + '","startLine":2,"endLine":4}',
  );
  assert.deepEqual(reference, {
    artifactRef: `artifact:v2:${"a".repeat(64)}`,
    startLine: 2,
    endLine: 4,
  });
});
