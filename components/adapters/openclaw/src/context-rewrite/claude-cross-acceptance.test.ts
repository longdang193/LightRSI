import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  reserveUnusedPort,
  type HostGatewayForwarder,
} from "@lightmem2/host-adapter";

import { normalizeTokenPilotClaudeCodeConfig } from "../../../claude-code/src/config.js";
import { startClaudeCodeGatewayRuntime } from "../../../claude-code/src/gateway-runtime.js";
import { createConsoleLogger } from "../../../claude-code/src/logger.js";
import {
  createAcceptanceSentinels,
  createTemporaryAcceptanceEnvironment,
  inspectToolClosure,
  MockUpstreamRecorder,
  runRestartAcceptanceScenario,
  type AcceptanceHostRuntime,
  type AcceptanceSentinels,
} from "./acceptance-harness.js";

const TEST_UUID = "123e4567-e89b-42d3-a456-426614174000";

function createClaudeForwarder(upstreamUrl: string): HostGatewayForwarder {
  return {
    async request({ payload }) {
      const response = await fetch(`${upstreamUrl}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        text: await response.text(),
      };
    },
    async requestStream() {
      throw new Error("Claude GUA-06 acceptance uses the non-streaming path");
    },
  };
}

function createClaudeAcceptancePayload(sentinels: AcceptanceSentinels): Record<string, unknown> {
  return {
    model: "claude-sonnet-4-6",
    stream: false,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "read the synthetic fixture" }],
      },
      {
        role: "assistant",
        content: [{
          type: "tool_use",
          id: "toolu_gua06_1",
          name: "Read",
          input: { file_path: "/synthetic/fixture.txt" },
        }],
      },
      {
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: "toolu_gua06_1",
          content: `${sentinels.evict}\n${"x".repeat(5_000)}`,
        }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "synthetic task complete" }],
      },
      {
        role: "user",
        content: [{ type: "text", text: sentinels.keep }],
      },
    ],
    max_tokens: 256,
  };
}

test("GUA-06 independently accepts Claude eviction across five requests and a restart", async () => {
  const sentinels = createAcceptanceSentinels(TEST_UUID);
  const summary = await runRestartAcceptanceScenario({
    sentinels,
    async startHost(context): Promise<AcceptanceHostRuntime> {
      const runtime = await startClaudeCodeGatewayRuntime({
        config: normalizeTokenPilotClaudeCodeConfig({
          stateDir: context.stateDir,
          proxyPort: await reserveUnusedPort(),
          modules: { stabilizer: false, reduction: false, eviction: true },
          eviction: { enabled: true, minBlockChars: 256 },
        }),
        logger: createConsoleLogger(false),
        forwarder: createClaudeForwarder(context.upstreamUrl),
      });
      return {
        async sendAcceptanceTurn({ phase, sentinels: phaseSentinels }) {
          const payload = createClaudeAcceptancePayload(phaseSentinels);
          const requestCount = phase === "before_restart" ? 3 : 2;
          for (let attempt = 0; attempt < requestCount; attempt += 1) {
            const response = await fetch(`${runtime.baseUrl}/v1/messages`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-session-id": "sess-gua06-claude",
              },
              body: JSON.stringify(payload),
            });
            assert.equal(response.status, 200);
            await response.text();
          }
          return payload;
        },
        close: () => runtime.close(),
      };
    },
  });

  assert.equal(summary.passed, true);
  assert.equal(summary.requestCount, 5);
  assert.deepEqual(
    summary.phases.map((phase) => phase.requestCount),
    [3, 2],
  );
  assert.equal(summary.phases.every((phase) => phase.keepFound), true);
  assert.equal(summary.phases.every((phase) => !phase.evictFound), true);
  assert.equal(summary.phases.every((phase) => phase.toolClosure.complete), true);
  assert.ok(summary.savedCharacters > 0);
});

test("GUA-06 independently accepts Claude rewrite failure bypass", async () => {
  const environment = createTemporaryAcceptanceEnvironment("lightmem2-gua06-claude-bypass-");
  const upstream = new MockUpstreamRecorder();
  const sentinels = createAcceptanceSentinels(TEST_UUID);
  const payload = createClaudeAcceptancePayload(sentinels);
  let runtime: Awaited<ReturnType<typeof startClaudeCodeGatewayRuntime>> | undefined;
  const originalStructuredClone = globalThis.structuredClone;

  try {
    await upstream.start();
    runtime = await startClaudeCodeGatewayRuntime({
      config: normalizeTokenPilotClaudeCodeConfig({
        stateDir: environment.stateDir,
        proxyPort: await reserveUnusedPort(),
        modules: { stabilizer: false, reduction: false, eviction: true },
        eviction: { enabled: true, minBlockChars: 256 },
      }),
      logger: createConsoleLogger(false),
      forwarder: createClaudeForwarder(upstream.url),
    });

    globalThis.structuredClone = (() => {
      throw new Error("synthetic GUA-06 rewrite failure");
    }) as typeof structuredClone;

    const response = await fetch(`${runtime.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-id": "sess-gua06-claude-bypass",
      },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 200);
    await response.text();

    const requests = upstream.requests();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].rawBody.includes(sentinels.evict), true);
    assert.equal(requests[0].rawBody.includes(sentinels.keep), true);
    assert.equal(requests[0].rawBody.includes("[evicted:"), false);
    assert.equal(inspectToolClosure(requests[0].body).complete, true);

    const trace = fs.readFileSync(
      path.join(environment.stateDir, "event-trace.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const beforeCall = trace.find((entry) => entry.stage === "gateway_before_call");
    assert.equal(beforeCall?.evictionApplied, false);
    assert.equal(beforeCall?.evictionBypassReason, "analysis_or_apply_error");
  } finally {
    globalThis.structuredClone = originalStructuredClone;
    await runtime?.close();
    await upstream.close();
    environment.cleanup();
  }
});
