import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { completeCodexSessionTurn } from "../src/session-state.js";

const concurrencyLevels = [1, 4, 8] as const;
const warmupRuns = 10;
const sampleRuns = 50;

type Mode = "same-session" | "independent-sessions";

type ModeResult = {
  mode: Mode;
  samples: number;
  failures: number;
  firstError: string | null;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
};

function percentile(values: number[], percentage: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentage / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

async function runBatch(
  stateDir: string,
  mode: Mode,
  concurrency: number,
  batch: number,
): Promise<number> {
  const startedAt = performance.now();
  await Promise.all(Array.from({ length: concurrency }, (_, index) => {
    const sessionId = mode === "same-session" ? "benchmark-shared-session" : `benchmark-session-${batch}-${index}`;
    const responseId = `${mode}-${concurrency}-${batch}-${index}`;
    return completeCodexSessionTurn(stateDir, {
      patch: {
        latestResponseId: responseId,
        latestModel: "benchmark-model",
        latestUpstreamProvider: "benchmark-provider",
      },
      binding: {
        sessionId,
        responseId,
        model: "benchmark-model",
        requestChars: 1024,
        responseChars: 2048,
        assistantChars: 1536,
        toolCallCount: 0,
        stream: false,
        updatedAt: new Date().toISOString(),
      },
    });
  }));
  return performance.now() - startedAt;
}

async function runMode(mode: Mode, concurrency: number): Promise<ModeResult> {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-session-contention-"));
  const durations: number[] = [];
  const errors: string[] = [];
  try {
    for (let index = 0; index < warmupRuns; index += 1) {
      await runBatch(stateDir, mode, concurrency, index).catch((error: unknown) => {
        errors.push(error instanceof Error ? error.message : String(error));
      });
    }
    for (let index = 0; index < sampleRuns; index += 1) {
      try {
        durations.push(await runBatch(stateDir, mode, concurrency, warmupRuns + index));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
  return {
    mode,
    samples: durations.length,
    failures: errors.length,
    firstError: errors[0] ?? null,
    minMs: Number(Math.min(...durations).toFixed(3)),
    p50Ms: Number(percentile(durations, 50).toFixed(3)),
    p95Ms: Number(percentile(durations, 95).toFixed(3)),
    p99Ms: Number(percentile(durations, 99).toFixed(3)),
    maxMs: Number(Math.max(...durations).toFixed(3)),
  };
}

async function main(): Promise<void> {
  const results: Array<ModeResult & { concurrency: number }> = [];
  for (const concurrency of concurrencyLevels) {
    for (const mode of ["same-session", "independent-sessions"] as const) {
      results.push({ concurrency, ...(await runMode(mode, concurrency)) });
    }
  }
  console.log(JSON.stringify({
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    warmupRuns,
    sampleRuns,
    results,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
