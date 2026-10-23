import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const agentsRoot = path.join(repoRoot, "agents");
const retiredNames = new Set(["combo-web-high", "combo-web-medium"]);
const retiredPrefixes = ["cgw/", "chatgpt-web/"];

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
  assert.equal(profiles.get("ui"), "combo-ui");
  assert.equal(profiles.get("xhigh"), "combo-xhigh");
});
