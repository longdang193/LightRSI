import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  SECURITY_FIXTURE_PROMPT,
  STAGE_A_ARMS,
  buildLiveArmInstructions,
  buildMockGenerationPolicyReport,
  evaluateRouterSettingsPreflight,
  loadCodexAuthApiKey,
  projectAssistantHistory,
  readRouterSettingsEvidence,
  runGenerationPolicyBenchmark,
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
  assert.equal(validateSecurityFixtureOutput("Security warning: validate paths before use."), true);
  assert.equal(validateSecurityFixtureOutput("Warning: validate paths before use."), false);
});

test("live repair instructions preserve independent arm composition", () => {
  assert.equal(buildLiveArmInstructions("baseline"), "");
  assert.match(buildLiveArmInstructions("caveman-full"), /LightRSI Caveman/u);
  assert.doesNotMatch(buildLiveArmInstructions("caveman-full"), /LightRSI Ponytail/u);
  assert.match(buildLiveArmInstructions("both-full"), /LightRSI Caveman/u);
  assert.match(buildLiveArmInstructions("both-full"), /LightRSI Ponytail/u);
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
