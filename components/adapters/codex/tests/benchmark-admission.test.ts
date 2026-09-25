import assert from "node:assert/strict";
import test from "node:test";

import { runAdmissionBenchmark } from "../scripts/benchmark-admission.js";

test("mock admission benchmark reports correctness separately from incomplete economics", async () => {
  const previousMode = process.env.LIGHTRSI_BENCHMARK_MODE;
  process.env.LIGHTRSI_BENCHMARK_MODE = "mock";
  try {
    const report = await runAdmissionBenchmark(5);
    assert.equal(report.mode, "mock");
    assert.equal(report.status, "inconclusive");
    assert.equal(report.liveProviderClaim, false);
    assert.equal(report.repetitions, 5);
    assert.equal(report.cases.length, 5);
    assert.ok(report.cases.every((entry) => entry.correctness === "pass"));
    assert.equal(report.evidenceCompleteness.providerUsage, "missing");
    assert.equal(report.evidenceCompleteness.cacheEvidence, "missing");
  } finally {
    if (previousMode === undefined) delete process.env.LIGHTRSI_BENCHMARK_MODE;
    else process.env.LIGHTRSI_BENCHMARK_MODE = previousMode;
  }
});
