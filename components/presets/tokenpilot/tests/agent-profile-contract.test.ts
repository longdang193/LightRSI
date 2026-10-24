import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  NINE_ROUTER_PROVIDER_ID,
  NINE_ROUTER_RETAINED_MODEL_CONTRACT,
} from "../src/9router-contract.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const agentsRoot = path.join(repoRoot, "agents");
const retirementPolicyPath = path.join(repoRoot, "components/presets/tokenpilot/retired-model-policy.json");
function readRetirementPolicy() {
  const policy = JSON.parse(fs.readFileSync(retirementPolicyPath, "utf8"));
  assert.equal(policy.owner, "9router/open-sse/config/retiredModels.js");
  assert.equal(policy.schemaVersion, 1);
  assert.deepEqual(policy.retiredModelNames, ["combo-web-high", "combo-web-medium"]);
  assert.deepEqual(policy.retiredModelPrefixes, ["cgw/", "chatgpt-web/", "cg/"]);
  return policy;
}

function isRetiredSelection(
  policy: ReturnType<typeof readRetirementPolicy>,
  provider: string,
  model: string,
): boolean {
  const aliases = policy.providerAliases as Record<string, string>;
  const canonicalProvider = aliases[provider] ?? provider;
  const composed = `${canonicalProvider}/${model}`;
  return policy.retiredProviderIds.includes(provider)
    || Object.hasOwn(aliases, provider)
    || policy.retiredModelNames.includes(model)
    || policy.retiredModelPrefixes.some((prefix: string) => model.startsWith(prefix))
    || policy.retiredModelPrefixes.some((prefix: string) => composed.startsWith(prefix));
}

function readProfiles() {
  return fs.readdirSync(agentsRoot)
    .filter((name) => name.endsWith(".toml"))
    .sort()
    .map((name) => {
      const source = fs.readFileSync(path.join(agentsRoot, name), "utf8");
      const provider = source.match(/^model_provider\s*=\s*"([^"]+)"\s*$/m)?.[1];
      const model = source.match(/^model\s*=\s*"([^"]+)"\s*$/m)?.[1];
      assert.ok(provider, name + " must declare a model provider");
      assert.ok(model, name + " must declare a model");
      return { name, provider, model };
    });
}

test("agent profiles contain no retired CGW or web-combo selections", () => {
  const policy = readRetirementPolicy();
  for (const profile of readProfiles()) {
    assert.equal(isRetiredSelection(policy, profile.provider, profile.model), false, profile.name + " selects retired model " + profile.model);
  }
});

test("retirement policy rejects retired provider, alias, model, and composed ingress forms", () => {
  const policy = readRetirementPolicy();
  const cases = [
    ["chatgpt-web", "safe-model"],
    ["cg", "safe-model"],
    ["openai", "cgw/example"],
    ["openai", "chatgpt-web/example"],
    ["openai", "cg/example"],
    ["openai", "combo-web-high"],
    ["openai", "combo-web-medium"],
    ["9router", "cgw/example"],
  ] as const;
  for (const [provider, model] of cases) {
    assert.equal(isRetiredSelection(policy, provider, model), true, `${provider}/${model} must be retired`);
  }
});

test("retained logical profiles remain owned by 9Router", () => {
  const profiles = new Map(readProfiles().map((profile) => [path.basename(profile.name, ".toml"), profile]));
  assert.equal(NINE_ROUTER_PROVIDER_ID, "9router");
  for (const entry of NINE_ROUTER_RETAINED_MODEL_CONTRACT) {
    assert.equal(entry.providerId, NINE_ROUTER_PROVIDER_ID);
    assert.deepEqual(entry.capabilities, ["responses"]);
    assert.equal(profiles.get(entry.profile)?.provider, NINE_ROUTER_PROVIDER_ID);
    assert.equal(profiles.get(entry.profile)?.model, entry.model);
  }
});
