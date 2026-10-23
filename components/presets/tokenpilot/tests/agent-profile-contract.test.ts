import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const agentsRoot = path.join(repoRoot, "agents");
const retirementPolicyPath = path.join(repoRoot, "components/presets/tokenpilot/retired-model-policy.json");
const retainedComboContractPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/9router-retained-combo-contract.json");

function readRetirementPolicy() {
  const policy = JSON.parse(fs.readFileSync(retirementPolicyPath, "utf8"));
  assert.equal(policy.owner, "9router/open-sse/config/retiredModels.js");
  assert.equal(policy.schemaVersion, 1);
  assert.deepEqual(policy.retiredModelNames, ["combo-web-high", "combo-web-medium"]);
  assert.deepEqual(policy.retiredModelPrefixes, ["cgw/", "chatgpt-web/", "cg/"]);
  return policy;
}

function readProfiles() {
  return fs.readdirSync(agentsRoot)
    .filter((name) => name.endsWith(".toml"))
    .sort()
    .map((name) => {
      const source = fs.readFileSync(path.join(agentsRoot, name), "utf8");
      const model = source.match(/^model\s*=\s*"([^"]+)"\s*$/m)?.[1];
      assert.ok(model, name + " must declare a model");
      return { name, model };
    });
}

test("agent profiles contain no retired CGW or web-combo selections", () => {
  const policy = readRetirementPolicy();
  const retiredNames = new Set(policy.retiredModelNames);
  const retiredPrefixes: string[] = policy.retiredModelPrefixes;
  for (const profile of readProfiles()) {
    assert.equal(
      retiredNames.has(profile.model) || retiredPrefixes.some((prefix) => profile.model.startsWith(prefix)),
      false,
      profile.name + " selects retired model " + profile.model,
    );
  }
});

test("retained logical profiles remain owned by 9Router", () => {
  const profiles = new Map(readProfiles().map((profile) => [path.basename(profile.name, ".toml"), profile.model]));
  const contract = JSON.parse(fs.readFileSync(retainedComboContractPath, "utf8"));
  assert.equal(contract.owner, "9router");
  assert.equal(contract.schemaVersion, 1);
  for (const entry of contract.models) {
    assert.equal(entry.provider, "9router");
    assert.deepEqual(entry.capabilities, ["responses"]);
    assert.equal(profiles.get(entry.profile), entry.model);
  }
});
