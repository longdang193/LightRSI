import { chmod, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { CliHostId } from "../../products/cli/src/hosts/registry.js";
import { installCliLauncher } from "./cli-bin-install.js";

function hostCliDistPathFromAdapterRoot(adapterRoot: string): string {
  return resolve(adapterRoot, "dist", "cli.js");
}

function hostCliBinName(host: CliHostId): string {
  if (host === "codex") return "tokenpilot-codex";
  if (host === "claude-code") return "tokenpilot-claude-code";
  throw new Error(`unsupported host CLI bin install: ${host}`);
}

export async function installHostCliBin(params: {
  adapterRoot: string;
  host: "codex" | "claude-code";
  binDir: string;
}): Promise<{
  installed: boolean;
  binPath: string;
  binName: string;
  cliDistPath: string;
}> {
  const binName = hostCliBinName(params.host);
  const cliDistPath = hostCliDistPathFromAdapterRoot(params.adapterRoot);

  await mkdir(params.binDir, { recursive: true });
  await chmod(cliDistPath, 0o755).catch(() => undefined);
  const binPath = await installCliLauncher({
    targetPath: cliDistPath,
    binDir: params.binDir,
    name: binName,
  });

  return {
    installed: true,
    binPath,
    binName,
    cliDistPath,
  };
}
