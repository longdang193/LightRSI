import { createHash } from "node:crypto";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  archiveContent,
  readArchive,
  renderRecoveredArchive,
  resolveArchiveAcrossSessionsByArtifactRef,
} from "../src/index.ts";

const samples = 50;

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
    result = await operation(index);
    timings.push(performance.now() - started);
  }
  return {
    medianMs: percentile(timings, 0.5),
    p95Ms: percentile(timings, 0.95),
    result,
  };
}

async function buildFixture(stateDir, entryCount) {
  const sessionId = `session-${entryCount}`;
  const archiveDir = join(stateDir, "tokenpilot", "tool-result-archives", sessionId);
  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    const originalText = `entry ${index}\n${"needle ".repeat(40)}\n${"line\n".repeat(40)}`;
    entries.push({
      originalText,
      ...(await archiveContent({
        sessionId,
        segmentId: `segment-${index}`,
        sourcePass: "bench",
        toolName: "read",
        dataKey: `bench:${entryCount}:${index}`,
        originalText,
        archiveDir,
      })),
    });
  }
  return { archiveDir, entries };
}

async function verifyLookup(result, expectedText) {
  if (!result?.archive || result.archive.originalText !== expectedText) {
    throw new Error("benchmark lookup returned incorrect archive content");
  }
}

async function measureLookupScenario({ name, stateDir, entryCount, artifactRef, expectedText, prepare }) {
  await prepare?.();
  const coldStarted = performance.now();
  const coldResult = await resolveArchiveAcrossSessionsByArtifactRef(artifactRef, stateDir);
  const coldMs = performance.now() - coldStarted;
  await verifyLookup(coldResult, expectedText);
  const measured = await measure(async () => {
    await prepare?.();
    const result = await resolveArchiveAcrossSessionsByArtifactRef(artifactRef, stateDir);
    await verifyLookup(result, expectedText);
    return result;
  });
  return {
    scenario: name,
    artifactRefDigest: digest(artifactRef),
    firstReadMs: coldMs,
    medianMs: measured.medianMs,
    p95Ms: measured.p95Ms,
    archiveEntries: entryCount,
    correctness: true,
  };
}

const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-recovery-bench-"));
try {
  const results = [];
  for (const entryCount of [1, 100, 1_000]) {
    const fixture = await buildFixture(stateDir, entryCount);
    const early = fixture.entries[0];
    const late = fixture.entries[entryCount - 1];
    const target = fixture.entries[Math.floor(entryCount / 2)];
    const targetDigest = target.artifactRef.slice("artifact:v2:".length);
    const artifactLookupPath = join(
      dirname(fixture.archiveDir),
      "artifact-lookups",
      targetDigest.slice(0, 2),
      `${targetDigest}.json`,
    );

    const indexedEarly = await measureLookupScenario({
      name: "indexed-early",
      stateDir,
      entryCount,
      artifactRef: early.artifactRef,
      expectedText: early.originalText,
      prepare: async () => {},
    });
    const indexedLate = await measureLookupScenario({
      name: "indexed-late",
      stateDir,
      entryCount,
      artifactRef: late.artifactRef,
      expectedText: late.originalText,
      prepare: async () => {},
    });
    const missingIndex = await measureLookupScenario({
      name: "missing-index-rebuild",
      stateDir,
      entryCount,
      artifactRef: target.artifactRef,
      expectedText: target.originalText,
      prepare: async () => {
        await unlink(artifactLookupPath).catch(() => {});
      },
    });
    const staleIndex = await measureLookupScenario({
      name: "stale-index-rebuild",
      stateDir,
      entryCount,
      artifactRef: target.artifactRef,
      expectedText: target.originalText,
      prepare: async () => {
        await writeFile(artifactLookupPath, JSON.stringify([join(fixture.archiveDir, "missing.json")]), "utf8");
      },
    });
    const missingArtifact = await measure(async () => {
      const result = await resolveArchiveAcrossSessionsByArtifactRef(`artifact:v2:${"f".repeat(64)}`, stateDir);
      if (result !== null) throw new Error("benchmark missing artifact unexpectedly resolved");
      return true;
    });
    const range = await measure(async () => {
      const lookup = await resolveArchiveAcrossSessionsByArtifactRef(target.artifactRef, stateDir);
      await verifyLookup(lookup, target.originalText);
      return renderRecoveredArchive({
        artifactRef: target.artifactRef,
        archive: lookup.archive,
        startLine: 1,
        endLine: 3,
      });
    });
    const search = await measure(async () => {
      const lookup = await resolveArchiveAcrossSessionsByArtifactRef(target.artifactRef, stateDir);
      await verifyLookup(lookup, target.originalText);
      return renderRecoveredArchive({
        artifactRef: target.artifactRef,
        archive: lookup.archive,
        mode: "search",
        query: "needle",
        contextLines: 1,
        maxMatches: 5,
      });
    });

    results.push({
      entryCount,
      targetPosition: Math.floor(entryCount / 2),
      sourceBytes: Buffer.byteLength(target.originalText),
      lookup: [indexedEarly, indexedLate, missingIndex, staleIndex],
      missingArtifact: {
        medianMs: missingArtifact.medianMs,
        p95Ms: missingArtifact.p95Ms,
        correctness: true,
      },
      range: {
        medianMs: range.medianMs,
        p95Ms: range.p95Ms,
        returnedChars: range.result.text.length,
        correctness: range.result.details.recovered === true,
      },
      search: {
        medianMs: search.medianMs,
        p95Ms: search.p95Ms,
        returnedChars: search.result.text.length,
        scanComplete: search.result.details.scanComplete,
        correctness: search.result.details.scanComplete === true,
      },
    });
  }
  console.log(JSON.stringify({ benchmark: "recovery-lookup", samples, node: process.version, results }, null, 2));
} finally {
  await rm(stateDir, { recursive: true, force: true });
}
