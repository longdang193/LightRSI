import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile, open } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { TokenPilotCodexConfig } from "./config.js";

const execFileAsync = promisify(execFile);

export type DaemonStatus = {
  running: boolean;
  pid?: number;
  pidPath: string;
  logPath: string;
  cliPath?: string;
  detectedBy?: "pid" | "health";
  pidVerified?: boolean;
  started?: boolean;
};

type DaemonRecord = {
  pid: number;
  cliPath?: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function daemonPaths(config: TokenPilotCodexConfig): {
  pidPath: string;
  logPath: string;
} {
  return {
    pidPath: join(config.stateDir, "tokenpilot-codex.pid"),
    logPath: join(config.stateDir, "tokenpilot-codex.log"),
  };
}

function isProcessRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseDaemonRecord(raw: string): DaemonRecord {
  const [pidLine, cliPath] = raw.trim().split(/\r?\n/, 2);
  return {
    pid: Number.parseInt(pidLine ?? "", 10),
    cliPath: cliPath?.trim() || undefined,
  };
}

async function readProcessCommandLine(pid: number): Promise<string | undefined> {
  try {
    if (process.platform === "win32") {
      const command = `$p = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($p) { $p.CommandLine }`;
      return (await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
        timeout: 5_000,
        windowsHide: true,
      })).stdout.trim();
    }
    return (await readFile(`/proc/${pid}/cmdline`, "utf8")).replaceAll("\0", " ").trim();
  } catch {
    return undefined;
  }
}

async function isDaemonProcess(record: DaemonRecord): Promise<boolean> {
  if (!record.cliPath || !isProcessRunning(record.pid)) return false;
  const commandLine = await readProcessCommandLine(record.pid);
  if (!commandLine) return false;
  const normalize = (value: string) => value.replaceAll("\\", "/").toLowerCase();
  return normalize(commandLine).includes(normalize(record.cliPath)) && /(?:^|\s)serve(?:\s|$)/i.test(commandLine);
}

async function isLikelyDaemonProcess(pid: number): Promise<boolean> {
  if (!isProcessRunning(pid)) return false;
  const commandLine = await readProcessCommandLine(pid);
  return Boolean(commandLine && /cli\.js/i.test(commandLine) && /(?:^|\s)serve(?:\s|$)/i.test(commandLine));
}

async function waitForProcessExit(pid: number, timeoutMs = 3_000, intervalMs = 100): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (!isProcessRunning(pid)) return true;
    await sleep(intervalMs);
  }
  return !isProcessRunning(pid);
}

async function terminateProcess(pid: number): Promise<void> {
  if (!isProcessRunning(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  if (await waitForProcessExit(pid)) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The process may have exited between escalation attempts.
  }
  await waitForProcessExit(pid, 2_000).catch(() => undefined);
}

type ProxyHealth = {
  healthy: boolean;
  pid?: number;
};

async function readProxyHealth(config: TokenPilotCodexConfig, timeoutMs = 500): Promise<ProxyHealth> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();
  try {
    const resp = await fetch(`http://127.0.0.1:${config.proxyPort}/health`, {
      signal: controller.signal,
    });
    if (!resp.ok) return { healthy: false };
    const payload = await resp.json() as { ok?: unknown; adapter?: unknown; pid?: unknown };
    const pid = typeof payload.pid === "number" && Number.isInteger(payload.pid) && payload.pid > 0
      ? payload.pid
      : undefined;
    return {
      healthy: payload.ok === true && payload.adapter === "tokenpilot-codex",
      pid,
    };
  } catch {
    return { healthy: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function isProxyHealthy(config: TokenPilotCodexConfig, timeoutMs = 500): Promise<boolean> {
  return (await readProxyHealth(config, timeoutMs)).healthy;
}

async function isPortOccupied(port: number, timeoutMs = 500): Promise<boolean> {
  return await new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(true);
    }, timeoutMs);
    timeout.unref?.();
    socket.once("connect", () => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(true);
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      socket.destroy();
      resolve(error.code !== "ECONNREFUSED" && error.code !== "ENOTFOUND");
    });
  });
}

async function waitForPortFree(port: number, timeoutMs = 3_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (!await isPortOccupied(port, 100)) return true;
    await sleep(100);
  }
  return !await isPortOccupied(port, 100);
}

async function waitForProxyHealthy(config: TokenPilotCodexConfig, params?: {
  timeoutMs?: number;
  intervalMs?: number;
  pid?: number;
}): Promise<boolean> {
  const timeoutMs = params?.timeoutMs ?? 5_000;
  const intervalMs = params?.intervalMs ?? 150;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const health = await readProxyHealth(config);
    if (health.healthy && (!params?.pid || health.pid === params.pid)) return true;
    if (params?.pid && !isProcessRunning(params.pid)) return false;
    await sleep(intervalMs);
  }
  return false;
}

export async function readDaemonStatus(config: TokenPilotCodexConfig): Promise<DaemonStatus> {
  const { pidPath, logPath } = daemonPaths(config);
  const raw = await readFile(pidPath, "utf8").catch(() => "");
  const record = parseDaemonRecord(raw);
  const health = await readProxyHealth(config);
  if (health.healthy) {
    const persistedPid = await isLikelyDaemonProcess(record.pid) ? record.pid : undefined;
    const pid = health.pid ?? persistedPid;
    const pidVerified = pid === record.pid && (record.cliPath
      ? await isDaemonProcess(record)
      : Boolean(persistedPid));
    return {
      running: true,
      pid,
      pidPath,
      logPath,
      cliPath: record.pid === pid ? record.cliPath : undefined,
      detectedBy: "health",
      pidVerified,
    };
  }
  const { pid } = record;
  if (!existsSync(pidPath)) return { running: false, pidPath, logPath };
  if (!isProcessRunning(pid)) {
    await rm(pidPath, { force: true }).catch(() => undefined);
    return { running: false, pidPath, logPath };
  }
  return {
    running: true,
    pid,
    pidPath,
    logPath,
    detectedBy: "pid",
    pidVerified: await isDaemonProcess(record),
  };
}

async function acquireDaemonStartLock(config: TokenPilotCodexConfig): Promise<() => Promise<void>> {
  const lockPath = join(config.stateDir, "tokenpilot-codex.start.lock");
  await mkdir(dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(`${process.pid}\n`, "utf8");
      return async () => {
        await handle.close().catch(() => undefined);
        await rm(lockPath, { force: true }).catch(() => undefined);
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
      if (await waitForProxyHealthy(config, { timeoutMs: 5_000 })) return async () => undefined;
      const ownerPid = Number.parseInt(await readFile(lockPath, "utf8").catch(() => ""), 10);
      if (isProcessRunning(ownerPid)) {
        throw new Error(`TokenPilot Codex proxy start already in progress; see ${lockPath}`);
      }
      await rm(lockPath, { force: true }).catch(() => undefined);
    }
  }
  throw new Error(`TokenPilot Codex proxy start lock unavailable: ${lockPath}`);
}

export async function startDaemon(config: TokenPilotCodexConfig, params?: {
  configPath?: string;
  codexConfigPath?: string;
  nodePath?: string;
  cliPath?: string;
}): Promise<DaemonStatus> {
  const releaseStartLock = await acquireDaemonStartLock(config);
  try {
    const cliPath = params?.cliPath ?? process.argv[1];
    const current = await readDaemonStatus(config);
    if (current.running) {
      if (current.detectedBy === "health") {
        if (!current.cliPath && !current.pidVerified) return { ...current, started: false };
        const currentMatchesRequestedRuntime = current.cliPath && current.pid
          ? await isDaemonProcess({ pid: current.pid, cliPath })
          : false;
        if (currentMatchesRequestedRuntime) return { ...current, started: false };
        if (current.pid) await terminateProcess(current.pid);
        await waitForPortFree(config.proxyPort);
      }
      await rm(current.pidPath, { force: true }).catch(() => undefined);
    }
    if (await isPortOccupied(config.proxyPort)) {
      if (await waitForProxyHealthy(config, { timeoutMs: 5_000 })) {
        const { pidPath, logPath } = daemonPaths(config);
        return { running: true, pidPath, logPath, detectedBy: "health", started: false };
      }
      throw new Error(
        `TokenPilot Codex proxy port ${config.proxyPort} is already occupied but unhealthy; refusing duplicate start`,
      );
    }
    const { pidPath, logPath } = daemonPaths(config);
    await mkdir(dirname(pidPath), { recursive: true });
    const out = await open(logPath, "a");
    const err = await open(logPath, "a");
    const child = spawn(params?.nodePath ?? process.execPath, [cliPath, "serve"], {
      detached: true,
      stdio: ["ignore", out.fd, err.fd],
      env: {
        ...process.env,
        ...(params?.configPath ? { TOKENPILOT_CODEX_CONFIG: params.configPath } : {}),
        ...(params?.codexConfigPath ? { CODEX_CONFIG_PATH: params.codexConfigPath } : {}),
      },
    });
    child.unref();
    await writeFile(pidPath, `${child.pid}\n${cliPath}\n`, "utf8");
    await out.close().catch(() => undefined);
    await err.close().catch(() => undefined);
    if (!await waitForProxyHealthy(config, { pid: child.pid })) {
      if (isProcessRunning(child.pid ?? 0)) {
        try {
          process.kill(child.pid ?? 0, "SIGTERM");
        } catch {
          // The child may have exited while health probing timed out.
        }
      }
      await rm(pidPath, { force: true }).catch(() => undefined);
      throw new Error(`TokenPilot Codex proxy did not become healthy on port ${config.proxyPort}; see ${logPath}`);
    }
    return {
      running: true,
      pid: child.pid,
      pidPath,
      logPath,
      started: true,
    };
  } finally {
    await releaseStartLock();
  }
}

export async function stopDaemon(config: TokenPilotCodexConfig): Promise<DaemonStatus & { stopped: boolean }> {
  const status = await readDaemonStatus(config);
  if (!status.running || !status.pid || (status.detectedBy !== "health" && !status.pidVerified)) {
    if (status.detectedBy === "pid") await rm(status.pidPath, { force: true }).catch(() => undefined);
    return { ...status, stopped: false };
  }
  await terminateProcess(status.pid);
  await rm(status.pidPath, { force: true }).catch(() => undefined);
  return {
    ...status,
    running: false,
    stopped: true,
  };
}
