import assert from "node:assert/strict";
import test from "node:test";

import {
  SECURITY_FIXTURE_PROMPT,
  STAGE_A_ARMS,
  buildMockGenerationPolicyReport,
  evaluateRouterSettingsPreflight,
  projectAssistantHistory,
  runGenerationPolicyBenchmark,
  validateSecurityFixtureOutput,
} from "../scripts/benchmark-generation-policy.ts";

test("assistant history projection excludes hidden reasoning and preserves tool closure", () => {
  const reasoning = { type: "reasoning", encrypted_content: "secret" };
  const assistant = { type: "message", role: "assistant", content: [{ type: "output_text", text: "done" }] };
  const call = { type: "function_call", call_id: "call-1", name: "bash", arguments: "{}" };
  const output = { type: "function_call_output", call_id: "call-1", output: "ok" };

  assert.deepEqual(projectAssistantHistory([reasoning, assistant, call, output]), [assistant, call, output]);
});

test("security fixture requires the exact warning prefix", () => {
  assert.match(SECURITY_FIXTURE_PROMPT, /must begin with exactly `Security warning:`/u);
  assert.equal(validateSecurityFixtureOutput("Security warning: validate paths before use."), true);
  assert.equal(validateSecurityFixtureOutput("Warning: validate paths before use."), false);
});

test("mock generation policy benchmark reports contract evidence without provider calls", async () => {
  const report = await runGenerationPolicyBenchmark({ mock: true });
  assert.deepEqual(Object.keys(report.arms), STAGE_A_ARMS);
  assert.equal(report.liveEconomics, "inconclusive");
  assert.equal(report.decision, "no-promotion");
  assert.ok(Object.values(report.arms).every((arm) => arm.correctness === "pass" && arm.stability === "pass" && arm.providerCalls === 0));
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
