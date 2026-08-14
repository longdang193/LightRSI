import assert from "node:assert/strict";
import test from "node:test";
import {
  inspectClaudeTaskStateEstimatorConfig,
  resolveClaudeTaskStateEstimator,
} from "../src/context-rewrite/estimator-config.js";

test("returns an estimator when enabled and fully configured via config", () => {
  const estimator = resolveClaudeTaskStateEstimator({
    config: { enabled: true, baseUrl: "https://api.example.com", apiKey: "sk-x", model: "m1" },
    env: {},
  });
  assert.ok(estimator);
  assert.equal(typeof estimator!.estimate, "function");
});

test("returns undefined when not enabled", () => {
  const estimator = resolveClaudeTaskStateEstimator({
    config: { enabled: false, baseUrl: "https://api.example.com", apiKey: "sk-x", model: "m1" },
    env: {},
  });
  assert.equal(estimator, undefined);
});

test("returns undefined when enabled but missing apiKey", () => {
  const estimator = resolveClaudeTaskStateEstimator({
    config: { enabled: true, baseUrl: "https://api.example.com", model: "m1" },
    env: {},
  });
  assert.equal(estimator, undefined);
});

test("assembles from env when config is absent", () => {
  const estimator = resolveClaudeTaskStateEstimator({
    env: {
      LIGHTMEM2_TASK_STATE_ESTIMATOR_ENABLED: "true",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_BASE_URL: "https://api.example.com",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_API_KEY: "sk-env",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_MODEL: "m-env",
    },
  });
  assert.ok(estimator);
});

test("normalized config preserves env enablement when enabled is absent", () => {
  const estimator = resolveClaudeTaskStateEstimator({
    config: {
      requestTimeoutMs: 60_000,
      batchTurns: 5,
      evictionLookaheadTurns: 3,
    },
    env: {
      LIGHTMEM2_TASK_STATE_ESTIMATOR_ENABLED: "true",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_BASE_URL: "https://api.example.com",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_API_KEY: "sk-env",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_MODEL: "m-env",
    },
  });
  assert.ok(estimator);
});

test("explicit false disables env-configured estimator", () => {
  const estimator = resolveClaudeTaskStateEstimator({
    config: { enabled: false },
    env: {
      LIGHTMEM2_TASK_STATE_ESTIMATOR_ENABLED: "true",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_BASE_URL: "https://api.example.com",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_API_KEY: "sk-env",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_MODEL: "m-env",
    },
  });
  assert.equal(estimator, undefined);
});

test("config inspection follows env fallback without exposing credentials", () => {
  const status = inspectClaudeTaskStateEstimatorConfig({
    config: {},
    env: {
      LIGHTMEM2_TASK_STATE_ESTIMATOR_ENABLED: "true",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_BASE_URL: "https://api.example.com",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_API_KEY: "sk-env",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_MODEL: "m-env",
    },
  });
  assert.deepEqual(status, { enabled: true, configured: true });
  assert.equal("apiKey" in status, false);
});

test("falls back to TOKENPILOT_ env names", () => {
  const estimator = resolveClaudeTaskStateEstimator({
    env: {
      TOKENPILOT_TASK_STATE_ESTIMATOR_ENABLED: "1",
      TOKENPILOT_TASK_STATE_ESTIMATOR_BASE_URL: "https://api.example.com",
      TOKENPILOT_TASK_STATE_ESTIMATOR_API_KEY: "sk-tp",
      TOKENPILOT_TASK_STATE_ESTIMATOR_MODEL: "m-tp",
    },
  });
  assert.ok(estimator);
});

test("explicit config wins over env", () => {
  // env disables, config enables + configures → config wins → estimator built
  const estimator = resolveClaudeTaskStateEstimator({
    config: { enabled: true, baseUrl: "https://cfg.example.com", apiKey: "sk-cfg", model: "m-cfg" },
    env: { LIGHTMEM2_TASK_STATE_ESTIMATOR_ENABLED: "false" },
  });
  assert.ok(estimator);
});

test("disabled by default when nothing is set", () => {
  const estimator = resolveClaudeTaskStateEstimator({ env: {} });
  assert.equal(estimator, undefined);
});

test("assembles an estimator from the full config superset (lookahead + modes)", () => {
  const estimator = resolveClaudeTaskStateEstimator({
    config: {
      enabled: true,
      baseUrl: "https://api.example.com",
      apiKey: "sk-x",
      model: "m1",
      requestTimeoutMs: 30_000,
      batchTurns: 8,
      evictionLookaheadTurns: 4,
      inputMode: "sliding_window",
      lifecycleMode: "decoupled",
      evidenceMode: "two_state",
    },
    env: {},
  });
  assert.ok(estimator);
  assert.equal(typeof estimator!.estimate, "function");
});

test("config estimator fields win over env fallback", () => {
  const estimator = resolveClaudeTaskStateEstimator({
    config: {
      enabled: true,
      baseUrl: "https://api.example.com",
      apiKey: "sk-x",
      model: "m1",
      evictionLookaheadTurns: 7,
    },
    env: {
      LIGHTMEM2_TASK_STATE_ESTIMATOR_EVICTION_LOOKAHEAD_TURNS: "99",
    },
  });
  // config-present wins; the estimator assembles without throwing.
  assert.ok(estimator);
  assert.equal(typeof estimator!.estimate, "function");
});
