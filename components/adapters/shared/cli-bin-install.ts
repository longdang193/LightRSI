import { existsSync } from "node:fs";
import { chmod, link, mkdir, symlink, unlink, writeFile } from "node:fs/promises";
import { join, resolve, delimiter } from "node:path";

function cliDistPathFromAdapterRoot(adapterRoot: string): string {
  const bundledPath = resolve(adapterRoot, "dist", "lightrsi.js");
  if (existsSync(bundledPath)) return bundledPath;
  return resolve(adapterRoot, "..", "..", "products", "cli", "dist", "cli.js");
}

async function createCliLink(targetPath: string, binPath: string): Promise<void> {
  try {
    await symlink(targetPath, binPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (process.platform !== "win32" || !["EACCES", "EPERM", "UNKNOWN"].includes(code ?? "")) {
      throw error;
    }
    await link(targetPath, binPath);
  }
}

export async function installCliLauncher(params: {
  targetPath: string;
  binDir: string;
  name: string;
}): Promise<string> {
  const binPath = join(params.binDir, process.platform === "win32" ? `${params.name}.cmd` : params.name);
  await mkdir(params.binDir, { recursive: true });
  await unlink(join(params.binDir, params.name)).catch(() => undefined);
  await unlink(binPath).catch(() => undefined);
  if (process.platform === "win32") {
    await writeFile(binPath, `@echo off\r\n"${process.execPath}" "${params.targetPath}" %*\r\n`, "utf8");
    return binPath;
  }
  await createCliLink(params.targetPath, binPath);
  await chmod(binPath, 0o755).catch(() => undefined);
  return binPath;
}

export async function installLightRsiCliBin(params: {
  adapterRoot: string;
  homeDir?: string;
  binDir?: string;
}): Promise<{
  installed: boolean;
  binPath: string;
  binDir: string;
  cliDistPath: string;
  binDirOnPath: boolean;
}> {
  const homeDir = params.homeDir ?? process.env.HOME ?? process.env.USERPROFILE ?? "";
  const binDir = params.binDir ?? join(homeDir, ".local", "bin");
  const cliDistPath = cliDistPathFromAdapterRoot(params.adapterRoot);
  const binPath = process.platform === "win32" ? join(binDir, "lightrsi.cmd") : join(binDir, "lightrsi");
  const binDirOnPath = String(process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .some((entry) => resolve(entry) === resolve(binDir));

  if (!existsSync(cliDistPath)) {
    return {
      installed: false,
      binPath,
      binDir,
      cliDistPath,
      binDirOnPath,
    };
  }

  await mkdir(binDir, { recursive: true });
  await chmod(cliDistPath, 0o755).catch(() => undefined);
  await installCliLauncher({ targetPath: cliDistPath, binDir, name: "lightrsi" });
  await installCliLauncher({ targetPath: cliDistPath, binDir, name: "lightmem2" });

  return {
    installed: true,
    binPath,
    binDir,
    cliDistPath,
    binDirOnPath,
  };
}
