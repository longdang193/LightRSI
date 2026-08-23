import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { reserveUnusedPort } from "@lightrsi/host-adapter";
import { daemonPaths, startDaemon, stopDaemon } from "../src/daemon.js";
import { normalizeTokenPilotCodexConfig, writeTokenPilotCodexConfig } from "../src/config.js";

async function waitForHealth(port: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`fixture did not become healthy on port ${port}`);
}

test("startDaemon replaces a stale pid when the configured proxy port is unhealthy", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightrsi-codex-daemon-"));
  let dummy: ReturnType<typeof spawn> | undefined;
  try {
    const proxyPort = await reserveUnusedPort();
    const stateDir = join(dir, "state");
    const configPath = join(dir, "tokenpilot.json");
    const config = normalizeTokenPilotCodexConfig({
      proxyPort,
      stateDir,
      upstreamProvider: "OPENAI",
      upstream: {
        name: "OpenAI",
        baseUrl: "http://127.0.0.1:9",
        wireApi: "responses",
        requiresOpenAIAuth: true,
      },
    });
    await mkdir(stateDir, { recursive: true });
    await writeTokenPilotCodexConfig(config, configPath);

    dummy = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    const { pidPath, logPath } = daemonPaths(config);
    await writeFile(pidPath, `${dummy.pid}\n`, "utf8");

    const cliPath = join(process.cwd(), "dist", "cli.js");
    const result = await startDaemon(config, {
      configPath,
      cliPath,
    });

    assert.equal(result.running, true);
    assert.equal(result.started, true);
    assert.notEqual(result.pid, dummy.pid);
    const persistedPid = Number.parseInt((await readFile(pidPath, "utf8")).trim(), 10);
    assert.equal(persistedPid, result.pid);
    assert.match(await readFile(logPath, "utf8"), /proxy listening at http:\/\/127\.0\.0\.1:/);

    await stopDaemon(config);
  } finally {
    if (dummy?.pid) {
      try {
        process.kill(dummy.pid, "SIGKILL");
      } catch {
        // The stale process should already be gone.
      }
    }
    await rm(dir, { recursive: true, force: true });
  }
});


test("startDaemon serializes concurrent starts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightmem2-codex-daemon-lock-"));
  try {
    const proxyPort = await reserveUnusedPort();
    const stateDir = join(dir, "state");
    const configPath = join(dir, "tokenpilot.json");
    const config = normalizeTokenPilotCodexConfig({
      proxyPort,
      stateDir,
      upstreamProvider: "OPENAI",
      upstream: {
        name: "OpenAI",
        baseUrl: "http://127.0.0.1:9",
        wireApi: "responses",
        requiresOpenAIAuth: true,
      },
    });
    await mkdir(stateDir, { recursive: true });
    await writeTokenPilotCodexConfig(config, configPath);
    const cliPath = join(process.cwd(), "dist", "cli.js");
    const results = await Promise.all([
      startDaemon(config, { configPath, cliPath }),
      startDaemon(config, { configPath, cliPath }),
    ]);
    assert.equal(results.filter((result) => result.started).length, 1);
    assert.equal(results.every((result) => result.running), true);
    assert.equal(results[0].pid, results[1].pid);
    await stopDaemon(config);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test("startDaemon reuses a healthy listener when its pid file is stale", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightmem2-codex-daemon-reuse-"));
  let dummy: ReturnType<typeof spawn> | undefined;
  try {
    const proxyPort = await reserveUnusedPort();
    const stateDir = join(dir, "state");
    const configPath = join(dir, "tokenpilot.json");
    const config = normalizeTokenPilotCodexConfig({ proxyPort, stateDir });
    await mkdir(stateDir, { recursive: true });
    await writeTokenPilotCodexConfig(config, configPath);
    const { pidPath } = daemonPaths(config);
    await writeFile(pidPath, "2147483647\n", "utf8");
    dummy = spawn(process.execPath, [
      "-e",
      `const http=require('node:http');const s=http.createServer((q,r)=>{if(q.url==='/health'){r.writeHead(200);r.end('ok');}else{r.writeHead(404);r.end();}});s.listen(${proxyPort},'127.0.0.1');setInterval(()=>{},1000);`,
    ], { stdio: "ignore" });
    await waitForHealth(proxyPort);

    const result = await startDaemon(config, { configPath, cliPath: join(process.cwd(), "dist", "cli.js") });

    assert.equal(result.running, true);
    assert.equal(result.started, false);
    assert.equal(result.detectedBy, "health");
  } finally {
    if (dummy?.pid) {
      try { process.kill(dummy.pid, "SIGKILL"); } catch {}
    }
    await rm(dir, { recursive: true, force: true });
  }
});
