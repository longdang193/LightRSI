import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  SECURITY_FIXTURE_PROMPT,
  STAGE_A_ARMS,
  STAGE_A_WORKLOAD,
  STAGE_B_ARMS,
  buildLiveArmInstructions,
  buildStageBArmInstructions,
  buildMockStageBReport,
  buildMockGenerationPolicyReport,
  compareMatchedStageA,
  evaluateRouterSettingsPreflight,
  loadCodexAuthApiKey,
  projectAssistantHistory,
  parseProviderUsage,
  readRouterSettingsEvidence,
  runGenerationPolicyBenchmark,
  runGenerationPolicyStageB,
  summarizeMatchedStageAArm,
  shouldUseRouterSettingsEvidenceFallback,
  validateSecurityFixtureOutput,
  validateMultiTurnFixtureOutput,
} from "../scripts/benchmark-generation-policy.ts";

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
  assert.equal(validateMultiTurnFixtureOutput("The implementation is complete."), false);
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
      error: null,
    }],
    pricing: { inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 2 },
  });

  assert.equal(summary.totalCostUsd, null);
  assert.equal(summary.completedTaskCostUsd, null);
  assert.equal(summary.economics, "inconclusive");
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

test("matched accounting produces paired baseline deltas and blocks failed arms", () => {
  const rows = [
    { arm: "baseline" as const, fixture: "prose" as const, repetition: 0, passed: true, outputChars: 100, latencyMs: 100, providerCalls: 1, turns: 1, toolCalls: 0, retries: 0, clarifications: 0, usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedInputTokens: 0 }, error: null },
    { arm: "caveman-full" as const, fixture: "prose" as const, repetition: 0, passed: false, outputChars: 80, latencyMs: 80, providerCalls: 1, turns: 1, toolCalls: 0, retries: 0, clarifications: 0, usage: { inputTokens: 80, outputTokens: 10, totalTokens: 90, cachedInputTokens: 0 }, error: null },
  ];
  const comparisons = compareMatchedStageA(rows, 1, { inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 2 });
  const caveman = comparisons.arms["caveman-full"];

  assert.equal(comparisons.workload.repetitions, 1);
  assert.equal(caveman.correctness, "fail");
  assert.equal(caveman.economics, "pass");
  assert.equal(caveman.baselineDelta?.latencyMs, -20);
  assert.equal(caveman.baselineDelta?.providerCalls, 0);
  assert.equal(comparisons.decision, "no-promotion");
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

test("router dashboard evidence only replaces unavailable settings authentication", () => {
  const evidence = { status: "match" as const, source: "dashboard_evidence" as const, settings: {} };
  assert.equal(shouldUseRouterSettingsEvidenceFallback({ status: "unknown", source: "unavailable", settings: {} }, evidence), true);
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
      cavemanEnabled: false,
      ponytailEnabled: false,
    }), "utf8");
    const result = await readRouterSettingsEvidence(evidencePath);
    assert.equal(result.status, "match");
    assert.equal(result.source, "dashboard_evidence");
    assert.match(result.limitation ?? "", /authentication unavailable/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
