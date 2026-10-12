import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import {
  drainEventTraceQueue,
  enqueueEventTrace,
  getEventTraceQueueStats,
} from "@lightrsi/host-adapter";
import { appendCodexContextHistoryJournalCompletion, appendCodexRequestJournalEntry } from "../src/context-history/index.js";
import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import { createCodexResponsesPayloadCodec } from "../src/responses-codec.js";
import { reduceCodexRequestEnvelope } from "../src/reduction.js";

const concurrencyLevels = [1, 4, 8] as const;
const historySizes = [4, 32, 128] as const;
const warmupRuns = 3;
const sampleRuns = 15;
const codec = createCodexResponsesPayloadCodec();
const config = normalizeTokenPilotCodexConfig({
  reduction: {
    triggerMinChars: 256,
    maxToolChars: 800,
    passes: {
      readStateCompaction: false,
      toolPayloadTrim: true,
      htmlSlimming: false,
      execOutputTruncation: true,
      agentsStartupOptimization: false,
    },
  },
});

function percentile(values: number[], percentage: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentage / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function createRequest(historySize: number, stream: boolean): ReturnType<typeof codec.decodeRequest> {
  return codec.decodeRequest({
    model: "tokenpilot/gpt-5.4-mini",
    stream,
    input: Array.from({ length: historySize }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "tool",
      type: index % 2 === 0 ? undefined : "function_call_output",
      content: index % 2 === 0 ? `request ${index}` : undefined,
      output: index % 2 === 0 ? undefined : `HEAD\n${"line\n".repeat(32)}`,
    })),
  });
}

async function runScenario(historySize: number, stream: boolean, concurrency: number): Promise<Record<string, unknown>> {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-hot-path-"));
  const preparationSamples: number[] = [];
  const durableSamples: number[] = [];
  const fingerprints: string[] = [];
  let failures = 0;
  try {
    for (let sample = 0; sample < warmupRuns; sample += 1) {
      await Promise.all(Array.from({ length: concurrency }, async () => {
        const reduced = await reduceCodexRequestEnvelope({ envelope: createRequest(historySize, stream), codec, config });
        await appendCodexRequestJournalEntry({
          stateDir,
          sessionId: `warmup-${historySize}-${stream}-${sample}`,
          requestId: `request-${sample}`,
          payload: reduced.envelope.rawPayload as Record<string, unknown>,
          status: "pending",
        });
      }));
    }
    for (let sample = 0; sample < sampleRuns; sample += 1) {
      const results = await Promise.all(Array.from({ length: concurrency }, async (_, index) => {
        const sessionId = `sample-${historySize}-${stream}-${sample}-${index}`;
        const requestId = `request-${sample}-${index}`;
        const preparationStartedAt = performance.now();
        const reduced = await reduceCodexRequestEnvelope({ envelope: createRequest(historySize, stream), codec, config });
        const dispatchBoundaryAt = performance.now();
        const requestPayload = reduced.envelope.rawPayload as Record<string, unknown>;
        await appendCodexRequestJournalEntry({ stateDir, sessionId, requestId, payload: requestPayload, status: "pending" });
        const durableStartedAt = performance.now();
        await appendCodexContextHistoryJournalCompletion({
          request: { stateDir, sessionId, requestId, payload: requestPayload, status: "completed" },
          response: {
            stateDir,
            sessionId,
            requestId,
            response: { id: `response-${sample}-${index}`, status: "completed", output: [] },
            status: "completed",
          },
        });
        return {
          preparationMs: dispatchBoundaryAt - preparationStartedAt,
          durableMs: performance.now() - durableStartedAt,
          fingerprint: digest(requestPayload),
        };
      }));
      preparationSamples.push(...results.map((result) => result.preparationMs));
      durableSamples.push(...results.map((result) => result.durableMs));
      fingerprints.push(...results.map((result) => result.fingerprint));
    }
    const beforeTraceStats = getEventTraceQueueStats();
    void enqueueEventTrace(stateDir, { stage: "benchmark_optional_trace" });
    await drainEventTraceQueue();
    const afterTraceStats = getEventTraceQueueStats();
    return {
      historySize,
      stream,
      concurrency,
      warmupRuns,
      sampleRuns,
      failures,
      preparationP50Ms: Number(percentile(preparationSamples, 50).toFixed(3)),
      preparationP95Ms: Number(percentile(preparationSamples, 95).toFixed(3)),
      durableP50Ms: Number(percentile(durableSamples, 50).toFixed(3)),
      durableP95Ms: Number(percentile(durableSamples, 95).toFixed(3)),
      fingerprint: digest(fingerprints),
      traceQueue: {
        queuedRecordsAfterDrain: afterTraceStats.queuedRecords,
        queuedBytesAfterDrain: afterTraceStats.queuedBytes,
        droppedRecordsDelta: afterTraceStats.droppedRecords - beforeTraceStats.droppedRecords,
        drainFailuresDelta: afterTraceStats.drainFailures - beforeTraceStats.drainFailures,
      },
      phaseObservations: {
        T0: "unavailable",
        T1: "unavailable",
        T2: "unavailable",
        T3: "unavailable",
        T4: "unavailable",
        T5: "unavailable",
        T6: "exact: journal completion boundary",
        T7: "unavailable",
        T8: "exact: shutdown drain observation",
        derived: {
          preparationMs: "dispatchBoundaryAt - preparationStartedAt; benchmark-only preparation interval",
          durableMs: "durable completion end - durable completion start; journal-only interval",
        },
      },
      counters: {
        serializationCount: "unavailable",
        cloneBytes: "unavailable",
        journalOpenCount: "unavailable",
        journalSyncCount: "unavailable",
      },
    };
  } catch {
    failures += 1;
    throw new Error(`benchmark scenario failed: history=${historySize} stream=${stream} concurrency=${concurrency}`);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const results: Record<string, unknown>[] = [];
  for (const historySize of historySizes) {
    for (const stream of [false, true]) {
      for (const concurrency of concurrencyLevels) {
        results.push(await runScenario(historySize, stream, concurrency));
      }
    }
  }
  console.log(JSON.stringify({
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    results,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
