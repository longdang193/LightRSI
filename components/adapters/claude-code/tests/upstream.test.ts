import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import test from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { normalizeTokenPilotClaudeCodeConfig } from "../src/config.js";
import { createClaudeCodeGatewayForwarder } from "../src/upstream.js";

test("Claude optional-field compatibility does not retry authentication failures", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-claude-upstream-auth-"));
  const originalFetch = globalThis.fetch;
  try {
    const forwarder = createClaudeCodeGatewayForwarder(
      normalizeTokenPilotClaudeCodeConfig({ stateDir }),
    );
    for (const status of [401, 403]) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return new Response(
          JSON.stringify({ error: { message: "Unsupported parameter: cache_control" } }),
          { status, headers: { "content-type": "application/json" } },
        );
      };

      const response = await forwarder.request({
        upstream: { baseUrl: "http://provider.test", protocol: "custom" },
        payload: { cache_control: { type: "ephemeral" } },
      });

      assert.equal(response.status, status);
      assert.equal(calls, 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("Claude optional-field capability updates merge across concurrent requests", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-claude-upstream-capability-"));
  const originalFetch = globalThis.fetch;
  const seenPayloads: Array<Record<string, unknown>> = [];
  try {
    const forwarder = createClaudeCodeGatewayForwarder(
      normalizeTokenPilotClaudeCodeConfig({ stateDir }),
    );
    globalThis.fetch = async (_input, init) => {
      const payload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      seenPayloads.push(payload);
      if ("cache_control" in payload) {
        return new Response(
          JSON.stringify({ error: { message: "Unsupported parameter: cache_control" } }),
          { status: 400 },
        );
      }
      if ("prompt_cache_key" in payload) {
        return new Response(
          JSON.stringify({ error: { message: "Unsupported parameter: prompt_cache_key" } }),
          { status: 400 },
        );
      }
      return new Response("{}", { status: 200 });
    };

    const [cacheControlResponse, promptCacheKeyResponse] = await Promise.all([
      forwarder.request({
        upstream: { baseUrl: "http://provider.test", protocol: "custom" },
        payload: { cache_control: { type: "ephemeral" } },
      }),
      forwarder.request({
        upstream: { baseUrl: "http://provider.test", protocol: "custom" },
        payload: { prompt_cache_key: "key-1" },
      }),
    ]);

    assert.equal(cacheControlResponse.status, 200);
    assert.equal(promptCacheKeyResponse.status, 200);
    assert.equal(seenPayloads.length, 4);
    const capabilityPath = join(
      stateDir,
      "upstream-capabilities",
      "anthropic-messages",
      `${encodeURIComponent("http://provider.test/v1/messages")}.json`,
    );
    const capability = JSON.parse(await readFile(capabilityPath, "utf8")) as {
      unsupportedOptionalFields: string[];
    };
    assert.deepEqual([...capability.unsupportedOptionalFields].sort(), ["cache_control", "prompt_cache_key"]);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(stateDir, { recursive: true, force: true });
  }
});
