export type WindowsWatchdogScriptParams = {
  nodePath: string;
  cliPath: string;
  codexConfigPath: string;
  tokenPilotConfigPath: string;
};

export function buildWindowsWatchdogTaskArguments(scriptPath: string): string {
  return `//B //NoLogo "${scriptPath}"`;
}

function quoteVbs(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteCommandPath(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function buildWindowsWatchdogScript(params: WindowsWatchdogScriptParams): string {
  const command = [
    quoteCommandPath(params.nodePath),
    quoteCommandPath(params.cliPath),
    "start",
  ].join(" ");

  return [
    "Option Explicit",
    "Dim shell",
    "Set shell = CreateObject(\"WScript.Shell\")",
    `shell.Environment(\"Process\")(\"CODEX_CONFIG_PATH\") = ${quoteVbs(params.codexConfigPath)}`,
    `shell.Environment(\"Process\")(\"TOKENPILOT_CODEX_CONFIG\") = ${quoteVbs(params.tokenPilotConfigPath)}`,
    `shell.Run ${quoteVbs(command)}, 0, False`,
    "",
  ].join("\r\n");
}
