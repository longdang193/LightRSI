import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createDshTaskStateEstimator,
  isEstimatorConfigured,
  runTaskStateEstimate,
  toEstimatorApiConfig,
} from "../src/lifecycle-estimator.js";
import { normalizeDshConfig } from "../src/config.js";
import type { TaskStateEstimator, TaskStateEstimatorInput, TaskStateEstimatorOutput } from "@lightrsi/eviction";

const CONFIGURED = normalizeDshConfig({
  enabled: true,
  taskStateEstimator: {
    enabled: true,
    baseUrl: "https://api.example.com",
    apiKey: "sk-x",
    model: "m",
    batchTurns: 8,
    evictionLookaheadTurns: 4,
    inputMode: "completed_summary_plus_active_turns",
    lifecycleMode: "decoupled",
    evidenceMode: "two_state",
  },
}).taskStateEstimator;

describe("isEstimatorConfigured", () => {
  it("requires baseUrl + apiKey + model", () => {
    assert.equal(isEstimatorConfigured(CONFIGURED), true);
    assert.equal(isEstimatorConfigured({ ...CONFIGURED, apiKey: undefined }), false);
    assert.equal(isEstimatorConfigured({ ...CONFIGURED, baseUrl: undefined }), false);
  });
});

describe("toEstimatorApiConfig", () => {
  it("maps DSH config fields onto the shared estimator config", () => {
    const api = toEstimatorApiConfig(CONFIGURED);
    assert.equal(api.baseUrl, "https://api.example.com");
    assert.equal(api.model, "m");
    assert.equal(api.batchTurns, 8);
    assert.equal(api.evictionLookaheadTurns, 4);
    assert.equal(api.inputMode, "completed_summary_plus_active_turns");
    assert.equal(api.lifecycleMode, "decoupled");
    assert.equal(api.evidenceMode, "two_state");
  });
});

describe("createDshTaskStateEstimator", () => {
  it("returns undefined when disabled", () => {
    assert.equal(createDshTaskStateEstimator({ ...CONFIGURED, enabled: false }), undefined);
  });
  it("returns undefined when unconfigured", () => {
    assert.equal(createDshTaskStateEstimator({ ...CONFIGURED, apiKey: undefined }), undefined);
  });
  it("returns an estimator with an estimate() method when configured", () => {
    const est = createDshTaskStateEstimator(CONFIGURED);
    assert.ok(est);
    assert.equal(typeof est.estimate, "function");
  });
});

describe("runTaskStateEstimate", () => {
  it("passes the input through and returns the estimator output", async () => {
    const captured: TaskStateEstimatorInput[] = [];
    const output: TaskStateEstimatorOutput = { baseVersion: 0, taskUpdates: [] };
    const mock: TaskStateEstimator = {
      estimate(input) { captured.push(input); return output; },
    };
    const input = { registry: { sessionId: "s", version: 0 } as never, delta: {} as never };
    const result = await runTaskStateEstimate(mock, input);
    assert.equal(result, output);
    assert.equal(captured.length, 1);
    assert.equal(captured[0], input);
  });
});
