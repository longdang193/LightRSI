import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import { analyzeReadStateCompaction } from "../src/analyzers/read-state-compaction-analyzer.ts";
import { reduceToolPayloadText } from "../src/reduction/tool-payload-router.ts";

const sampleRuns = 3;
const routeConfig = {
  stdout: { enabled: true, maxChars: 2_000, keepHeadLines: 8, keepTailLines: 8, maxPreviewChars: 120, maxItems: 8, maxDepth: 4 },
  stderr: { enabled: true, maxChars: 2_000, keepHeadLines: 8, keepTailLines: 8, maxPreviewChars: 120, maxItems: 8, maxDepth: 4 },
  json: { enabled: true, maxChars: 2_000, keepHeadLines: 8, keepTailLines: 8, maxPreviewChars: 120, maxItems: 8, maxDepth: 4 },
  blob: { enabled: true, maxChars: 2_000, keepHeadLines: 8, keepTailLines: 8, maxPreviewChars: 120, maxItems: 8, maxDepth: 4 },
};

function percentile(values, fraction) {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function readSegment(index, path, text, readWindow) {
  return {
    id: `read-${index}-output`,
    kind: "volatile",
    priority: 1,
    text,
    metadata: {
      toolName: "read",
      path,
      fieldName: "output",
      ...(readWindow ? { readWindow } : {}),
      toolPayload: { toolName: "read", path, ...(readWindow ? { readWindow } : {}) },
    },
  };
}

function buildSegments(count, mode) {
  const segments = [];
  for (let index = 0; index < count; index += 1) {
    const path = `/repo/file-${index % 17}.ts`;
    const text = `export const value${index} = ${index};\n`.repeat(24);
    segments.push(readSegment(index, path, text, mode === "interleaved" ? { offset: index * 24, limit: 24 } : undefined));
    if (mode === "mutating" && index % 5 === 4) {
      segments.push({
        id: `edit-${index}-arguments`,
        kind: "volatile",
        priority: 1,
        text: `{"path":"${path}","replace":"old","with":"new"}`,
        metadata: { toolName: "edit", path, fieldName: "arguments", toolPayload: { toolName: "edit", path } },
      });
    }
  }
  return segments;
}

function buildJson(size) {
  return JSON.stringify({ payload: "x".repeat(size) });
}

async function measure(name, input, operation) {
  const timings = [];
  let result;
  for (let run = 0; run < sampleRuns; run += 1) {
    const started = performance.now();
    result = operation(input);
    timings.push(performance.now() - started);
  }
  return {
    name,
    samples: sampleRuns,
    inputBytes: typeof input === "string" ? Buffer.byteLength(input) : input.length,
    medianMs: percentile(timings, 0.5),
    p95Ms: percentile(timings, 0.95),
    outputHash: digest(result),
    output: result,
  };
}

const analyzerResults = [];
for (const mode of ["repeated", "interleaved", "mutating"]) {
  for (const count of [20, 50, 100]) {
    const segments = buildSegments(count, mode);
    const measured = await measure(`read-state:${mode}:${count}`, segments, (value) => analyzeReadStateCompaction(value));
    const classifications = measured.output.instructions.reduce((counts, instruction) => {
      const state = String(instruction.parameters?.state ?? "unknown");
      counts[state] = (counts[state] ?? 0) + instruction.segmentIds.length;
      return counts;
    }, {});
    analyzerResults.push({ ...measured, output: undefined, instructionCount: measured.output.instructions.length, classifications });
  }
}

const routerResults = [];
for (const size of [100_000, 1_000_000, 5_000_000]) {
  const payload = buildJson(size);
  const measured = await measure(`json-route:${size}`, payload, (value) => reduceToolPayloadText(
    value,
    "json",
    routeConfig,
    undefined,
  ));
  routerResults.push({
    ...measured,
    output: undefined,
    route: measured.output.route,
    reason: measured.output.reason,
    changed: measured.output.changed,
    outputBytes: Buffer.byteLength(measured.output.text),
  });
}

console.log(JSON.stringify({ benchmark: "reduction-hotspots", node: process.version, platform: process.platform, sampleRuns, analyzerResults, routerResults }, null, 2));
