import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import { applyBeforeCallReductionToPayload } from "../src/reduction.js";

type Arm = "full" | "compact";

type BenchmarkCase = {
  id: string;
  payload: Record<string, unknown>;
  expectedRecovery: boolean;
};

export type AdmissionBenchmarkReport = {
  mode: "mock";
  repetitions: number;
  status: "inconclusive";
  liveProviderClaim: false;
  cases: Array<{
    id: string;
    full: { inputChars: number; durationMs: number };
    compact: { inputChars: number; durationMs: number; recoveryObserved: boolean };
    correctness: "pass" | "fail";
  }>;
  evidenceCompleteness: {
    providerUsage: "missing";
    cacheEvidence: "missing";
    recoveryEvidence: "observed" | "missing";
  };
};

function longOutput(label: string): string {
  return `${label}\n${Array.from({ length: 160 }, (_, index) => `${label} line ${index}`).join("\n")}`;
}

function cases(): BenchmarkCase[] {
  return [
    {
      id: "sufficient-compact-evidence",
      expectedRecovery: true,
      payload: {
        model: "tokenpilot/gpt-5.4-mini",
        input: [{ type: "function_call_output", call_id: "read-1", output: longOutput("READ") }],
      },
    },
    {
      id: "essential-omitted-evidence",
      expectedRecovery: true,
      payload: {
        model: "tokenpilot/gpt-5.4-mini",
        input: [{ type: "function_call_output", call_id: "read-2", output: longOutput("ESSENTIAL") }],
      },
    },
    {
      id: "small-output",
      expectedRecovery: false,
      payload: {
        model: "tokenpilot/gpt-5.4-mini",
        input: [{ type: "function_call_output", call_id: "read-3", output: "small" }],
      },
    },
    {
      id: "restart-cumulative-resubmission",
      expectedRecovery: true,
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
      expectedRecovery: true,
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

async function runArm(arm: Arm, stateDir: string, fixture: BenchmarkCase, repetition: number) {
  const payload = structuredClone(fixture.payload) as any;
  const startedAt = performance.now();
  let recoveryObserved = false;
  if (arm === "compact") {
    const summary = await applyBeforeCallReductionToPayload({
      payload,
      sessionId: `benchmark-${fixture.id}-${repetition}`,
      config: compactConfig(stateDir),
    });
    recoveryObserved = summary.changedBlocks > 0
      && JSON.stringify(payload.input).includes("Full content omitted to save context");
  }
  return {
    inputChars: inputChars(payload),
    durationMs: performance.now() - startedAt,
    recoveryObserved,
    payload,
  };
}

export async function runAdmissionBenchmark(repetitions = 5): Promise<AdmissionBenchmarkReport> {
  if (process.env.LIGHTRSI_BENCHMARK_MODE !== "mock") {
    throw new Error("benchmark-admission requires LIGHTRSI_BENCHMARK_MODE=mock");
  }
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-admission-benchmark-"));
  try {
    const results = [];
    for (const fixture of cases()) {
      const measurements = [];
      for (let repetition = 0; repetition < repetitions; repetition += 1) {
        const [full, compact] = await Promise.all([
          runArm("full", stateDir, fixture, repetition),
          runArm("compact", stateDir, fixture, repetition),
        ]);
        const correctness: "pass" | "fail" = fixture.expectedRecovery === compact.recoveryObserved || !fixture.expectedRecovery
          ? "pass"
          : "fail";
        measurements.push({ full, compact, correctness });
      }
      const last = measurements.at(-1)!;
      results.push({
        id: fixture.id,
        full: { inputChars: last.full.inputChars, durationMs: last.full.durationMs },
        compact: {
          inputChars: last.compact.inputChars,
          durationMs: last.compact.durationMs,
          recoveryObserved: last.compact.recoveryObserved,
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
        recoveryEvidence: results.some((entry) => entry.compact.recoveryObserved) ? "observed" : "missing",
      },
    };
  } finally {
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
