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
    assert.ok(report.cases.every((entry) => entry.repetitions.length === 5));
    assert.ok(report.cases.every((entry) => entry.compact.exactRecovery));
    assert.ok(report.cases.every((entry) => entry.compact.taskCorrectness));
    const restart = report.cases.find((entry) => entry.id === "restart-cumulative-resubmission");
    assert.equal(restart?.compact.projectionReusedItems, 2);
    assert.ok(report.cases.every((entry) => entry.full.inputChars >= entry.compact.inputChars));
    assert.equal(report.evidenceCompleteness.providerUsage, "missing");
    assert.equal(report.evidenceCompleteness.cacheEvidence, "missing");
    assert.equal(report.evidenceCompleteness.archiveRecovery, "observed");
  } finally {
    if (previousMode === undefined) delete process.env.LIGHTRSI_BENCHMARK_MODE;
    else process.env.LIGHTRSI_BENCHMARK_MODE = previousMode;
  }
});
