import { performance } from "node:perf_hooks";

import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import { createCodexResponsesPayloadCodec } from "../src/responses-codec.js";
import { reduceCodexRequestEnvelope } from "../src/reduction.js";

const concurrencyLevels = [1, 4, 16];
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
    triggerMinChars: 1_000_000,
  },
});

async function run(
  scenario: string,
  concurrency: number,
  createRequest: () => ReturnType<typeof createEnvelope>,
  scenarioConfig: typeof config,
): Promise<Record<string, number | string>> {
  const startedAt = performance.now();
  const before = process.memoryUsage().heapUsed;
  const results = await Promise.all(Array.from({ length: concurrency }, async () => (
    reduceCodexRequestEnvelope({
        envelope: createRequest(),
        codec,
        config: scenarioConfig,
    })
  )));
  const after = process.memoryUsage().heapUsed;
  const elapsedMs = performance.now() - startedAt;
  const outputBytes = results.reduce((total, result) => (
    total + Buffer.byteLength(JSON.stringify(result.envelope.rawPayload), "utf8")
  ), 0);
  const changedItems = results.reduce((total, result) => total + result.summary.changedItems, 0);
  const changedBlocks = results.reduce((total, result) => total + result.summary.changedBlocks, 0);
  const savedChars = results.reduce((total, result) => total + result.summary.savedChars, 0);
  return {
    scenario,
    concurrency,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    perRequestMs: Number((elapsedMs / concurrency).toFixed(2)),
    heapDeltaBytes: after - before,
    outputBytes,
    reductionChangedItems: changedItems,
    reductionChangedBlocks: changedBlocks,
    reductionSavedChars: savedChars,
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
