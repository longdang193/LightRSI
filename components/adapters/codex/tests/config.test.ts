import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  codexProxyBaseUrl,
  loadTokenPilotCodexConfig,
  normalizeTokenPilotCodexConfig,
} from "../src/config.js";

test("normalizeTokenPilotCodexConfig applies stable defaults", () => {
  const config = normalizeTokenPilotCodexConfig({});
  assert.equal(config.enabled, true);
  assert.equal(config.logLevel, "info");
  assert.equal(config.proxyPort, 17667);
  assert.equal(config.upstreamProvider, "OpenAI");
  assert.match(config.stateDir.replace(/\\/g, "/"), /\.codex\/tokenpilot-state\/tokenpilot$/);
  assert.equal(config.contextRewrite.enabled, false);
  assert.equal(config.contextRewrite.mode, "response_chain_rebase");
  assert.equal(config.contextRewrite.failureMode, "bypass");
  assert.equal(config.contextRewrite.retryOriginalRequest, true);
  assert.equal(config.contextRewrite.cooldownMs, 300_000);
  assert.equal(config.taskStateEstimator.enabled, undefined);
  assert.equal(config.taskStateEstimator.baseUrl, undefined);
  assert.equal(config.taskStateEstimator.requestTimeoutMs, undefined);
  assert.equal(config.taskStateEstimator.inputMode, undefined);
});
test("codexProxyBaseUrl uses canonical loopback port", () => {
  assert.equal(codexProxyBaseUrl({ proxyPort: 17667 }), "http://127.0.0.1:17667/v1");
});
test("normalizeTokenPilotCodexConfig derives default stateDir from the tokenpilot config path", () => {
  const config = normalizeTokenPilotCodexConfig({}, {
    configPath: "/tmp/custom-codex-root/tokenpilot.json",
  });
  assert.equal(config.stateDir, join("/tmp/custom-codex-root", "tokenpilot-state", "tokenpilot"));
});

test("normalizeTokenPilotCodexConfig trims and clamps values", () => {
  const config = normalizeTokenPilotCodexConfig({
    logLevel: "debug",
    proxyPort: 999999,
    upstreamProvider: "  OPENAI  ",
  });
  assert.equal(config.logLevel, "debug");
  assert.equal(config.proxyPort, 65535);
  assert.equal(config.upstreamProvider, "OPENAI");
});

test("normalizeTokenPilotCodexConfig normalizes estimator config", () => {
  const config = normalizeTokenPilotCodexConfig({
    taskStateEstimator: {
      enabled: true,
      baseUrl: "  https://estimator.example/v1///  ",
      apiKey: "  secret-value  ",
      model: "  estimator-model  ",
      requestTimeoutMs: 999_999,
      batchTurns: 0,
      evictionLookaheadTurns: 9.8,
      inputMode: "completed_summary_plus_active_turns",
      lifecycleMode: "decoupled",
      evidenceMode: "two_state",
    },
  });

  assert.deepEqual(config.taskStateEstimator, {
    enabled: true,
    baseUrl: "https://estimator.example/v1",
    apiKey: "secret-value",
    model: "estimator-model",
    requestTimeoutMs: 300_000,
    batchTurns: 1,
    evictionLookaheadTurns: 9,
    inputMode: "completed_summary_plus_active_turns",
    lifecycleMode: "decoupled",
    evidenceMode: "two_state",
  });
});

test("normalizeTokenPilotCodexConfig falls back from invalid estimator enums", () => {
  const config = normalizeTokenPilotCodexConfig({
    taskStateEstimator: {
      inputMode: "invalid",
      lifecycleMode: "invalid",
      evidenceMode: "invalid",
    },
  });

  assert.equal(config.taskStateEstimator.inputMode, "sliding_window");
  assert.equal(config.taskStateEstimator.lifecycleMode, "coupled");
  assert.equal(config.taskStateEstimator.evidenceMode, "three_state");
});

test("normalizeTokenPilotCodexConfig preserves context rewrite plan revisions", () => {
  const config = normalizeTokenPilotCodexConfig({
    contextRewrite: {
      providerCompatibilityProbe: "mock_fixture",
      mutationPlan: {
        baseRevision: "rev-base",
        operations: [{ type: "evict", stableItemId: "item-1" }],
      },
    },
  });

  assert.equal(config.contextRewrite.mutationPlan?.baseRevision, "rev-base");
  assert.equal(config.contextRewrite.providerCompatibilityProbe, "mock_fixture");
  assert.deepEqual(config.contextRewrite.mutationPlan?.operations, [
    { type: "evict", stableItemId: "item-1" },
  ]);
});

test("normalizeTokenPilotCodexConfig enables real-provider compatibility learning by default", () => {
  assert.equal(
    normalizeTokenPilotCodexConfig({}).contextRewrite.providerCompatibilityProbe,
    "real_provider",
  );
});

test("loadTokenPilotCodexConfig rejects concatenated tokenpilot env assignments", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightrsi-config-malformed-env-"));
  const configPath = join(dir, "tokenpilot.json");
  const envName = "LIGHTRSI_TASK_STATE_ESTIMATOR_MODEL";
  const savedEnv = process.env[envName];
  try {
    delete process.env[envName];
    await writeFile(configPath, "{}\n", "utf8");
    await writeFile(
      join(dir, "tokenpilot.env"),
      "LIGHTRSI_TASK_STATE_ESTIMATOR_MODEL=combo-highOPENAI_API_KEY=custom-key\n",
      "utf8",
    );
    await assert.rejects(
      loadTokenPilotCodexConfig(configPath),
      /malformed env assignment.*LIGHTRSI_TASK_STATE_ESTIMATOR_MODEL/,
    );
  } finally {
    if (savedEnv === undefined) delete process.env[envName];
    else process.env[envName] = savedEnv;
    await rm(dir, { recursive: true, force: true });
  }
});
