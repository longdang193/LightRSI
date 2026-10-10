import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const STAGE_A_ARMS = ["baseline", "caveman-full", "ponytail-full", "both-full"] as const;
export type StageAArm = typeof STAGE_A_ARMS[number];

export type GenerationPolicyBenchmarkReport = {
  experiment: string;
  mode: "mock" | "live";
  sourceSha: string;
  sourceTreeStatus: "clean" | "dirty";
  arms: Record<StageAArm, {
    correctness: "pass" | "fail" | "unavailable";
    stability: "pass" | "fail" | "unavailable";
    economics: "pass" | "fail" | "inconclusive";
    providerCalls: number;
  }>;
  liveEconomics: "inconclusive" | "pass" | "fail";
  routerPreflight: RouterSettingsPreflight;
  decision: "no-promotion" | "promotion-candidate";
};

export type RouterSettingsPreflight = {
  status: "match" | "mismatch" | "unknown";
  source: "settings_api" | "unavailable";
  settings: Record<string, boolean | string | null>;
};

const REQUIRED_ROUTER_SETTINGS = ["cavemanEnabled", "ponytailEnabled"] as const;

export function evaluateRouterSettingsPreflight(
  payload: unknown,
  expected: { cavemanEnabled: boolean; ponytailEnabled: boolean },
): RouterSettingsPreflight {
  const root = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const source = root.settings && typeof root.settings === "object" && !Array.isArray(root.settings)
    ? root.settings as Record<string, unknown>
    : root;
  const settings: RouterSettingsPreflight["settings"] = {};
  for (const key of ["cavemanEnabled", "cavemanLevel", "ponytailEnabled", "ponytailLevel", "rtk", "headroom", "pxpipe"]) {
    const value = source[key];
    if (typeof value === "boolean" || typeof value === "string" || value === null) settings[key] = value;
  }
  if (!REQUIRED_ROUTER_SETTINGS.every((key) => typeof settings[key] === "boolean")) {
    return { status: "unknown", source: "settings_api", settings };
  }
  const status = settings.cavemanEnabled === expected.cavemanEnabled
    && settings.ponytailEnabled === expected.ponytailEnabled
    ? "match"
    : "mismatch";
  return { status, source: "settings_api", settings };
}

export async function readRouterSettingsPreflight(
  baseUrl: string,
  expected = { cavemanEnabled: false, ponytailEnabled: false },
): Promise<RouterSettingsPreflight> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/u, "")}/api/settings`);
    if (!response.ok) return { status: "unknown", source: "unavailable", settings: {} };
    return evaluateRouterSettingsPreflight(await response.json(), expected);
  } catch {
    return { status: "unknown", source: "unavailable", settings: {} };
  }
}

function gitOutput(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

export function buildMockGenerationPolicyReport(): GenerationPolicyBenchmarkReport {
  const sourceSha = gitOutput(["rev-parse", "HEAD"]);
  const sourceTreeStatus = gitOutput(["status", "--porcelain"]) ? "dirty" : "clean";
  const arms = Object.fromEntries(STAGE_A_ARMS.map((arm) => [arm, {
    correctness: "pass",
    stability: "pass",
    economics: "inconclusive",
    providerCalls: 0,
  }])) as GenerationPolicyBenchmarkReport["arms"];
  return {
    experiment: "lightrsi-generation-policy-stage-a",
    mode: "mock",
    sourceSha,
    sourceTreeStatus,
    arms,
    liveEconomics: "inconclusive",
    routerPreflight: { status: "unknown", source: "unavailable", settings: {} },
    decision: "no-promotion",
  };
}

export async function runGenerationPolicyBenchmark(options?: { mock?: boolean }): Promise<GenerationPolicyBenchmarkReport> {
  if (!options?.mock) {
    throw new Error("Live benchmark requires explicit provider approval and a clean source checkpoint.");
  }
  return buildMockGenerationPolicyReport();
}

async function main(): Promise<void> {
  const mock = process.argv.includes("--mock");
  const report = await runGenerationPolicyBenchmark({ mock });
  const root = resolve(process.cwd(), "../../..");
  const manifestPath = resolve(root, "docs/benchmarks/2026-10-10-generation-policy-stage-a-manifest.json");
  const resultsPath = resolve(root, "docs/benchmarks/2026-10-10-generation-policy-stage-a-results.json");
  const reportPath = resolve(root, "docs/benchmarks/2026-10-10-generation-policy-stage-a-report.md");
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify({
    experiment: report.experiment,
    mode: report.mode,
    sourceSha: report.sourceSha,
    sourceTreeStatus: report.sourceTreeStatus,
    arms: STAGE_A_ARMS,
    liveTraffic: "not-run",
    liveEconomics: report.liveEconomics,
  }, null, 2)}\n`);
  await writeFile(resultsPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(reportPath, [
    "# LightRSI generation policy Stage A",
    "",
    `- Mode: ${report.mode}`,
    `- Source SHA: ${report.sourceSha}`,
    `- Source tree: ${report.sourceTreeStatus}`,
    "- Mock contract evidence: all arms pass correctness and stability; provider calls = 0.",
    "- Live provider economics: inconclusive; no live traffic authorized.",
    `- Router preflight: ${report.routerPreflight.status}; source=${report.routerPreflight.source}.`,
    "- Decision: no promotion.",
    "",
  ].join("\n"));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/scripts/benchmark-generation-policy.ts")) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
