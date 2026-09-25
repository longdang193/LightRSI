import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { resolveArchiveAcrossSessionsByArtifactRef } from "@lightrsi/artifact-store";
import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import { appendCodexRequestJournalEntry } from "../src/context-history/index.js";
import { applyBeforeCallReductionToPayload } from "../src/reduction.js";

type Arm = "full" | "compact";

type BenchmarkCase = {
  id: string;
  payload: Record<string, unknown>;
  expectedRecoveryNotice: boolean;
  taskNeedle: string;
  restartCumulative?: boolean;
};

type ArmMeasurement = {
  inputChars: number;
  durationMs: number;
  recoveryNotice: boolean;
  exactRecovery: boolean;
  taskCorrectness: boolean;
  projectionReusedItems: number;
};

export type AdmissionBenchmarkReport = {
  mode: "mock";
  repetitions: number;
  status: "inconclusive";
  liveProviderClaim: false;
  cases: Array<{
    id: string;
    repetitions: Array<{
      repetition: number;
      full: ArmMeasurement;
      compact: ArmMeasurement;
      correctness: "pass" | "fail";
    }>;
    full: { inputChars: number; durationMs: number };
    compact: {
      inputChars: number;
      durationMs: number;
      recoveryNotice: boolean;
      exactRecovery: boolean;
      taskCorrectness: boolean;
      projectionReusedItems: number;
    };
    correctness: "pass" | "fail";
  }>;
  evidenceCompleteness: {
    providerUsage: "missing";
    cacheEvidence: "missing";
    archiveRecovery: "observed" | "missing";
  };
};

function longOutput(label: string): string {
  return `${label}\n${Array.from({ length: 160 }, (_, index) => `${label} line ${index}`).join("\n")}`;
}

function cases(): BenchmarkCase[] {
  return [
    {
      id: "sufficient-compact-evidence",
      expectedRecoveryNotice: true,
      taskNeedle: "READ",
      payload: {
        model: "tokenpilot/gpt-5.4-mini",
        input: [{ type: "function_call_output", call_id: "read-1", output: longOutput("READ") }],
      },
    },
    {
      id: "essential-omitted-evidence",
      expectedRecoveryNotice: true,
      taskNeedle: "ESSENTIAL",
      payload: {
        model: "tokenpilot/gpt-5.4-mini",
        input: [{ type: "function_call_output", call_id: "read-2", output: longOutput("ESSENTIAL") }],
      },
    },
    {
      id: "small-output",
      expectedRecoveryNotice: false,
      taskNeedle: "small",
      payload: {
        model: "tokenpilot/gpt-5.4-mini",
        input: [{ type: "function_call_output", call_id: "read-3", output: "small" }],
      },
    },
    {
      id: "restart-cumulative-resubmission",
      expectedRecoveryNotice: true,
      taskNeedle: "RESTART",
      restartCumulative: true,
      payload: {
        model: "tokenpilot/gpt-5.4-mini",
        input: [
          { type: "function_call_output", call_id: "read-4", output: longOutput("RESTART") },
          { type: "function_call_output", call_id: "read-5", output: longOutput("CUMULATIVE") },
        ],
      },
    },
    {
      id: "large-explicit-file-range-read",
      expectedRecoveryNotice: true,
      taskNeedle: "RANGE",
      payload: {
        model: "tokenpilot/gpt-5.4-mini",
        input: [{ type: "function_call_output", call_id: "read-6", output: longOutput("RANGE") }],
      },
    },
  ];
}

function fullConfig(stateDir: string) {
  return normalizeTokenPilotCodexConfig({ stateDir, modules: { reduction: false } });
}

function compactConfig(stateDir: string) {
  return normalizeTokenPilotCodexConfig({
    stateDir,
    reduction: {
      triggerMinChars: 256,
      maxToolChars: 400,
      passes: {
        readStateCompaction: false,
        toolPayloadTrim: true,
        htmlSlimming: false,
        execOutputTruncation: false,
        agentsStartupOptimization: false,
      },
    },
  });
}

function inputChars(payload: Record<string, unknown>): number {
  return JSON.stringify(payload.input ?? []).length;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function recoveryRefs(payload: Record<string, unknown>): string[] {
  return [...new Set(JSON.stringify(payload.input ?? []).match(/artifact:v2:[a-f0-9]{64}/g) ?? [])];
}

function originalStrings(payload: Record<string, unknown>): Set<string> {
  const strings = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      strings.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (value && typeof value === "object") {
      for (const entry of Object.values(value)) visit(entry);
    }
  };
  visit(payload.input);
  return strings;
}

async function exactRecovery(payload: Record<string, unknown>, originalPayload: Record<string, unknown>, stateDir: string): Promise<boolean> {
  const refs = recoveryRefs(payload);
  if (refs.length === 0) return true;
  const originals = originalStrings(originalPayload);
  const archives = await Promise.all(refs.map((artifactRef) => resolveArchiveAcrossSessionsByArtifactRef(artifactRef, stateDir)));
  return archives.every((resolved) => resolved !== null && originals.has(resolved.archive.originalText));
}

async function runArm(arm: Arm, stateDir: string, fixture: BenchmarkCase, repetition: number) {
  const originalPayload = structuredClone(fixture.payload) as any;
  let payload = structuredClone(fixture.payload) as any;
  const forwardingScope = {
    promptCacheKey: `benchmark-${fixture.id}`,
    endpointId: "benchmark",
  };
  const startedAt = performance.now();
  let projectionReusedItems = 0;
  if (arm === "compact") {
    const summary = await applyBeforeCallReductionToPayload({
      payload,
      sessionId: `benchmark-${fixture.id}-${repetition}`,
      config: compactConfig(stateDir),
      forwardingScope,
    });
    projectionReusedItems = summary.projectionReusedItems;
    if (fixture.restartCumulative) {
      await appendCodexRequestJournalEntry({
        stateDir,
        sessionId: `benchmark-${fixture.id}-${repetition}`,
        requestId: `benchmark-seed-${repetition}`,
        payload: originalPayload,
        acceptedInputItems: structuredClone(payload.input),
        forwardingScope,
        status: "completed",
      });
      const replayPayload = structuredClone(originalPayload) as any;
      replayPayload.input.push({
        type: "function_call_output",
        call_id: "read-restart-continuation",
        output: longOutput("CONTINUATION"),
      });
      const replay = await applyBeforeCallReductionToPayload({
        payload: replayPayload,
        sessionId: `benchmark-${fixture.id}-${repetition}`,
        config: compactConfig(stateDir),
        requestId: `benchmark-replay-${repetition}`,
        forwardingScope,
      });
      payload = replayPayload;
      projectionReusedItems = replay.projectionReusedItems;
    }
  }
  const recoverySourcePayload = structuredClone(originalPayload) as any;
  if (fixture.restartCumulative) {
    recoverySourcePayload.input.push({
      type: "function_call_output",
      call_id: "read-restart-continuation",
      output: longOutput("CONTINUATION"),
    });
  }
  const recoveryNotice = JSON.stringify(payload.input).includes("Full content omitted to save context");
  return {
    inputChars: inputChars(payload),
    durationMs: performance.now() - startedAt,
    recoveryNotice,
    exactRecovery: arm === "full" ? true : await exactRecovery(payload, recoverySourcePayload, stateDir),
    taskCorrectness: JSON.stringify(payload.input).includes(fixture.taskNeedle),
    projectionReusedItems,
  };
}

export async function runAdmissionBenchmark(repetitions = 5): Promise<AdmissionBenchmarkReport> {
  if (process.env.LIGHTRSI_BENCHMARK_MODE !== "mock") {
    throw new Error("benchmark-admission requires LIGHTRSI_BENCHMARK_MODE=mock");
  }
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-admission-benchmark-"));
  const previousStateDir = process.env.LIGHTRSI_STATE_DIR;
  process.env.LIGHTRSI_STATE_DIR = stateDir;
  try {
    const results = [];
    for (const fixture of cases()) {
      const measurements = [];
      for (let repetition = 0; repetition < repetitions; repetition += 1) {
        const [full, compact] = await Promise.all([
          runArm("full", stateDir, fixture, repetition),
          runArm("compact", stateDir, fixture, repetition),
        ]);
        const correctness: "pass" | "fail" = compact.recoveryNotice === fixture.expectedRecoveryNotice
          && compact.exactRecovery
          && compact.taskCorrectness
          && full.taskCorrectness
          ? "pass"
          : "fail";
        measurements.push({ full, compact, correctness });
      }
      const last = measurements.at(-1)!;
      results.push({
        id: fixture.id,
        repetitions: measurements.map((measurement, repetition) => ({
          repetition,
          full: measurement.full,
          compact: measurement.compact,
          correctness: measurement.correctness,
        })),
        full: {
          inputChars: median(measurements.map((measurement) => measurement.full.inputChars)),
          durationMs: median(measurements.map((measurement) => measurement.full.durationMs)),
        },
        compact: {
          inputChars: median(measurements.map((measurement) => measurement.compact.inputChars)),
          durationMs: median(measurements.map((measurement) => measurement.compact.durationMs)),
          recoveryNotice: measurements.some((measurement) => measurement.compact.recoveryNotice),
          exactRecovery: measurements.every((measurement) => measurement.compact.exactRecovery),
          taskCorrectness: measurements.every((measurement) => measurement.compact.taskCorrectness),
          projectionReusedItems: Math.max(...measurements.map((measurement) => measurement.compact.projectionReusedItems)),
        },
        correctness: measurements.every((entry) => entry.correctness === "pass") ? "pass" as const : "fail" as const,
      });
    }
    return {
      mode: "mock",
      repetitions,
      status: "inconclusive",
      liveProviderClaim: false,
      cases: results,
      evidenceCompleteness: {
        providerUsage: "missing",
        cacheEvidence: "missing",
        archiveRecovery: results.every((entry) => entry.compact.exactRecovery) ? "observed" : "missing",
      },
    };
  } finally {
    if (previousStateDir === undefined) delete process.env.LIGHTRSI_STATE_DIR;
    else process.env.LIGHTRSI_STATE_DIR = previousStateDir;
    await rm(stateDir, { recursive: true, force: true });
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/benchmark-admission.ts")) {
  runAdmissionBenchmark().then((report) => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
