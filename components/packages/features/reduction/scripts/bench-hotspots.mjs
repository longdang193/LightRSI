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
  for (const count of [1_000, 2_000, 4_000, 8_000]) {
    const segments = buildSegments(count, mode);
    const measured = await measure(`read-state:${mode}:${count}`, segments, (value) => analyzeReadStateCompaction(value));
    const classifications = measured.output.instructions.reduce((counts, instruction) => {
      const state = String(instruction.parameters?.state ?? "unknown");
      counts[state] = (counts[state] ?? 0) + instruction.segmentIds.length;
      return counts;
    }, {});
    analyzerResults.push({
      ...measured,
      output: undefined,
      eventCount: segments.length,
      instructionCount: measured.output.instructions.length,
      classifications,
    });
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

const commandFixtures = [
  {
    fixtureId: "tap-failure-flood-v1",
    kind: "stderr",
    text: [
      "TAP version 13",
      ...Array.from({ length: 120 }, (_, index) => [
        `not ok ${index + 1} - auth test ${index % 4}`,
        "  error: expected 401, received 200",
        `  location: 'test/auth-${index % 4}.test.ts:${index + 1}:3'`,
      ].join("\n")),
      "1..120",
      "# tests 120",
      "# pass 0",
      "# fail 120",
    ].join("\n"),
    hint: { toolName: "node", payloadKind: "stderr", execution: { commandFamily: "node_test", completion: "complete", exitCode: 1 } },
  },
  {
    fixtureId: "tsc-diagnostic-flood-v1",
    kind: "stderr",
    text: Array.from({ length: 120 }, (_, index) => `src/file-${index % 8}.ts(${index + 1},2): error TS2322: Type 'string' is not assignable to type 'number'.`).join("\n") + "\nFound 120 errors.",
    hint: { toolName: "tsc", payloadKind: "stderr", execution: { commandFamily: "typescript_diagnostics", completion: "complete", exitCode: 2 } },
  },
];

const commandAwareResults = [];
for (const fixture of commandFixtures) {
  for (const [arm, operation] of [
    ["raw", (value) => value],
    ["generic", (value) => reduceToolPayloadText(value, fixture.kind, routeConfig)],
    ["command-aware", (value) => reduceToolPayloadText(value, fixture.kind, routeConfig, fixture.hint)],
  ]) {
    const measured = await measure(`${fixture.fixtureId}:${arm}`, fixture.text, operation);
    const outputText = arm === "raw" ? measured.output : measured.output.text;
    const reduction = arm === "raw" ? undefined : measured.output;
    commandAwareResults.push({
      fixtureId: fixture.fixtureId,
      arm,
      samples: measured.samples,
      inputBytes: measured.inputBytes,
      outputBytes: Buffer.byteLength(outputText),
      medianMs: measured.medianMs,
      p95Ms: measured.p95Ms,
      outputHash: measured.outputHash,
      route: arm === "raw" ? "raw" : reduction.route,
      reason: arm === "raw" ? "raw_forward" : reduction.reason,
      changed: arm !== "raw" && reduction.changed,
      evidenceCount: (outputText.match(/not ok|TS\d+/g) ?? []).length,
    });
  }
}

console.log(JSON.stringify({
  benchmark: "reduction-hotspots",
  node: process.version,
  platform: process.platform,
  commit: process.env.GIT_COMMIT ?? "unknown",
  sampleRuns,
  analyzerResults,
  routerResults,
  commandAwareResults,
}, null, 2));
