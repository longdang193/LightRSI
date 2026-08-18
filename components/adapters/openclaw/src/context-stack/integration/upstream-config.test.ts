import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ensureExplicitProxyModelsInConfig,
  normalizeProxyModelId,
} from "./upstream-config.js";

test("normalizeProxyModelId accepts current, TokenPilot, and LightMem2 prefixes", () => {
  assert.equal(normalizeProxyModelId("lightrsi/gpt-5.4"), "gpt-5.4");
  assert.equal(normalizeProxyModelId("tokenpilot/gpt-5.4"), "gpt-5.4");
  assert.equal(normalizeProxyModelId("lightmem2/gpt-5.4"), "gpt-5.4");
});

test("ensureExplicitProxyModelsInConfig migrates the LightMem2 provider and model aliases", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-openclaw-provider-migration-"));
  const configPath = join(root, "openclaw.json");
  const originalConfigPath = process.env.OPENCLAW_CONFIG_PATH;
  try {
    await writeFile(configPath, JSON.stringify({
      models: {
        providers: {
          lightmem2: {
            baseUrl: "http://127.0.0.1:17000/v1",
            apiKey: "old-local-key",
            customCompatibilityField: "preserved",
            models: [],
          },
        },
      },
      agents: {
        defaults: {
          model: { primary: "lightmem2/gpt-5.4" },
          models: { "lightmem2/gpt-5.4": { alias: "legacy-alias" } },
        },
      },
    }, null, 2), "utf8");
    process.env.OPENCLAW_CONFIG_PATH = configPath;

    await ensureExplicitProxyModelsInConfig(
      "http://127.0.0.1:17667/v1",
      {
        providerId: "openai",
        baseUrl: "https://api.example/v1",
        apiKey: "upstream-key",
        apiFamily: "openai-responses",
        models: [{
          id: "gpt-5.4",
          name: "GPT-5.4",
          reasoning: true,
          input: ["text"],
          contextWindow: 128_000,
          maxTokens: 8_192,
        }],
      },
      { warn() {}, info() {} },
    );

    const config = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(config.models.providers.lightmem2, undefined);
    assert.equal(config.models.providers.lightrsi.customCompatibilityField, "preserved");
    assert.equal(config.models.providers.lightrsi.baseUrl, "http://127.0.0.1:17667/v1");
    assert.deepEqual(config.agents.defaults.models["lightrsi/gpt-5.4"], { alias: "legacy-alias" });
    assert.equal(config.agents.defaults.models["lightmem2/gpt-5.4"], undefined);
    assert.equal(config.agents.defaults.model.primary, "lightrsi/gpt-5.4");
  } finally {
    if (originalConfigPath === undefined) delete process.env.OPENCLAW_CONFIG_PATH;
    else process.env.OPENCLAW_CONFIG_PATH = originalConfigPath;
    await rm(root, { recursive: true, force: true });
  }
});
