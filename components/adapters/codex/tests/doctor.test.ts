import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { appendFile, mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import {
  codexMcpServerDiagnostic,
  codexProviderDiagnostic,
  formatCodexDoctorReport,
  inspectCodexDoctor,
} from "../src/doctor.js";
import {
  appendCodexRebaseCapability,
  CODEX_REBASE_API_VERSION,
  CODEX_REBASE_ITEM_SCHEMA_VERSION,
  CODEX_REBASE_WIRE_MODE,
  codexRebaseCapabilityJournalPath,
  codexRebaseEndpointIdentity,
} from "../src/context-rewrite/index.js";

async function reserveUnusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to reserve test port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

const execFileAsync = promisify(execFile);

test("inspectCodexDoctor reports missing provider and hooks honestly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightrsi-codex-doctor-"));
  try {
    const proxyPort = await reserveUnusedPort();
    const codexConfigPath = join(dir, "config.toml");
    const hooksConfigPath = join(dir, "hooks.json");
    const tokenPilotConfigPath = join(dir, "tokenpilot.json");

    await writeFile(codexConfigPath, "model_provider = \"OpenAI\"\n", "utf8");
    await writeFile(hooksConfigPath, JSON.stringify({ hooks: {} }, null, 2), "utf8");
    await mkdir(join(dir, "state"), { recursive: true });

    const report = await inspectCodexDoctor({
      config: normalizeTokenPilotCodexConfig({
        stateDir: join(dir, "state"),
        proxyPort,
      }),
      configPath: codexConfigPath,
      hooksConfigPath,
      tokenPilotConfigPath,
    });

    assert.equal(report.providerInstalled, false);
    assert.equal(report.hooksInstalled, false);
    assert.equal(report.hooksComplete, false);
    assert.equal(report.hooksMatchExpectedCommand, false);
    assert.deepEqual(report.installedHookEvents, []);
    assert.deepEqual(report.missingHookEvents, ["SessionStart", "PreToolUse", "PostToolUse"]);
    assert.equal(report.daemonRunning, false);
    assert.equal(report.mcpInstalled, false);
    assert.equal(report.mcpStateDirMatches, false);
    assert.equal(report.mcpCommandMatches, false);
    assert.equal(report.mcpArgsMatch, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("doctor diagnostics summarize provider and MCP config without secret values", () => {
  const provider = codexProviderDiagnostic({
    name: "provider-name",
    baseUrl: "https://user:provider-password@example.com/v1?api_key=query-secret",
    apiKey: "provider-api-secret",
    wireApi: "responses",
    requiresOpenAIAuth: true,
  });
  const mcp = codexMcpServerDiagnostic({
    command: "node",
    args: ["server.js", "--token", "mcp-argument-secret"],
    env: {
      TOKENPILOT_STATE_DIR: "/tmp/state",
      SERVICE_API_KEY: "mcp-env-secret",
    },
    startupTimeoutSec: 90,
  });
  const serialized = JSON.stringify({ provider, mcp });

  assert.deepEqual(provider, {
    configured: true,
    name: "provider-name",
    baseUrlConfigured: true,
    apiKeyConfigured: true,
    wireApi: "responses",
    requiresOpenAIAuth: true,
  });
  assert.deepEqual(mcp, {
    configured: true,
    commandConfigured: true,
    argsCount: 3,
    envKeys: ["SERVICE_API_KEY", "TOKENPILOT_STATE_DIR"],
    startupTimeoutSec: 90,
  });
  assert.doesNotMatch(serialized, /provider-password|query-secret|provider-api-secret|mcp-argument-secret|mcp-env-secret/);

  const unsafeName = codexProviderDiagnostic({
    name: "Authorization Bearer provider-name-secret",
    baseUrl: "https://example.com/v1",
  });
  assert.equal(unsafeName.name, "(configured but not safely displayable)");
  assert.doesNotMatch(JSON.stringify(unsafeName), /Authorization|Bearer|provider-name-secret/i);
});

test("formatCodexDoctorReport redacts credentials embedded in diagnostic URLs", () => {
  const text = formatCodexDoctorReport({
    configPath: "/tmp/config.toml",
    hooksConfigPath: "/tmp/hooks.json",
    tokenPilotConfigPath: "/tmp/tokenpilot.json",
    proxyBaseUrl: "http://127.0.0.1:17667/v1",
    expectedHookCommand: "node hooks-handler.js",
    expectedMcpCommand: process.execPath,
    expectedMcpArgs: ["/tmp/server.js"],
    expectedMcpStartupTimeoutSec: 90,
    adapterEnabled: false,
    providerInstalled: true,
    providerActive: true,
    providerIntercepted: false,
    hooksInstalled: true,
    hooksComplete: true,
    hooksMatchExpectedCommand: true,
    installedHookEvents: ["SessionStart", "PreToolUse", "PostToolUse"],
    missingHookEvents: [],
    daemonRunning: false,
    proxyHealthy: false,
    stateDir: "/tmp/state",
    upstreamLoopDetected: false,
    upstreamBaseUrl: "https://user:url-password@example.com/v1?api_key=url-query-secret",
    mcpInstalled: true,
    mcpStateDirMatches: true,
    mcpCommandMatches: true,
    mcpArgsMatch: true,
    mcpStartupTimeoutSecMatches: true,
    coreRuntimeHealthy: false,
    recoveryMcpHealthy: true,
    degradedMode: false,
  });

  assert.match(text, /upstream base URL: https:\/\/example\.com\/v1/);
  assert.doesNotMatch(text, /url-password|url-query-secret/);
});
