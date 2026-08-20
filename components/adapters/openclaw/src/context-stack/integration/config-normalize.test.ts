import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { normalizeConfig } from "./config-normalize.js";

function withEnv(values: Record<string, string | undefined>, run: () => void): void {
  const original = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("normalizeConfig derives one effective module enablement snapshot", () => {
  const cfg = normalizeConfig({
    modules: {
      stabilizer: false,
      reduction: true,
      eviction: true,
    },
    eviction: {
      enabled: true,
    },
  });

  assert.deepEqual(cfg.moduleEnablement, {
    stabilizer: false,
    reduction: true,
    eviction: true,
  });
});

test("normalizeConfig requires both legacy eviction switches for compatibility", () => {
  const cases = [
    { modules: { eviction: false }, eviction: { enabled: false }, expected: false },
    { modules: { eviction: false }, eviction: { enabled: true }, expected: false },
    { modules: { eviction: true }, eviction: { enabled: false }, expected: false },
    { modules: { eviction: true }, eviction: { enabled: true }, expected: true },
  ];

  for (const item of cases) {
    const cfg = normalizeConfig({ modules: item.modules, eviction: item.eviction });
    assert.equal(cfg.moduleEnablement.eviction, item.expected);
  }
});

test("normalizeConfig preserves the TokenPilot default module contract", () => {
  const cfg = normalizeConfig({ stateDir: "/tmp/tokenpilot-config-contract" });

  assert.deepEqual(cfg.moduleEnablement, {
    stabilizer: true,
    reduction: true,
    eviction: false,
  });
  assert.deepEqual(cfg.modules, {
    stabilizer: true,
    policy: true,
    reduction: true,
    eviction: false,
  });
  assert.deepEqual(cfg.eviction, {
    enabled: false,
    policy: "noop",
    maxCandidateBlocks: 128,
    minBlockChars: 256,
    replacementMode: "pointer_stub",
  });
  assert.equal(cfg.taskStateEstimator.batchTurns, 5);
  assert.equal(cfg.taskStateEstimator.evictionLookaheadTurns, 3);
  assert.equal(cfg.reduction.engine, "layered");
  assert.equal(cfg.reduction.triggerMinChars, 2200);
  assert.equal(cfg.reduction.maxToolChars, 1200);
  assert.equal(cfg.stateDir, "/tmp/tokenpilot-config-contract");
  assert.equal(
    cfg.debugTapPath,
    join("/tmp/tokenpilot-config-contract", "tokenpilot", "provider-traffic.jsonl"),
  );
});

test("normalizeConfig prefers LIGHTRSI_ then LIGHTMEM2_ then TOKENPILOT_ estimator env", () => {
  withEnv({
    LIGHTRSI_TASK_STATE_ESTIMATOR_MODEL: "canonical-model",
    LIGHTMEM2_TASK_STATE_ESTIMATOR_MODEL: "legacy-model",
    TOKENPILOT_TASK_STATE_ESTIMATOR_MODEL: "preset-model",
  }, () => {
    assert.equal(normalizeConfig({}).taskStateEstimator.model, "canonical-model");
  });

  withEnv({
    LIGHTRSI_TASK_STATE_ESTIMATOR_MODEL: undefined,
    LIGHTMEM2_TASK_STATE_ESTIMATOR_MODEL: "legacy-model",
    TOKENPILOT_TASK_STATE_ESTIMATOR_MODEL: "preset-model",
  }, () => {
    assert.equal(normalizeConfig({}).taskStateEstimator.model, "legacy-model");
  });
});
