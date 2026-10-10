import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";

import { resolveCavemanPolicy, resolvePonytailPolicy } from "@lightrsi/product-surface";
import { loadProviderEnvFile, providerModelFromEnvironment } from "./context-rebase-smoke.js";

export const STAGE_A_ARMS = ["baseline", "caveman-full", "ponytail-full", "both-full"] as const;
export type StageAArm = typeof STAGE_A_ARMS[number];
export const SECURITY_FIXTURE_PROMPT = [
  "Explain the security risk of accepting an untrusted file path.",
  "Your response must begin with exactly `Security warning:`.",
  "Include three ordered mitigations: validate against an allowlist, confine the path to the intended directory, and do not execute untrusted files.",
].join(" ");

const MULTI_TURN_FIXTURE_PROMPT = "Implement a small validator change. First explain the verification command and one edge-case test for an optional field. Keep the answer actionable.";
const MULTI_TURN_FIXTURE_FOLLOW_UP = "Now give the final concise implementation checklist, retaining the verification command and the optional-field edge case.";
const LIVE_REQUEST_TIMEOUT_MS = 120_000;

const REPLAYABLE_TOOL_ITEM_TYPES = new Set([
  "function_call",
  "function_call_output",
  "custom_tool_call",
  "custom_tool_call_output",
  "computer_call",
  "computer_call_output",
  "local_shell_call",
  "local_shell_call_output",
  "shell_call",
  "shell_call_output",
  "apply_patch_call",
  "apply_patch_call_output",
  "tool_search_call",
  "tool_search_output",
]);

export function projectAssistantHistory(items: readonly unknown[]): Record<string, unknown>[] {
  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "";
    const role = typeof record.role === "string" ? record.role : "";
    const replayable = type === "message" && role === "assistant"
      || REPLAYABLE_TOOL_ITEM_TYPES.has(type);
    return replayable ? [structuredClone(record)] : [];
  });
}

export function validateSecurityFixtureOutput(output: string): boolean {
  if (!output.trimStart().startsWith("Security warning:")) return false;
  const normalized = output.toLowerCase().replace(/\s+/gu, " ");
  const negation = "(?:do not|don['’]t|never|should not|shouldn['’]t|must not|mustn['’]t)";
  if (new RegExp(`\\b${negation}\\s+validat\\w*\\b.{0,120}\\ballow[- ]?list\\b`, "u").test(normalized)
    || new RegExp(`\\b${negation}\\s+confine\\b.{0,120}\\bintended\\b.{0,80}\\bdirector\\w*\\b`, "u").test(normalized)) return false;
  const mitigationPositions = [
    /\bvalidat\w*\b.{0,120}\ballow[- ]?list\b/u,
    /\bconfine\b.{0,120}\bintended\b.{0,80}\bdirector\w*\b/u,
    /\b(?:do not|don['’]t|never)\s+execut\w*\s+untrusted\s+files?\b/u,
  ].map((pattern) => normalized.search(pattern));
  return mitigationPositions.every((position) => position >= 0)
    && mitigationPositions[0] < mitigationPositions[1]
    && mitigationPositions[1] < mitigationPositions[2];
}

export function validateMultiTurnFixtureOutput(output: string): boolean {
  const normalized = output.toLowerCase();
  const hasVerificationCommand = ["npm test", "pnpm test", "pytest", "cargo test", "go test"]
    .some((command) => normalized.includes(command));
  return hasVerificationCommand
    && normalized.includes("optional")
    && (normalized.includes("edge") || normalized.includes("omitted"));
}

export function buildLiveArmInstructions(arm: StageAArm): string {
  const blocks: string[] = [];
  if (arm === "caveman-full" || arm === "both-full") {
    blocks.push(`[LightRSI Caveman v1 / full]\n${resolveCavemanPolicy("full")}`);
  }
  if (arm === "ponytail-full" || arm === "both-full") {
    blocks.push(`[LightRSI Ponytail v1 / full]\n${resolvePonytailPolicy("full")}`);
  }
  return blocks.join("\n\n");
}

type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type GenerationPolicyLiveRepairReport = {
  experiment: string;
  mode: "live-repair";
  sourceSha: string;
  sourceTreeStatus: "clean" | "dirty";
  model: string;
  repetitions: number;
  routerPreflight: RouterSettingsPreflight;
  providerCalls: number;
  rows: Array<{
    arm: StageAArm;
    fixture: "security" | "multiturn";
    repetition: number;
    passed: boolean;
    outputChars: number;
    usage: ProviderUsage | null;
    error: string | null;
  }>;
  decision: "no-promotion";
};

type LiveRepairOptions = {
  baseUrl: string;
  routerUrl: string;
  apiKey: string;
  model: string;
  repetitions?: number;
  routerSettingsEvidencePath?: string;
  fetchImpl?: typeof fetch;
};

export async function loadCodexAuthApiKey(
  authPath = resolve(homedir(), ".codex", "auth.json"),
): Promise<string | undefined> {
  let text: string;
  try {
    text = await readFile(authPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const payload = JSON.parse(text) as Record<string, unknown>;
  return typeof payload.OPENAI_API_KEY === "string" && payload.OPENAI_API_KEY.trim()
    ? payload.OPENAI_API_KEY.trim()
    : undefined;
}

function providerUsage(value: unknown): ProviderUsage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const usage = (value as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const record = usage as Record<string, unknown>;
  const numberValue = (candidate: unknown): number | null => typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
  return {
    inputTokens: numberValue(record.input_tokens ?? record.prompt_tokens),
    outputTokens: numberValue(record.output_tokens ?? record.completion_tokens),
    totalTokens: numberValue(record.total_tokens),
  };
}

function responseText(value: Record<string, unknown>): string {
  if (typeof value.output_text === "string") return value.output_text;
  if (!Array.isArray(value.output)) return "";
  return value.output.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) return [];
      const text = (part as Record<string, unknown>).text;
      return typeof text === "string" ? [text] : [];
    });
  }).join("");
}

async function runLiveRequest(
  options: LiveRepairOptions,
  instructions: string,
  input: readonly unknown[],
): Promise<{ text: string; history: Record<string, unknown>[]; usage: ProviderUsage | null }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${options.baseUrl.replace(/\/+$/u, "")}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(LIVE_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: options.model,
      store: false,
      stream: false,
      max_output_tokens: 1800,
      instructions,
      input,
    }),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(`provider_status:${response.status}`);
  const output = Array.isArray(body.output) ? body.output : [];
  return {
    text: responseText(body),
    history: projectAssistantHistory(output),
    usage: providerUsage(body),
  };
}

export async function runGenerationPolicyLiveRepair(
  options: LiveRepairOptions,
): Promise<GenerationPolicyLiveRepairReport> {
  const sourceSha = gitOutput(["rev-parse", "HEAD"]);
  const sourceTreeStatus = gitOutput(["status", "--porcelain"]) ? "dirty" : "clean";
  if (sourceTreeStatus !== "clean") throw new Error("Live repair requires a clean source checkpoint.");
  const repetitions = options.repetitions ?? 5;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) {
    throw new Error("Live repair repetitions must be an integer from 1 through 5.");
  }
  let routerPreflight = await readRouterSettingsPreflight(options.routerUrl, undefined, options.apiKey);
  if (routerPreflight.status === "unknown" && routerPreflight.source === "unavailable" && options.routerSettingsEvidencePath) {
    const dashboardEvidence = await readRouterSettingsEvidence(options.routerSettingsEvidencePath);
    if (shouldUseRouterSettingsEvidenceFallback(routerPreflight, dashboardEvidence)) {
      routerPreflight = dashboardEvidence;
    }
  }
  if (routerPreflight.status !== "match") throw new Error(`Router preflight failed: ${routerPreflight.status}.`);
  const rows: GenerationPolicyLiveRepairReport["rows"] = [];
  let providerCalls = 0;
  for (const arm of STAGE_A_ARMS) {
    const instructions = buildLiveArmInstructions(arm);
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      try {
        providerCalls += 1;
        const security = await runLiveRequest(options, instructions, [{ role: "user", content: SECURITY_FIXTURE_PROMPT }]);
        rows.push({ arm, fixture: "security", repetition, passed: validateSecurityFixtureOutput(security.text), outputChars: security.text.length, usage: security.usage, error: null });
      } catch (error) {
        rows.push({ arm, fixture: "security", repetition, passed: false, outputChars: 0, usage: null, error: error instanceof Error ? error.message : "provider_error" });
      }
      try {
        providerCalls += 1;
        const first = await runLiveRequest(options, instructions, [{ role: "user", content: MULTI_TURN_FIXTURE_PROMPT }]);
        providerCalls += 1;
        const second = await runLiveRequest(options, instructions, [
          { role: "user", content: MULTI_TURN_FIXTURE_PROMPT },
          ...first.history,
          { role: "user", content: MULTI_TURN_FIXTURE_FOLLOW_UP },
        ]);
        rows.push({ arm, fixture: "multiturn", repetition, passed: validateMultiTurnFixtureOutput(second.text), outputChars: second.text.length, usage: second.usage, error: null });
      } catch (error) {
        rows.push({ arm, fixture: "multiturn", repetition, passed: false, outputChars: 0, usage: null, error: error instanceof Error ? error.message : "provider_error" });
      }
    }
  }
  return { experiment: "lightrsi-generation-policy-stage-a-repair", mode: "live-repair", sourceSha, sourceTreeStatus, model: options.model, repetitions, routerPreflight, providerCalls, rows, decision: "no-promotion" };
}

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
  source: "settings_api" | "dashboard_evidence" | "unavailable";
  settings: Record<string, boolean | string | null>;
  limitation?: string;
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
  apiKey?: string,
): Promise<RouterSettingsPreflight> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/u, "")}/api/settings`, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : undefined,
    });
    if (!response.ok) return { status: "unknown", source: "unavailable", settings: {} };
    return evaluateRouterSettingsPreflight(await response.json(), expected);
  } catch {
    return { status: "unknown", source: "unavailable", settings: {} };
  }
}

export async function readRouterSettingsEvidence(path: string): Promise<RouterSettingsPreflight> {
  try {
    const payload = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    if (payload.source !== "9router_dashboard" || payload.status !== 200) {
      return { status: "unknown", source: "unavailable", settings: {} };
    }
    const evaluated = evaluateRouterSettingsPreflight(payload, { cavemanEnabled: false, ponytailEnabled: false });
    return {
      ...evaluated,
      source: "dashboard_evidence",
      limitation: "machine-readable settings authentication unavailable; using existing authenticated dashboard evidence",
    };
  } catch {
    return { status: "unknown", source: "unavailable", settings: {} };
  }
}

export function shouldUseRouterSettingsEvidenceFallback(
  primary: RouterSettingsPreflight,
  evidence: RouterSettingsPreflight,
): boolean {
  return primary.status === "unknown"
    && primary.source === "unavailable"
    && evidence.status !== "unknown";
}

function gitOutput(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

export function buildMockGenerationPolicyReport(): GenerationPolicyBenchmarkReport {
  const sourceSha = gitOutput(["rev-parse", "HEAD"]);
  const sourceTreeStatus = gitOutput(["status", "--porcelain"]) ? "dirty" : "clean";
  const arms = Object.fromEntries(STAGE_A_ARMS.map((arm) => [arm, {
    correctness: "unavailable",
    stability: "unavailable",
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
  if (process.argv.includes("--live-repair")) {
    const initialCwd = process.env.INIT_CWD?.trim() || process.cwd();
    await loadProviderEnvFile(process.env.LIGHTRSI_BENCHMARK_CREDENTIALS_FILE?.trim() || resolve(initialCwd, ".env"));
    const baseUrl = process.env.LIGHTRSI_BENCHMARK_BASE_URL?.trim() || process.env.OPENAI_BASE_URL?.trim();
    const routerUrl = process.env.LIGHTRSI_BENCHMARK_ROUTER_URL?.trim();
    const apiKey = process.env.OPENAI_API_KEY?.trim() || await loadCodexAuthApiKey();
    const model = process.env.LIGHTRSI_BENCHMARK_MODEL?.trim() || providerModelFromEnvironment();
    if (!baseUrl || !routerUrl || !apiKey || !model) {
      throw new Error("Live repair requires LIGHTRSI_BENCHMARK_BASE_URL, LIGHTRSI_BENCHMARK_ROUTER_URL, OPENAI_API_KEY, and a model.");
    }
    const report = await runGenerationPolicyLiveRepair({
      baseUrl,
      routerUrl,
      apiKey,
      model,
      routerSettingsEvidencePath: process.env.LIGHTRSI_BENCHMARK_ROUTER_SETTINGS_EVIDENCE?.trim(),
    });
    const outputPath = process.env.LIGHTRSI_BENCHMARK_OUTPUT?.trim()
      || resolve(tmpdir(), "lightrsi-generation-policy-stage-a-repair.json");
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ ...report, outputPath }, null, 2)}\n`);
    return;
  }
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
    "- Mock contract evidence: correctness and stability are unavailable in this report; provider calls = 0.",
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
