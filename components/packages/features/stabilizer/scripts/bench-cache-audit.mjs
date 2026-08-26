import { appendFile, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import {
  appendCacheAuditRecord,
  readRecentCacheAuditRecordsForSession,
} from "../src/cache-audit-store.ts";
import { JSONL_TAIL_READ_CHUNK_BYTES } from "@lightrsi/host-adapter";

const sessionId = "bench-session";
const sampleCounts = [100, 1_000, 10_000, 100_000];
const sampleRuns = 7;

function sessionPath(stateDir) {
  return join(stateDir, "cache-audit-sessions", `${encodeURIComponent(sessionId)}.jsonl`);
}

function record(index) {
  return {
    at: new Date(0 + index).toISOString(),
    sessionId,
    model: "bench-model",
    stream: false,
    stablePrefixFingerprint: `fingerprint-${index % 2}`,
    stablePrefix: {
      schemaVersion: 1,
      stableCore: [{ key: "instructions", role: "system", source: "instructions", text: "sha256:bench", textLength: 5 }],
      semiStableContext: [],
    },
    entropyFindings: [],
    driftReasons: [],
    originalRequestPromptCacheKey: null,
    requestPromptCacheKey: `request-key-${index % 2}`,
    responsePromptCacheKey: null,
    cachedInputTokens: 0,
    inputTokens: 10,
    cacheWriteTokens: 0,
    usage: null,
    status: 200,
    baselineKind: "identity",
  };
}

function percentile(values, fraction) {
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

async function seed(stateDir, count) {
  const path = sessionPath(stateDir);
  await mkdir(join(stateDir, "cache-audit-sessions"), { recursive: true });
  await writeFile(path, `${Array.from({ length: count }, (_, index) => JSON.stringify(record(index))).join("\n")}\n`, "utf8");
}

async function measure(count) {
  const readTimes = [];
  const appendTimes = [];
  let bytesRead = 0;
  let orderingOk = true;

  for (let run = 0; run < sampleRuns; run += 1) {
    const readDir = await mkdtemp(join(tmpdir(), "lightrsi-cache-audit-read-"));
    try {
      await seed(readDir, count);
      const started = performance.now();
      const entries = await readRecentCacheAuditRecordsForSession(readDir, sessionId, 32);
      readTimes.push(performance.now() - started);
      const fileStats = await stat(sessionPath(readDir));
      bytesRead = fileStats.size;
      orderingOk = orderingOk && entries[0]?.at === new Date(count - 1).toISOString();
    } finally {
      await rm(readDir, { recursive: true, force: true });
    }

    const appendDir = await mkdtemp(join(tmpdir(), "lightrsi-cache-audit-append-"));
    try {
      await seed(appendDir, count);
      const started = performance.now();
      await appendCacheAuditRecord({
        stateDir: appendDir,
        snapshot: record(count),
        status: 200,
      });
      appendTimes.push(performance.now() - started);
    } finally {
      await rm(appendDir, { recursive: true, force: true });
    }
  }

  const malformedDir = await mkdtemp(join(tmpdir(), "lightrsi-cache-audit-malformed-"));
  let malformedTailReturnsEmpty = false;
  try {
    await seed(malformedDir, Math.min(count, 4));
    await appendFile(sessionPath(malformedDir), "{malformed final record}\n", "utf8");
    malformedTailReturnsEmpty = (await readRecentCacheAuditRecordsForSession(malformedDir, sessionId, 32)).length === 0;
  } finally {
    await rm(malformedDir, { recursive: true, force: true });
  }

  return {
    count,
    samples: sampleRuns,
    bytesInSessionFile: bytesRead,
    tailReadBudgetBytes: Math.min(bytesRead, JSONL_TAIL_READ_CHUNK_BYTES),
    readMedianMs: percentile(readTimes, 0.5),
    readP95Ms: percentile(readTimes, 0.95),
    appendMedianMs: percentile(appendTimes, 0.5),
    appendP95Ms: percentile(appendTimes, 0.95),
    orderingOk,
    malformedTailReturnsEmpty,
  };
}

const results = [];
for (const count of sampleCounts) results.push(await measure(count));

const base = results[0];
const largest = results.at(-1);
console.log(JSON.stringify({
  benchmark: "cache-audit",
  node: process.version,
  platform: process.platform,
  sampleRuns,
  results,
  growth: {
    recordGrowth: largest.count / base.count,
    appendMedianGrowth: largest.appendMedianMs / base.appendMedianMs,
    appendP95Growth: largest.appendP95Ms / base.appendP95Ms,
    readP95Growth: largest.readP95Ms / base.readP95Ms,
  },
}, null, 2));
