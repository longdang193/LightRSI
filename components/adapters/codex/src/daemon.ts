import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile, open } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import type { TokenPilotCodexConfig } from "./config.js";

export type DaemonStatus = {
  running: boolean;
  pid?: number;
  pidPath: string;
  logPath: string;
  detectedBy?: "pid" | "health";
  started?: boolean;
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

async function isProxyHealthy(config: TokenPilotCodexConfig, timeoutMs = 500): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();
  try {
    const resp = await fetch(`http://127.0.0.1:${config.proxyPort}/health`, {
      signal: controller.signal,
    });
    return resp.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
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

async function waitForProxyHealthy(config: TokenPilotCodexConfig, params?: {
  timeoutMs?: number;
  intervalMs?: number;
  pid?: number;
}): Promise<boolean> {
  const timeoutMs = params?.timeoutMs ?? 5_000;
  const intervalMs = params?.intervalMs ?? 150;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (await isProxyHealthy(config)) return true;
    if (params?.pid && !isProcessRunning(params.pid)) return false;
    await sleep(intervalMs);
  }
  return false;
}

export async function readDaemonStatus(config: TokenPilotCodexConfig): Promise<DaemonStatus> {
  const { pidPath, logPath } = daemonPaths(config);
  if (!existsSync(pidPath)) {
    if (await isProxyHealthy(config)) {
      return { running: true, pidPath, logPath, detectedBy: "health" };
    }
    return { running: false, pidPath, logPath };
  }
  const raw = await readFile(pidPath, "utf8").catch(() => "");
  const pid = Number.parseInt(raw.trim(), 10);
  if (!isProcessRunning(pid)) {
    await rm(pidPath, { force: true }).catch(() => undefined);
    return { running: false, pidPath, logPath };
  }
  return { running: true, pid, pidPath, logPath, detectedBy: "pid" };
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
    const current = await readDaemonStatus(config);
    if (current.running) {
      const healthy = await isProxyHealthy(config);
      if (healthy) return { ...current, started: false };
      if (current.pid) {
        await terminateProcess(current.pid);
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
    const cliPath = params?.cliPath ?? process.argv[1];
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
    await writeFile(pidPath, `${child.pid}\n`, "utf8");
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
  if (!status.running || !status.pid) return { ...status, stopped: false };
  await terminateProcess(status.pid);
  await rm(status.pidPath, { force: true }).catch(() => undefined);
  return {
    ...status,
    running: false,
    stopped: true,
  };
}
