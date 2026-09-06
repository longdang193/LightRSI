import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWindowsWatchdogScript,
  buildWindowsWatchdogTaskArguments,
} from "../src/windows-watchdog.js";

test("builds a hidden Node watchdog launcher without PowerShell", () => {
  const script = buildWindowsWatchdogScript({
    nodePath: "C:\\Program Files\\nodejs\\node.exe",
    cliPath: "C:\\Users\\tester\\LightRSI\\dist\\cli.js",
    codexConfigPath: "C:\\Users\\tester\\.codex\\config.toml",
    tokenPilotConfigPath: "C:\\Users\\tester\\.codex\\tokenpilot.json",
  });

  assert.doesNotMatch(script, /powershell/i);
  assert.match(script, /CreateObject\("WScript\.Shell"\)/);
  assert.match(script, /Environment\("Process"\)\("CODEX_CONFIG_PATH"\)/);
  assert.match(script, /Environment\("Process"\)\("TOKENPILOT_CODEX_CONFIG"\)/);
  assert.match(script, /shell\.Run.*node\.exe.*cli\.js.*start", 0, False/);
  assert.equal(
    buildWindowsWatchdogTaskArguments("C:\\Users\\tester\\LightRSI\\tokenpilot-codex-watchdog.vbs"),
    '//B //NoLogo "C:\\Users\\tester\\LightRSI\\tokenpilot-codex-watchdog.vbs"',
  );
});
