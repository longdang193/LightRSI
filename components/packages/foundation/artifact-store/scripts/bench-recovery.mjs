import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  archiveContent,
  renderRecoveredArchive,
  resolveArchiveAcrossSessionsByArtifactRef,
} from "../src/index.ts";

const samples = 5;

function percentile(values, fraction) {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

async function measure(operation) {
  const timings = [];
  let result;
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    result = await operation();
    timings.push(performance.now() - started);
  }
  return {
    medianMs: percentile(timings, 0.5),
    p95Ms: percentile(timings, 0.95),
    result,
  };
}

const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-recovery-bench-"));
try {
  const results = [];
  for (const entryCount of [1, 10, 100, 1_000]) {
    const archiveDir = join(stateDir, "tokenpilot", "tool-result-archives", `session-${entryCount}`);
    let artifactRef;
    let originalText = "";
    for (let index = 0; index < entryCount; index += 1) {
      originalText = `entry ${index}\n${"needle ".repeat(40)}\n${"line\n".repeat(40)}`;
      const location = await archiveContent({
        sessionId: `session-${entryCount}`,
        segmentId: `segment-${index}`,
        sourcePass: "bench",
        toolName: "read",
        dataKey: `bench:${entryCount}:${index}`,
        originalText,
        archiveDir,
      });
      artifactRef ??= location.artifactRef;
    }

    const lookup = await measure(() => resolveArchiveAcrossSessionsByArtifactRef(artifactRef, stateDir));
    const range = await measure(() => renderRecoveredArchive({
      artifactRef,
      archive: lookup.result.archive,
      startLine: 1,
      endLine: 3,
    }));
    const search = await measure(() => renderRecoveredArchive({
      artifactRef,
      archive: lookup.result.archive,
      mode: "search",
      query: "needle",
      contextLines: 1,
      maxMatches: 5,
    }));
    results.push({
      entryCount,
      artifactRefDigest: digest(artifactRef),
      lookupMedianMs: lookup.medianMs,
      lookupP95Ms: lookup.p95Ms,
      rangeMedianMs: range.medianMs,
      searchMedianMs: search.medianMs,
      sourceBytes: Buffer.byteLength(originalText),
      rangeOutputChars: range.result.text.length,
      searchOutputChars: search.result.text.length,
      scanComplete: search.result.details.scanComplete,
    });
  }
  console.log(JSON.stringify({ benchmark: "recovery-lookup", node: process.version, results }, null, 2));
} finally {
  await rm(stateDir, { recursive: true, force: true });
}
