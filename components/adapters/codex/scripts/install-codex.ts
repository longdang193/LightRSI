#!/usr/bin/env node
import { resolve } from "node:path";
import {
  defaultCodexConfigPath,
  defaultTokenPilotConfigPath,
  loadTokenPilotCodexConfig,
} from "../src/config.js";
import { startDaemon } from "../src/daemon.js";
import { installCodexTokenPilot } from "../src/install.js";

installCodexTokenPilot({
  codexConfigPath: process.env.CODEX_CONFIG_PATH,
  tokenPilotConfigPath: process.env.TOKENPILOT_CODEX_CONFIG,
  hooksConfigPath: process.env.CODEX_HOOKS_CONFIG_PATH,
}).then(async (result) => {
  const configPath = process.env.TOKENPILOT_CODEX_CONFIG ?? defaultTokenPilotConfigPath();
  const codexConfigPath = process.env.CODEX_CONFIG_PATH ?? defaultCodexConfigPath();
  const config = await loadTokenPilotCodexConfig(configPath);
  const daemon = await startDaemon(config, {
    configPath,
    codexConfigPath,
    cliPath: resolve(__dirname, "..", "dist", "cli.js"),
  });
  console.log(`Installed TokenPilot Codex routing on provider '${result.providerName}'`);
  console.log(`Codex config: ${result.codexConfigPath}`);
  console.log(`TokenPilot config: ${result.tokenPilotConfigPath}`);
  console.log(`Codex hooks config: ${result.hooksConfigPath} (${result.hooksInstalled ? "installed" : "skipped"})`);
  console.log(`Recovery MCP server: ${result.mcpServerName}`);
  console.log(`Recovery MCP startup timeout: ${result.expectedMcpStartupTimeoutSec}s`);
  console.log(`Command skills dir: ${result.commandSkillsDir}`);
  console.log(`Command skills: ${result.commandSkillNames.join(", ")}`);
  console.log(`lightrsi CLI bin: ${result.cliBinInstalled ? `installed at ${result.cliBinPath}` : `skipped (missing build at ${result.cliBinPath})`}`);
  if (!result.cliBinDirOnPath) {
    console.log(`lightrsi CLI PATH note: add ${result.cliBinDir} to PATH if 'lightrsi' is unavailable.`);
  }
  if (result.hostCliBinPath) {
    console.log(`tokenpilot-codex CLI bin: installed at ${result.hostCliBinPath}`);
  }
  console.log(`Recovery MCP probe: ${result.mcpProbe.ok ? "ok" : "degraded"}`);
  console.log(`Recovery MCP probe detail: ${result.mcpProbe.detail}`);
  console.log(`Proxy base URL: ${result.baseUrl}`);
  console.log(`Proxy status: ${daemon.started ? "started" : "already healthy"}`);
  console.log("TokenPilot will also auto-start from Codex SessionStart hooks after hooks are trusted.");
  console.log("Next step: trust the TokenPilot hooks if Codex asks for hook review.");
  console.log("Next step: start a new Codex session so SessionStart can verify or restart the local proxy.");
  console.log(`Codex default provider remains '${result.providerName}', and TokenPilot forwards upstream to '${result.activeProviderName}'.`);
  console.log("For manual troubleshooting, run: tokenpilot-codex start");
  console.log("If Codex reports hooks need review, run /hooks and trust the TokenPilot hooks.");
  if (result.mcpProbe.degraded) {
    console.log("MCP recovery is currently degraded. Core Codex runtime remains usable, but `memory_fault_recover` may be unavailable until MCP startup succeeds.");
  }
}).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
