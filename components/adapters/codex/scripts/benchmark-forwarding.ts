import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import { createCodexResponsesPayloadCodec } from "../src/responses-codec.js";
import { reduceCodexRequestEnvelope } from "../src/reduction.js";

const concurrencyLevels = [1, 4, 16];
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

function createEnvelope() {
  return codec.decodeRequest({
    model: "tokenpilot/gpt-5.4-mini",
    stream: true,
    input: Array.from({ length: 80 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "tool",
      type: index % 2 === 0 ? undefined : "function_call_output",
      output: index % 2 === 0 ? undefined : `HEAD\n${"line\n".repeat(180)}`,
      content: index % 2 === 0 ? `request ${index}` : undefined,
    })),
  });
}

function createNoOpEnvelope() {
  return codec.decodeRequest({
    model: "tokenpilot/gpt-5.4-mini",
    stream: true,
    input: [{ role: "user", content: "short request" }],
  });
}

function createNestedEnvelope() {
  return codec.decodeRequest({
    model: "tokenpilot/gpt-5.4-mini",
    stream: true,
    input: [{ role: "user", content: "request" }, {
      role: "tool",
      type: "function_call_output",
      content: [{ type: "output_text", text: `HEAD\n${"line\n".repeat(180)}` }],
    }],
  });
}

const noOpConfig = normalizeTokenPilotCodexConfig({
  reduction: {
    ...config.reduction,
    triggerMinChars: Number.MAX_SAFE_INTEGER,
  },
});

function percentile(values: number[], percentage: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((percentage / 100) * sorted.length) - 1);
  return sorted[index];
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "tokenpilotSyntheticSessionId")
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

async function run(
  scenario: string,
  concurrency: number,
  createRequest: () => ReturnType<typeof createEnvelope>,
  scenarioConfig: typeof config,
): Promise<Record<string, unknown>> {
  for (let index = 0; index < warmupRuns; index += 1) {
    await Promise.all(Array.from({ length: concurrency }, () => reduceCodexRequestEnvelope({
      envelope: createRequest(),
      codec,
      config: scenarioConfig,
    })));
  }

  const requestSamples: number[] = [];
  const retainedHeapSamples: number[] = [];
  let outputBytes = 0;
  let changedItems = 0;
  let changedBlocks = 0;
  let savedChars = 0;
  const digests: string[] = [];
  const beforeGc = process.memoryUsage().heapUsed;
  for (let sample = 0; sample < sampleRuns; sample += 1) {
    if (typeof global.gc === "function") global.gc();
    const before = process.memoryUsage().heapUsed;
    const results = await Promise.all(Array.from({ length: concurrency }, async () => {
      const startedAt = performance.now();
      const result = await reduceCodexRequestEnvelope({
        envelope: createRequest(),
        codec,
        config: scenarioConfig,
      });
      requestSamples.push(performance.now() - startedAt);
      return result;
    }));
    const after = process.memoryUsage().heapUsed;
    retainedHeapSamples.push(Math.max(0, after - before));
    outputBytes += results.reduce((total, result) => (
      total + Buffer.byteLength(JSON.stringify(result.envelope.rawPayload ?? result.envelope), "utf8")
    ), 0);
    changedItems += results.reduce((total, result) => total + result.summary.changedItems, 0);
    changedBlocks += results.reduce((total, result) => total + result.summary.changedBlocks, 0);
    savedChars += results.reduce((total, result) => total + result.summary.savedChars, 0);
    digests.push(...results.map((result) => digest(result.envelope.rawPayload ?? result.envelope)));
  }

  let noOpReferencePreserved = 0;
  const noOpReferenceSamples = Math.max(3, concurrency);
  for (let index = 0; index < noOpReferenceSamples; index += 1) {
    const envelope = createEnvelope();
    const result = await reduceCodexRequestEnvelope({ envelope, codec, config: noOpConfig });
    if (result.envelope === envelope) noOpReferencePreserved += 1;
  }

  const explicitGc = typeof global.gc === "function" ? global.gc.bind(global) : undefined;
  const explicitGcAvailable = explicitGc !== undefined;
  explicitGc?.();
  const afterGc = process.memoryUsage().heapUsed;
  return {
    scenario,
    concurrency,
    warmupRuns,
    sampleRuns,
    elapsedMs: Number((requestSamples.reduce((sum, value) => sum + value, 0) / concurrency).toFixed(2)),
    perRequestMs: Number((percentile(requestSamples, 50)).toFixed(2)),
    p50RequestMs: Number(percentile(requestSamples, 50).toFixed(3)),
    p95RequestMs: Number(percentile(requestSamples, 95).toFixed(3)),
    outputBytes,
    semanticPayloadDigest: digest(digests),
    reductionChangedItems: changedItems,
    reductionChangedBlocks: changedBlocks,
    reductionSavedChars: savedChars,
    changedItems,
    changedBlocks,
    noOpReferencePreserved,
    noOpReferenceSamples,
    allocationProxyBytes: Math.max(0, afterGc - beforeGc),
    heapDeltaBytes: Math.max(0, afterGc - beforeGc),
    gc: {
      explicitGcAvailable,
      traceGcRequested: process.execArgv.includes("--trace-gc"),
      postGcRetainedHeapBytes: Math.max(0, afterGc - beforeGc),
      sampleRetainedHeapP50Bytes: Number(percentile(retainedHeapSamples, 50).toFixed(0)),
      sampleRetainedHeapP95Bytes: Number(percentile(retainedHeapSamples, 95).toFixed(0)),
    },
    physicalUpstreamAttempts: 0,
    journalCostMs: 0,
  };
}

async function main(): Promise<void> {
  const scenarios = [
    ["long-history", createEnvelope, config],
    ["below-threshold", createNoOpEnvelope, noOpConfig],
    ["nested-block", createNestedEnvelope, config],
  ] as const;
  for (const [scenario, createRequest, scenarioConfig] of scenarios) {
    for (const concurrency of concurrencyLevels) {
      console.log(JSON.stringify(await run(scenario, concurrency, createRequest, scenarioConfig)));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
