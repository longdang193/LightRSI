#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import {
  defaultCodexConfigPath,
  defaultTokenPilotConfigPath,
  loadTokenPilotCodexConfig,
} from "../src/config.js";
import { startDaemon } from "../src/daemon.js";
import { installCodexTokenPilot } from "../src/install.js";

const execFileAsync = promisify(execFile);

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function installWindowsWatchdog(params: {
  cliPath: string;
  codexConfigPath: string;
  tokenPilotConfigPath: string;
}): Promise<void> {
  if (process.platform !== "win32") return;

  const taskCommand = [
    `$env:CODEX_CONFIG_PATH = ${quotePowerShell(params.codexConfigPath)}`,
    `$env:TOKENPILOT_CODEX_CONFIG = ${quotePowerShell(params.tokenPilotConfigPath)}`,
    `& ${quotePowerShell(process.execPath)} ${quotePowerShell(params.cliPath)} start`,
  ].join("; ");
  const encodedTaskCommand = Buffer.from(taskCommand, "utf16le").toString("base64");
  const script = [
    '$taskName = "TokenPilot Codex Proxy"',
    '$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ("-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand " + $env:TOKENPILOT_CODEX_TASK_COMMAND)',
    '$logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\\$env:USERNAME"',
    '$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1) -RepetitionDuration (New-TimeSpan -Days 3650)',
    '$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\\$env:USERNAME" -LogonType Interactive -RunLevel Limited',
    '$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable',
    'Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($logon, $repeat) -Principal $principal -Settings $settings -Force | Out-Null',
  ].join("; ");

  await execFileAsync("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ], {
    windowsHide: true,
    env: {
      ...process.env,
      TOKENPILOT_CODEX_TASK_COMMAND: encodedTaskCommand,
    },
  });
}

installCodexTokenPilot({
  codexConfigPath: process.env.CODEX_CONFIG_PATH,
  tokenPilotConfigPath: process.env.TOKENPILOT_CODEX_CONFIG,
  hooksConfigPath: process.env.CODEX_HOOKS_CONFIG_PATH,
}).then(async (result) => {
  const configPath = process.env.TOKENPILOT_CODEX_CONFIG ?? defaultTokenPilotConfigPath();
  const codexConfigPath = process.env.CODEX_CONFIG_PATH ?? defaultCodexConfigPath();
  const config = await loadTokenPilotCodexConfig(configPath);
  const cliPath = resolve(__dirname, "..", "dist", "cli.js");
  const daemon = await startDaemon(config, {
    configPath,
    codexConfigPath,
    cliPath,
  });
  try {
    await installWindowsWatchdog({
      cliPath,
      codexConfigPath,
      tokenPilotConfigPath: configPath,
    });
  } catch (error) {
    console.warn(`Windows watchdog registration skipped: ${error instanceof Error ? error.message : String(error)}`);
  }
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
  console.log("TokenPilot will auto-recover from a per-user Windows watchdog and Codex SessionStart hooks.");
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
