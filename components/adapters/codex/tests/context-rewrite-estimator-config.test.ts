import assert from "node:assert/strict";
import test from "node:test";
import type { TaskStateEstimator } from "@lightrsi/eviction";
import {
  codexEstimatorDiagnostic,
  codexEstimatorStatusView,
  resolveCodexTaskStateEstimator,
} from "../src/index.js";
import { normalizeTokenPilotCodexConfig } from "../src/config.js";

const fakeEstimator: TaskStateEstimator = {
  estimate() {
    throw new Error("not called by config tests");
  },
};

test("resolveCodexTaskStateEstimator defaults to disabled", () => {
  const resolution = resolveCodexTaskStateEstimator({ env: {} });

  assert.equal(resolution.status, "disabled");
  assert.equal(resolution.estimator, undefined);
  assert.deepEqual(resolution.missingFields, []);
});

test("resolveCodexTaskStateEstimator prefers explicit config over environment", () => {
  let createdWith: unknown;
  const resolution = resolveCodexTaskStateEstimator({
    config: {
      enabled: true,
      baseUrl: "https://explicit.example/v1/",
      apiKey: "explicit-secret",
      model: "explicit-model",
      requestTimeoutMs: 2_000,
      batchTurns: 2,
      evictionLookaheadTurns: 4,
    },
    env: {
      LIGHTMEM2_TASK_STATE_ESTIMATOR_BASE_URL: "https://env.example/v1",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_API_KEY: "env-secret",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_MODEL: "env-model",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_BATCH_TURNS: "99",
    },
    createEstimator(config) {
      createdWith = config;
      return fakeEstimator;
    },
  });

  assert.equal(resolution.status, "ready");
  assert.equal(resolution.config.baseUrl, "https://explicit.example/v1");
  assert.equal(resolution.config.apiKey, "explicit-secret");
  assert.equal(resolution.config.model, "explicit-model");
  assert.equal(resolution.config.batchTurns, 2);
  assert.equal(createdWith, resolution.config);
});

test("resolveCodexTaskStateEstimator keeps explicit disable above environment enable", () => {
  const resolution = resolveCodexTaskStateEstimator({
    config: { enabled: false },
    env: {
      LIGHTMEM2_TASK_STATE_ESTIMATOR_ENABLED: "true",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_BASE_URL: "https://env.example/v1",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_API_KEY: "env-secret",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_MODEL: "env-model",
    },
  });

  assert.equal(resolution.status, "disabled");
  assert.equal(resolution.estimator, undefined);
});

test("resolveCodexTaskStateEstimator supports LIGHTMEM2 and TOKENPILOT fallback", () => {
  const resolution = resolveCodexTaskStateEstimator({
    env: {
      LIGHTMEM2_TASK_STATE_ESTIMATOR_ENABLED: "true",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_BASE_URL: "https://lightmem.example/v1/",
      TOKENPILOT_TASK_STATE_ESTIMATOR_BASE_URL: "https://tokenpilot.example/v1",
      TOKENPILOT_TASK_STATE_ESTIMATOR_API_KEY: "tokenpilot-secret",
      TOKENPILOT_TASK_STATE_ESTIMATOR_MODEL: "tokenpilot-model",
      TOKENPILOT_TASK_STATE_ESTIMATOR_TIMEOUT_MS: "8000",
      TOKENPILOT_TASK_STATE_ESTIMATOR_INPUT_MODE: "completed_summary_plus_active_turns",
      TOKENPILOT_TASK_STATE_ESTIMATOR_LIFECYCLE_MODE: "decoupled",
      TOKENPILOT_TASK_STATE_ESTIMATOR_EVIDENCE_MODE: "two_state",
    },
    createEstimator: () => fakeEstimator,
  });

  assert.equal(resolution.status, "ready");
  assert.equal(resolution.config.baseUrl, "https://lightmem.example/v1");
  assert.equal(resolution.config.apiKey, "tokenpilot-secret");
  assert.equal(resolution.config.model, "tokenpilot-model");
  assert.equal(resolution.config.requestTimeoutMs, 8_000);
  assert.equal(resolution.config.inputMode, "completed_summary_plus_active_turns");
  assert.equal(resolution.config.lifecycleMode, "decoupled");
  assert.equal(resolution.config.evidenceMode, "two_state");
});

test("resolveCodexTaskStateEstimator honors environment enablement after config normalization", () => {
  const normalized = normalizeTokenPilotCodexConfig({});
  const resolution = resolveCodexTaskStateEstimator({
    config: normalized.taskStateEstimator,
    env: {
      LIGHTMEM2_TASK_STATE_ESTIMATOR_ENABLED: "true",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_BASE_URL: "https://normalized.example/v1",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_API_KEY: "normalized-secret",
      LIGHTMEM2_TASK_STATE_ESTIMATOR_MODEL: "normalized-model",
    },
    createEstimator: () => fakeEstimator,
  });

  assert.equal(normalized.taskStateEstimator.enabled, undefined);
  assert.equal(resolution.status, "ready");
  assert.equal(resolution.config.enabled, true);
  assert.equal(resolution.estimator, fakeEstimator);
});

test("resolveCodexTaskStateEstimator returns incomplete without constructing", () => {
  let constructed = false;
  const resolution = resolveCodexTaskStateEstimator({
    config: {
      enabled: true,
      baseUrl: "https://estimator.example/v1",
    },
    env: {},
    createEstimator: () => {
      constructed = true;
      return fakeEstimator;
    },
  });

  assert.equal(resolution.status, "incomplete");
  assert.deepEqual(resolution.missingFields, ["apiKey", "model"]);
  assert.equal(constructed, false);
});

test("resolveCodexTaskStateEstimator converts constructor errors to a safe reason", () => {
  const resolution = resolveCodexTaskStateEstimator({
    config: {
      enabled: true,
      baseUrl: "https://estimator.example/v1",
      apiKey: "secret-never-report",
      model: "estimator-model",
    },
    env: {},
    createEstimator: () => {
      throw new Error("Authorization: Bearer secret-never-report");
    },
  });

  assert.equal(resolution.status, "incomplete");
  assert.equal(resolution.reasonCode, "estimator_construction_failed");
  assert.doesNotMatch(JSON.stringify(codexEstimatorDiagnostic(resolution)), /secret-never-report|Authorization/i);
  assert.deepEqual(Object.keys(codexEstimatorStatusView(resolution)).sort(), [
    "apiKeyConfigured",
    "baseUrlConfigured",
    "batchTurns",
    "evictionLookaheadTurns",
    "model",
    "requestTimeoutMs",
    "status",
  ]);
});
