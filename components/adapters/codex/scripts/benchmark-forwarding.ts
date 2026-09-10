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

async function run(concurrency: number): Promise<Record<string, number>> {
  const startedAt = performance.now();
  const before = process.memoryUsage().heapUsed;
  const results = await Promise.all(Array.from({ length: concurrency }, async () => (
    reduceCodexRequestEnvelope({
      envelope: createEnvelope(),
      codec,
      config,
    })
  )));
  const after = process.memoryUsage().heapUsed;
  const elapsedMs = performance.now() - startedAt;
  const outputBytes = results.reduce((total, result) => (
    total + Buffer.byteLength(JSON.stringify(result.envelope.rawPayload), "utf8")
  ), 0);
  return {
    concurrency,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    perRequestMs: Number((elapsedMs / concurrency).toFixed(2)),
    heapDeltaBytes: after - before,
    outputBytes,
    physicalUpstreamAttempts: 0,
    journalCostMs: 0,
  };
}

async function main(): Promise<void> {
  for (const concurrency of concurrencyLevels) {
    console.log(JSON.stringify(await run(concurrency)));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
