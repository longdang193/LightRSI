import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { promisify } from "node:util";

import {
  SECURITY_FIXTURE_PROMPT,
  STAGE_A_ARMS,
  STAGE_A_WORKLOAD,
  type StageAArm,
  type StageAFixture,
  STAGE_B_ARMS,
  buildLiveArmInstructions,
  buildStageBArmInstructions,
  buildMockStageBReport,
  buildMockGenerationPolicyReport,
  captureFailedOutput,
  compareMatchedStageA,
  parseMatchedStageAPricing,
  parseResponseMeasurementTelemetry,
  evaluateRouterSettingsPreflight,
  expectedStageAPolicyDigest,
  loadCodexAuthApiKey,
  projectAssistantHistory,
  parseProviderUsage,
  readRouterSettingsEvidence,
  readRouterSettingsPreflight,
  readTokenPilotGenerationPolicyPreflight,
  runGenerationPolicyMatchedLive,
  runGenerationPolicyBenchmark,
  runGenerationPolicyStageB,
  summarizeMatchedStageAArm,
  shouldUseRouterSettingsEvidenceFallback,
  stageAFixturePrompt,
  validateStageAFixtureOutput,
  validateSecurityFixtureOutput,
  validateMultiTurnFixtureOutput,
} from "../scripts/benchmark-generation-policy.ts";

const execFileAsync = promisify(execFile);

function matchedRow(fixture: StageAFixture, repetition: number, arm: StageAArm = "baseline") {
  return {
    arm,
    fixture,
    repetition,
    passed: true,
    outputChars: 10,
    latencyMs: 20,
    providerCalls: 1,
    turns: 1,
    toolCalls: 0,
    retries: 0,
    clarifications: 0,
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedInputTokens: 0 },
    measurement: {
      retryCount: 0,
      clarificationCount: 0,
      turnCount: 1,
      usageCompleteness: "complete",
      cachedInputTokens: 0,
      pricingTableVersion: "fixture-v1",
    },
    policyEvidence: [{
      requestId: `${arm}-${fixture}-${repetition}`,
      runtimeBuildId: "fixture-build",
      generationPolicyVersion: "v2/v2",
      generationPolicyDigest: expectedStageAPolicyDigest(arm),
      generationPolicyApplied: arm !== "baseline",
      generationPolicyBypassReason: arm === "baseline" ? "disabled" : null,
    }],
    error: null,
  };
}

test("assistant history projection excludes hidden reasoning and preserves tool closure", () => {
  const reasoning = { type: "reasoning", encrypted_content: "secret" };
  const assistant = { type: "message", role: "assistant", content: [{ type: "output_text", text: "done" }] };
  const call = { type: "function_call", call_id: "call-1", name: "bash", arguments: "{}" };
  const output = { type: "function_call_output", call_id: "call-1", output: "ok" };
  const hostedSearch = { type: "web_search_call", id: "search-1" };

  assert.deepEqual(projectAssistantHistory([reasoning, assistant, call, output, hostedSearch]), [assistant, call, output]);
});

test("security fixture requires the exact warning prefix", () => {
  assert.match(SECURITY_FIXTURE_PROMPT, /must begin with exactly `Security warning:`/u);
  assert.equal(validateSecurityFixtureOutput("Security warning: validate the path against an allowlist; confine it to the intended directory; do not execute untrusted files."), true);
  assert.equal(validateSecurityFixtureOutput("Security warning:"), false);
  assert.equal(validateSecurityFixtureOutput("Security warning: confine the path to the intended directory; validate against an allowlist; do not execute untrusted files."), false);
  assert.equal(validateSecurityFixtureOutput("Security warning: do not validate against an allowlist; never confine the path to the intended directory; do not execute untrusted files."), false);
  assert.equal(validateSecurityFixtureOutput("Security warning: you should not validate against an allowlist; you should not confine the path to the intended directory; do not execute untrusted files."), false);
  assert.equal(validateSecurityFixtureOutput("Security warning: you should not ever validate against an allowlist; you should not ever confine the path to the intended directory; do not execute untrusted files."), false);
  assert.equal(validateSecurityFixtureOutput("Security warning: You must not **validate against an allowlist**; you must not **confine the path to the intended directory**; do not execute untrusted files."), false);
  assert.equal(validateSecurityFixtureOutput("Security warning: validate against an allowlist; confine the path to the intended directory; do not execute validation; execute untrusted files."), false);
  assert.equal(validateSecurityFixtureOutput("Warning: validate paths before use."), false);
});

test("artifact fixture accepts a valid grep-only verification command", () => {
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n\n```sh\ngrep -q '^# Validation Plan$' artifact.md\n```",
  ), true);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n\n```sh\ngit diff --check\n```",
  ), true);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\nRun `pnpm test`.",
  ), true);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\npython -m pytest\n```",
  ), true);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\npython -m unittest discover -v\n```",
  ), true);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\npython -m compileall .\n```",
  ), true);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```text\nnotes\n```\n```sh\ngrep -q ready artifact.md\n```",
  ), true);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\nThere is no test command.\n```",
  ), false);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\ngit reset --hard\n```",
  ), false);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\ngit diff --check-invalid-option\n```",
  ), false);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\ngrep\n```",
  ), false);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\ntest -f\n```",
  ), false);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\ntest nonsense\n```",
  ), false);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n- pnpm test",
  ), true);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\npython -I -m pytest\n```",
  ), true);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\ntest -f && true\n```",
  ), false);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\ntest -f artifact.md extra\n```",
  ), false);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\ntest -f ;\n```",
  ), false);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\ntest -f \"artifact.md\n```",
  ), false);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\ntest -f #\n```",
  ), false);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n```sh\npython --version -m pytest\n```",
  ), false);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n- Run pnpm test",
  ), true);
  assert.equal(validateStageAFixtureOutput(
    "artifact",
    "--- artifact.md ---\n# Validation Plan\n* Run: pnpm test",
  ), true);
});

test("json fixture accepts the numeric schema version stated by the prompt", () => {
  assert.equal(validateStageAFixtureOutput(
    "json",
    '{"status":"ready","schemaVersion":1}',
  ), true);
});

test("live repair instructions preserve independent arm composition", () => {
  assert.equal(buildLiveArmInstructions("baseline"), "");
  assert.match(buildLiveArmInstructions("caveman-full"), /LightRSI Caveman/u);
  assert.doesNotMatch(buildLiveArmInstructions("caveman-full"), /LightRSI Ponytail/u);
  assert.match(buildLiveArmInstructions("both-full"), /LightRSI Caveman/u);
  assert.match(buildLiveArmInstructions("both-full"), /LightRSI Ponytail/u);
});

test("Stage B keeps Caveman and Ponytail intensity sweeps independent", () => {
  assert.deepEqual(STAGE_B_ARMS, [
    "caveman-lite",
    "caveman-full",
    "caveman-ultra",
    "ponytail-lite",
    "ponytail-full",
    "ponytail-ultra",
  ]);
  assert.match(buildStageBArmInstructions("caveman-lite"), /LightRSI Caveman v1 \/ lite/u);
  assert.doesNotMatch(buildStageBArmInstructions("caveman-lite"), /LightRSI Ponytail/u);
  assert.match(buildStageBArmInstructions("ponytail-ultra"), /LightRSI Ponytail v1 \/ ultra/u);
  assert.doesNotMatch(buildStageBArmInstructions("ponytail-ultra"), /LightRSI Caveman/u);
});

test("mock Stage B report is deterministic and always no-promotion", async () => {
  const report = await runGenerationPolicyStageB({ mock: true });
  const direct = buildMockStageBReport();
  assert.deepEqual(Object.keys(report.arms), STAGE_B_ARMS);
  assert.equal(report.mode, "mock");
  assert.equal(report.decision, "no-promotion");
  assert.equal(report.liveEconomics, "inconclusive");
  assert.deepEqual(report.workload, direct.workload);
  assert.deepEqual(report.routerPreflight, direct.routerPreflight);
  assert.ok(Object.values(report.arms).every((arm) => arm.correctness === "unavailable" && arm.stability === "unavailable" && arm.providerCalls === 0));
  assert.equal(new Set(Object.values(report.arms).map((arm) => arm.workloadFingerprint)).size, 1);
});

test("multi-turn fixture validator requires the requested engineering facts", () => {
  assert.equal(validateMultiTurnFixtureOutput("Run npm test. Add an edge case test for an optional field."), true);
  assert.equal(validateMultiTurnFixtureOutput("Run npm test. Add a test for an omitted optional field."), true);
  assert.equal(validateMultiTurnFixtureOutput("Run pytest -q. Add an edge-case test for an optional field."), true);
  assert.equal(validateMultiTurnFixtureOutput("Run git diff --check. Add a test for an omitted optional field."), true);
  assert.equal(validateMultiTurnFixtureOutput("The implementation is complete."), false);
});

test("multi-turn fixture validator rejects a clarification refusal", () => {
  assert.equal(validateMultiTurnFixtureOutput("Please provide the repository or validator\nfile first. Verification should use pytest, and add an edge-case test for an optional field."), false);
});

test("live fixture prompts pin verification commands to the safe oracle contract", () => {
  assert.match(stageAFixturePrompt("multiturn"), /git diff --check/u);
  assert.match(stageAFixturePrompt("multiturn"), /Do not use a placeholder/u);
  assert.match(stageAFixturePrompt("artifact"), /exactly one safe, non-composite verification command/u);
  assert.match(stageAFixturePrompt("artifact"), /git diff --check/u);
});

test("failed output capture preserves short output and bounds long output", () => {
  assert.equal(captureFailedOutput("model miss"), "model miss");
  const captured = captureFailedOutput("x".repeat(3000));
  assert.ok(captured.length <= 2048);
  assert.match(captured, /\[truncated\]$/u);
});

test("mock generation policy benchmark reports contract evidence without provider calls", async () => {
  const report = await runGenerationPolicyBenchmark({ mock: true });
  assert.deepEqual(Object.keys(report.arms), STAGE_A_ARMS);
  assert.equal(report.liveEconomics, "inconclusive");
  assert.equal(report.decision, "no-promotion");
  assert.ok(Object.values(report.arms).every((arm) => arm.correctness === "unavailable" && arm.stability === "unavailable" && arm.providerCalls === 0));
});

test("matched Stage A freezes the eight-fixture workload across every arm", () => {
  assert.deepEqual(STAGE_A_WORKLOAD.fixtures, [
    "prose",
    "code",
    "json",
    "tool-history",
    "security",
    "detail",
    "multiturn",
    "artifact",
  ]);
  assert.equal(STAGE_A_WORKLOAD.repetitions, 5);
  assert.equal(STAGE_A_WORKLOAD.requestShape, "responses");
  assert.equal(new Set(STAGE_A_ARMS.map(() => JSON.stringify(STAGE_A_WORKLOAD))).size, 1);
});

test("matched accounting keeps missing usage unavailable instead of treating it as zero", () => {
  const summary = summarizeMatchedStageAArm({
    arm: "baseline",
    repetitions: 1,
    rows: [{
      arm: "baseline",
      fixture: "prose",
      repetition: 0,
      passed: true,
      outputChars: 10,
      latencyMs: 20,
      providerCalls: 1,
      turns: 1,
      toolCalls: 0,
      retries: 0,
      clarifications: 0,
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedInputTokens: null },
      measurement: {
        retryCount: 0,
        clarificationCount: 0,
        turnCount: 1,
        usageCompleteness: "complete",
        cachedInputTokens: null,
        pricingTableVersion: "fixture-v1",
      },
      policyEvidence: [],
      error: null,
    }],
    pricing: { inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 2, tableVersion: "fixture-v1" },
  });

  assert.equal(summary.totalCostUsd, null);
  assert.equal(summary.completedTaskCostUsd, null);
  assert.equal(summary.economics, "inconclusive");
});

test("matched accounting keeps incomplete and duplicate workload evidence unavailable", () => {
  const incomplete = summarizeMatchedStageAArm({
    arm: "baseline",
    repetitions: 1,
    rows: [matchedRow("prose", 0)],
  });
  assert.equal(incomplete.correctness, "unavailable");

  const duplicateRows = STAGE_A_WORKLOAD.fixtures.flatMap((fixture) => [0, 1].map((repetition) => matchedRow(fixture, repetition)));
  duplicateRows[1] = matchedRow("prose", 0);
  const duplicate = summarizeMatchedStageAArm({
    arm: "baseline",
    repetitions: 2,
    rows: duplicateRows,
  });
  assert.equal(duplicate.correctness, "unavailable");
});

test("provider usage parsing retains cached input telemetry", () => {
  assert.deepEqual(parseProviderUsage({
    usage: {
      input_tokens: 120,
      output_tokens: 30,
      total_tokens: 150,
      input_tokens_details: { cached_tokens: 80 },
    },
  }), {
    inputTokens: 120,
    outputTokens: 30,
    totalTokens: 150,
    cachedInputTokens: 80,
  });
});

test("provider usage parsing rejects impossible and non-finite values", () => {
  assert.equal(parseProviderUsage({ usage: { input_tokens: 10, cached_input_tokens: 11 } }), null);
  assert.deepEqual(parseProviderUsage({ usage: { input_tokens: Number.NaN, output_tokens: 1 } }), {
    inputTokens: null,
    outputTokens: 1,
    totalTokens: null,
    cachedInputTokens: null,
  });
});

test("multi-turn usage sums known fields without fabricating missing fields", async () => {
  const { sumUsage } = await import("../scripts/benchmark-generation-policy.ts");
  assert.deepEqual(sumUsage([
    { usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedInputTokens: 10, reasoningTokens: 4 } },
    { usage: { inputTokens: 80, outputTokens: null, totalTokens: null, cachedInputTokens: 8 } },
  ]), {
    inputTokens: 180,
    outputTokens: null,
    totalTokens: null,
    cachedInputTokens: 18,
  });
});

test("matched accounting produces paired baseline deltas and blocks failed arms", () => {
  const rows = STAGE_A_WORKLOAD.fixtures.flatMap((fixture) => [
    {
      ...matchedRow(fixture, 0, "baseline"),
      outputChars: 100,
      latencyMs: 100,
    },
    {
      ...matchedRow(fixture, 0, "caveman-full"),
      passed: fixture !== "prose",
      outputChars: 80,
      latencyMs: 80,
      usage: { inputTokens: 80, outputTokens: 10, totalTokens: 90, cachedInputTokens: 0 },
    },
  ]);
  const comparisons = compareMatchedStageA(rows, 1, { inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 2, tableVersion: "fixture-v1" });
  const caveman = comparisons.arms["caveman-full"];

  assert.equal(comparisons.workload.repetitions, 1);
  assert.equal(caveman.correctness, "fail");
  assert.equal(caveman.economics, "pass");
  assert.equal(caveman.baselineDelta?.latencyMs, -20);
  assert.equal(caveman.baselineDelta?.providerCalls, 0);
  assert.equal(comparisons.decision, "no-promotion");
});

test("matched comparison keeps incomplete arms non-comparable", () => {
  const comparisons = compareMatchedStageA([
    matchedRow("prose", 0, "baseline"),
    matchedRow("prose", 0, "caveman-full"),
  ], 1, { inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 2 });
  const caveman = comparisons.arms["caveman-full"];

  assert.equal(caveman.correctness, "unavailable");
  assert.equal(caveman.stability, "unavailable");
  assert.equal(caveman.economics, "inconclusive");
  assert.equal(caveman.baselineDelta, null);
});

test("matched comparison leaves unobserved stability unavailable", () => {
  const rows = STAGE_A_WORKLOAD.fixtures.flatMap((fixture) => [
    matchedRow(fixture, 0, "baseline"),
    {
      ...matchedRow(fixture, 0, "caveman-full"),
      toolCalls: null,
      retries: null,
      clarifications: null,
      measurement: {
        ...matchedRow(fixture, 0, "caveman-full").measurement,
        retryCount: null,
        clarificationCount: null,
      },
    },
  ]);
  const comparisons = compareMatchedStageA(rows, 1);

  assert.equal(comparisons.arms["caveman-full"].correctness, "pass");
  assert.equal(comparisons.arms["caveman-full"].stability, "unavailable");
});

test("response measurement telemetry parses explicit non-negative counts and preserves missing data", () => {
  assert.deepEqual(
    parseResponseMeasurementTelemetry(new Headers({
      "x-lightrsi-upstream-retry-count": "2",
      "x-lightrsi-clarification-count": "0",
    })),
    { retryCount: 2, clarificationCount: 0 },
  );
  assert.deepEqual(
    parseResponseMeasurementTelemetry(new Headers({
      "x-lightrsi-upstream-retry-count": "not-a-count",
      "x-lightrsi-clarification-count": "-1",
    })),
    { retryCount: null, clarificationCount: null },
  );
  assert.deepEqual(parseResponseMeasurementTelemetry(new Headers()), { retryCount: null, clarificationCount: null });
});

test("matched comparison rejects complete stability and economics without explicit measurement fields", () => {
  const measurement = {
    retryCount: 0,
    clarificationCount: 0,
    turnCount: 1,
    usageCompleteness: "complete" as const,
    cachedInputTokens: 0,
    pricingTableVersion: "fixture-v1",
  };
  const rows = STAGE_A_WORKLOAD.fixtures.flatMap((fixture) => [
    { ...matchedRow(fixture, 0, "baseline"), measurement },
    { ...matchedRow(fixture, 0, "caveman-full"), measurement },
  ]);
  rows[1] = {
    ...rows[1],
    measurement: {
      ...measurement,
      retryCount: null,
      clarificationCount: null,
      cachedInputTokens: null,
      pricingTableVersion: null,
    },
  };

  const comparisons = compareMatchedStageA(rows, 1, {
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 2,
    tableVersion: "fixture-v1",
  });

  assert.equal(comparisons.arms["caveman-full"].stability, "unavailable");
  assert.equal(comparisons.arms["caveman-full"].economics, "inconclusive");
});

test("matched comparison keeps economics inconclusive when one row lacks pricing provenance", () => {
  const rows = STAGE_A_WORKLOAD.fixtures.flatMap((fixture) => [
    matchedRow(fixture, 0, "baseline"),
    matchedRow(fixture, 0, "caveman-full"),
  ]);
  rows[1] = {
    ...rows[1],
    measurement: { ...rows[1].measurement, pricingTableVersion: null },
  };

  const comparisons = compareMatchedStageA(rows, 1, {
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 2,
    tableVersion: "fixture-v1",
  });

  assert.equal(comparisons.arms["caveman-full"].economics, "inconclusive");
});

test("matched live pricing accepts an explicit pricing table version", () => {
  assert.deepEqual(parseMatchedStageAPricing({
    LIGHTRSI_BENCHMARK_INPUT_USD_PER_MILLION: "1",
    LIGHTRSI_BENCHMARK_CACHED_INPUT_USD_PER_MILLION: "0.5",
    LIGHTRSI_BENCHMARK_OUTPUT_USD_PER_MILLION: "2",
    LIGHTRSI_BENCHMARK_PRICING_TABLE_VERSION: "2026-10-11-openai-v1",
  }), {
    inputUsdPerMillion: 1,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 2,
    tableVersion: "2026-10-11-openai-v1",
  });
});

test("matched comparison rejects unmatched policy evidence", () => {
  const rows = STAGE_A_WORKLOAD.fixtures.flatMap((fixture) => [
    matchedRow(fixture, 0, "baseline"),
    matchedRow(fixture, 0, "caveman-full"),
  ]);
  rows[1] = {
    ...rows[1],
    policyEvidence: [{
      ...rows[1].policyEvidence[0]!,
      requestId: rows[0].policyEvidence[0]!.requestId,
      runtimeBuildId: "different-build",
      generationPolicyDigest: expectedStageAPolicyDigest("ponytail-full"),
    }],
  };
  const comparisons = compareMatchedStageA(rows, 1);

  assert.equal(comparisons.arms.baseline.correctness, "unavailable");
  assert.equal(comparisons.arms["caveman-full"].correctness, "unavailable");
  assert.equal(comparisons.arms["caveman-full"].economics, "inconclusive");
});

test("matched comparison rejects unknown runtime identity", () => {
  const rows = STAGE_A_WORKLOAD.fixtures.flatMap((fixture) => [
    matchedRow(fixture, 0, "baseline"),
    matchedRow(fixture, 0, "caveman-full"),
  ]).map((row) => ({
    ...row,
    policyEvidence: row.policyEvidence.map((evidence) => ({
      ...evidence,
      runtimeBuildId: "unavailable",
    })),
  }));
  const comparisons = compareMatchedStageA(rows, 1);

  assert.equal(comparisons.arms.baseline.correctness, "unavailable");
  assert.equal(comparisons.arms["caveman-full"].correctness, "unavailable");
  assert.equal(comparisons.arms["caveman-full"].economics, "inconclusive");
});

test("matched comparison rejects partial multi-turn policy evidence", () => {
  const rows = STAGE_A_WORKLOAD.fixtures.flatMap((fixture) => [
    matchedRow(fixture, 0, "baseline"),
    matchedRow(fixture, 0, "caveman-full"),
  ]);
  const baselineMultiTurn = rows.find((row) => row.arm === "baseline" && row.fixture === "multiturn")!;
  const cavemanMultiTurn = rows.find((row) => row.arm === "caveman-full" && row.fixture === "multiturn")!;
  rows[rows.indexOf(baselineMultiTurn)] = {
    ...baselineMultiTurn,
    providerCalls: 2,
    turns: 2,
    policyEvidence: [
      ...baselineMultiTurn.policyEvidence,
      { ...baselineMultiTurn.policyEvidence[0]!, requestId: "baseline-multiturn-second" },
    ],
  };
  rows[rows.indexOf(cavemanMultiTurn)] = {
    ...cavemanMultiTurn,
    providerCalls: 2,
    turns: 2,
  };
  const comparisons = compareMatchedStageA(rows, 1);

  assert.equal(comparisons.arms.baseline.correctness, "pass");
  assert.equal(comparisons.arms["caveman-full"].correctness, "unavailable");
  assert.equal(comparisons.arms["caveman-full"].economics, "inconclusive");
});

test("matched live accounting preserves every failed request attempt when settings API is unavailable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightrsi-matched-failure-accounting-"));
  const originalCwd = process.cwd();
  try {
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await writeFile(join(dir, "fixture.txt"), "clean checkpoint\n", "utf8");
    const evidencePath = join(dir, "router-settings.json");
    const tokenPilotConfigPath = join(dir, "tokenpilot.json");
    await writeFile(evidencePath, JSON.stringify({
      source: "9router_dashboard",
      status: 200,
      routerUrl: "http://127.0.0.1:1",
      capturedAt: new Date().toISOString(),
      cavemanEnabled: false,
      ponytailEnabled: false,
    }), "utf8");
    await writeFile(tokenPilotConfigPath, JSON.stringify({
      generationPolicy: {
        caveman: { enabled: false, level: "full" },
        ponytail: { enabled: false, level: "full" },
      },
    }), "utf8");
    await execFileAsync("git", ["add", "fixture.txt", "router-settings.json", "tokenpilot.json"], { cwd: dir });
    await execFileAsync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"], { cwd: dir });
    process.chdir(dir);

    let attempts = 0;
    const requestUrls: string[] = [];
    const requestBodies: Record<string, unknown>[] = [];
    const armBaseUrls = Object.fromEntries(STAGE_A_ARMS.map((arm) => [arm, `http://127.0.0.1/${arm}`])) as Record<StageAArm, string>;
    const report = await runGenerationPolicyMatchedLive({
      baseUrl: "http://127.0.0.1:1/v1",
      armBaseUrls,
      routerUrl: "http://127.0.0.1:1",
      apiKey: "fixture-key",
      model: "fixture-model",
      repetitions: 1,
      routerSettingsEvidencePath: evidencePath,
      tokenPilotConfigPath,
      pricing: { inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 2 },
      fetchImpl: async (input, init) => {
        if (String(input).endsWith("/api/settings")) {
          return new Response("", { status: 401 });
        }
        attempts += 1;
        requestUrls.push(String(input));
        requestBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        throw new Error("transport failure");
      },
    });

    assert.equal(report.routerPreflight.source, "dashboard_evidence");
    assert.equal(attempts, 32);
    for (const arm of STAGE_A_ARMS) {
      assert.equal(requestUrls.filter((url) => url.startsWith(armBaseUrls[arm])).length, 8);
    }
    assert.ok(requestBodies.every((body) => body.instructions === ""));
    assert.equal(report.matched?.arms.baseline.providerCalls, 8);
    assert.equal(report.matched?.arms.baseline.totalCostUsd, null);
    assert.equal(report.matched?.arms["caveman-full"].economics, "inconclusive");
    assert.ok(report.rows?.filter((row) => row.arm === "baseline").every((row) => row.providerCalls === 1));
    assert.ok(report.rows?.every((row) => row.measurement.usageCompleteness === "unavailable"));
    assert.ok(report.rows?.every((row) => row.measurement.pricingTableVersion === null));
  } finally {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  }
});

test("matched live accounting marks later-turn telemetry unknown after an unobserved failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightrsi-matched-partial-telemetry-"));
  const originalCwd = process.cwd();
  try {
    await execFileAsync("git", ["init", "-q"], { cwd: dir });
    await writeFile(join(dir, "fixture.txt"), "clean checkpoint\n", "utf8");
    const evidencePath = join(dir, "router-settings.json");
    const tokenPilotConfigPath = join(dir, "tokenpilot.json");
    await writeFile(evidencePath, JSON.stringify({
      source: "9router_dashboard",
      status: 200,
      routerUrl: "http://127.0.0.1:1",
      capturedAt: new Date().toISOString(),
      cavemanEnabled: false,
      ponytailEnabled: false,
    }), "utf8");
    await writeFile(tokenPilotConfigPath, JSON.stringify({
      generationPolicy: {
        caveman: { enabled: false, level: "full" },
        ponytail: { enabled: false, level: "full" },
      },
    }), "utf8");
    await execFileAsync("git", ["add", "fixture.txt", "router-settings.json", "tokenpilot.json"], { cwd: dir });
    await execFileAsync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"], { cwd: dir });
    process.chdir(dir);

    const callsByArm = new Map<string, number>();
    const armBaseUrls = Object.fromEntries(STAGE_A_ARMS.map((arm) => [arm, `http://127.0.0.1/${arm}`])) as Record<StageAArm, string>;
    const report = await runGenerationPolicyMatchedLive({
      baseUrl: "http://127.0.0.1:1/v1",
      armBaseUrls,
      routerUrl: "http://127.0.0.1:1",
      apiKey: "fixture-key",
      model: "fixture-model",
      repetitions: 1,
      routerSettingsEvidencePath: evidencePath,
      tokenPilotConfigPath,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.endsWith("/api/settings")) return new Response("", { status: 401 });
        const arm = Object.entries(armBaseUrls).find(([, baseUrl]) => url.startsWith(baseUrl))?.[0] ?? "unknown";
        const callCount = (callsByArm.get(arm) ?? 0) + 1;
        callsByArm.set(arm, callCount);
        if (callCount % 9 === 8) throw new Error("transport failure");
        return new Response(JSON.stringify({ output: [] }), {
          status: 200,
          headers: {
            "x-lightrsi-upstream-retry-count": "0",
            "x-lightrsi-clarification-count": "0",
          },
        });
      },
    });

    const multiturnRows = report.rows?.filter((row) => row.fixture === "multiturn") ?? [];
    assert.equal(multiturnRows.length, STAGE_A_ARMS.length);
    assert.ok(multiturnRows.every((row) => row.error !== null));
    assert.ok(multiturnRows.every((row) => row.providerCalls === 2));
    assert.ok(multiturnRows.every((row) => row.measurement.retryCount === null));
    assert.ok(multiturnRows.every((row) => row.measurement.clarificationCount === null));
  } finally {
    process.chdir(originalCwd);
    await rm(dir, { recursive: true, force: true });
  }
});

test("mock report stays deterministic apart from repository state", () => {
  const report = buildMockGenerationPolicyReport();
  assert.equal(report.mode, "mock");
  assert.equal(report.sourceSha.length, 40);
  assert.equal(report.liveEconomics, "inconclusive");
});

test("live benchmark refuses without explicit mock mode", async () => {
  await assert.rejects(runGenerationPolicyBenchmark(), /clean source checkpoint/);
});

test("router preflight fails closed on unknown or mismatched settings", () => {
  assert.equal(evaluateRouterSettingsPreflight({}, { cavemanEnabled: false, ponytailEnabled: false }).status, "unknown");
  assert.equal(evaluateRouterSettingsPreflight({ cavemanEnabled: true, ponytailEnabled: false }, { cavemanEnabled: false, ponytailEnabled: false }).status, "mismatch");
  assert.equal(evaluateRouterSettingsPreflight({ settings: { cavemanEnabled: false, ponytailEnabled: false, rtk: "off" } }, { cavemanEnabled: false, ponytailEnabled: false }).status, "match");
});

test("TokenPilot generation policy preflight fails closed unless both policies are disabled", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightrsi-tokenpilot-preflight-"));
  try {
    const missing = await readTokenPilotGenerationPolicyPreflight(join(dir, "missing.json"));
    assert.equal(missing.status, "unknown");

    const configPath = join(dir, "tokenpilot.json");
    await writeFile(configPath, JSON.stringify({ generationPolicy: { caveman: { enabled: true } } }), "utf8");
    const mismatch = await readTokenPilotGenerationPolicyPreflight(configPath);
    assert.equal(mismatch.status, "mismatch");

    await writeFile(configPath, JSON.stringify({ generationPolicy: { caveman: { enabled: false }, ponytail: { enabled: false } } }), "utf8");
    const match = await readTokenPilotGenerationPolicyPreflight(configPath);
    assert.equal(match.status, "match");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("router dashboard evidence only replaces unavailable settings authentication", () => {
  const evidence = { status: "match" as const, source: "dashboard_evidence" as const, settings: {} };
  assert.equal(shouldUseRouterSettingsEvidenceFallback({ status: "unknown", source: "unavailable", settings: {}, unavailableReason: "authentication" }, evidence), true);
  assert.equal(shouldUseRouterSettingsEvidenceFallback({ status: "unknown", source: "unavailable", settings: {}, unavailableReason: "http" }, evidence), false);
  assert.equal(shouldUseRouterSettingsEvidenceFallback({ status: "mismatch", source: "settings_api", settings: { cavemanEnabled: true, ponytailEnabled: false } }, evidence), false);
  assert.equal(shouldUseRouterSettingsEvidenceFallback({ status: "unknown", source: "settings_api", settings: {} }, evidence), false);
});

test("live repair reads Codex auth.json without persisting the key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightrsi-codex-auth-"));
  const authPath = join(dir, "auth.json");
  try {
    await writeFile(authPath, JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "fixture-key" }), "utf8");
    assert.equal(await loadCodexAuthApiKey(authPath), "fixture-key");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("router dashboard evidence is explicit and preserves the preflight limitation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightrsi-router-evidence-"));
  const evidencePath = join(dir, "settings.json");
  try {
    await writeFile(evidencePath, JSON.stringify({
      source: "9router_dashboard",
      status: 200,
      routerUrl: "http://127.0.0.1:20128",
      capturedAt: "2026-10-11T12:00:00.000Z",
      cavemanEnabled: false,
      ponytailEnabled: false,
    }), "utf8");
    const result = await readRouterSettingsEvidence(evidencePath, "http://127.0.0.1:20128", new Date("2026-10-11T12:04:00.000Z"));
    assert.equal(result.status, "match");
    assert.equal(result.source, "dashboard_evidence");
    assert.match(result.limitation ?? "", /authentication unavailable/u);

    const stale = await readRouterSettingsEvidence(evidencePath, "http://127.0.0.1:20128", new Date("2026-10-11T12:06:00.000Z"));
    assert.equal(stale.status, "unknown");
    const wrongRouter = await readRouterSettingsEvidence(evidencePath, "http://127.0.0.1:20129", new Date("2026-10-11T12:04:00.000Z"));
    assert.equal(wrongRouter.status, "unknown");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("router settings fallback rejects non-authentication failures", async () => {
  const result = await readRouterSettingsPreflight(
    "http://router.invalid",
    { cavemanEnabled: false, ponytailEnabled: false },
    "fixture-key",
    async () => new Response("server error", { status: 500 }),
  );
  assert.equal(result.status, "unknown");
  assert.equal(result.unavailableReason, "http");
  assert.equal(shouldUseRouterSettingsEvidenceFallback(result, {
    status: "match",
    source: "dashboard_evidence",
    settings: {},
  }), false);
});
