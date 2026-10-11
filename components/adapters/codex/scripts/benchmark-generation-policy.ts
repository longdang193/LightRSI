import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { dirname, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";

import {
  drainEventTraceQueue,
  enqueueEventTrace,
  eventTracePath,
  prepareBeforeCallWithReductionSummary,
  readRecentJsonlEntries,
  type HostRequestEnvelope,
} from "@lightrsi/host-adapter";
import {
  compileGenerationPolicy,
  resolveCavemanPolicy,
  resolvePonytailPolicy,
  type GenerationPolicyLevel,
} from "@lightrsi/product-surface";
import { loadProviderEnvFile, providerModelFromEnvironment } from "./context-rebase-smoke.js";
import { defaultTokenPilotConfigPath, loadTokenPilotCodexConfig } from "../src/config.js";
import { createCodexResponsesPayloadCodec } from "../src/responses-codec.js";

export const STAGE_A_ARMS = ["baseline", "caveman-full", "ponytail-full", "both-full"] as const;
export type StageAArm = typeof STAGE_A_ARMS[number];
export const STAGE_A_WORKLOAD = {
  fixtures: ["prose", "code", "json", "tool-history", "security", "detail", "multiturn", "artifact"] as const,
  requestShape: "responses",
  repetitions: 5,
} as const;
export type StageAFixture = typeof STAGE_A_WORKLOAD.fixtures[number];
type StageAWorkload = {
  fixtures: typeof STAGE_A_WORKLOAD.fixtures;
  requestShape: "responses";
  repetitions: number;
};

const FAILURE_OUTPUT_PREVIEW_LIMIT = 2048;
const FAILURE_OUTPUT_TRUNCATION_MARKER = "\n...[truncated]";

export function captureFailedOutput(output: string): string {
  if (output.length <= FAILURE_OUTPUT_PREVIEW_LIMIT) return output;
  return output.slice(0, FAILURE_OUTPUT_PREVIEW_LIMIT - FAILURE_OUTPUT_TRUNCATION_MARKER.length)
    + FAILURE_OUTPUT_TRUNCATION_MARKER;
}

type LocalOverheadBenchmarkReport = {
  mode: "local-overhead";
  warmup: number;
  samples: number;
  records: number;
  metrics: Record<string, { p50Ms: number; p95Ms: number }>;
  equivalence: {
    traceRecords: number;
    tailRecords: number;
    newestTailIndex: number;
    preDispatchStable: boolean;
  };
};

function argumentValue(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function summarizeMilliseconds(values: number[]): { p50Ms: number; p95Ms: number } {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (rank: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * rank))];
  return {
    p50Ms: Number(percentile(0.5).toFixed(3)),
    p95Ms: Number(percentile(0.95).toFixed(3)),
  };
}

async function measureAsync(
  warmup: number,
  samples: number,
  operation: () => Promise<void>,
): Promise<{ p50Ms: number; p95Ms: number }> {
  for (let index = 0; index < warmup; index += 1) await operation();
  const values: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    await operation();
    values.push(performance.now() - started);
  }
  return summarizeMilliseconds(values);
}

function localOverheadEnvelope(): HostRequestEnvelope {
  return {
    session: {
      host: { hostId: "local-overhead", displayName: "Local overhead" },
      sessionId: "local-overhead",
      sessionMode: "single",
    },
    model: "local-overhead",
    stream: false,
    instructions: "Answer the local benchmark request with the required detail.",
    messages: [{ role: "user", content: "Measure local pre-dispatch work." } as never],
    tools: [{ type: "function", name: "noop", parameters: { type: "object" } }],
    rawPayload: { model: "local-overhead", stream: false },
  };
}

export async function runLocalOverheadBenchmark(options?: {
  warmup?: number;
  samples?: number;
  records?: number;
}): Promise<LocalOverheadBenchmarkReport> {
  const warmup = options?.warmup ?? 20;
  const samples = options?.samples ?? 100;
  const records = options?.records ?? 256;
  const stateDir = await mkdtemp(resolve(tmpdir(), "lightrsi-local-overhead-"));
  const tailPath = resolve(stateDir, "tail.jsonl");
  const codec = createCodexResponsesPayloadCodec();
  let preDispatchStable = true;
  try {
    for (let index = 0; index < records; index += 1) {
      await enqueueEventTrace(stateDir, { stage: "seed", index });
    }
    await drainEventTraceQueue();
    await writeFile(tailPath, `${Array.from({ length: records }, (_, index) => JSON.stringify({ index })).join("\n")}\n`, "utf8");
  const traceEnqueue = await measureAsync(warmup, samples, async () => {
    await enqueueEventTrace(stateDir, { stage: "measure" });
  });
  const traceBatchEnqueue = await measureAsync(warmup, samples, async () => {
    await Promise.all(Array.from({ length: 16 }, (_, index) => enqueueEventTrace(stateDir, { stage: "batch", index })));
    await drainEventTraceQueue();
  });
    await drainEventTraceQueue();
    const tailRead = await measureAsync(warmup, samples, async () => {
      const entries = await readRecentJsonlEntries<{ index?: number }>(tailPath, records);
      if (entries.length !== records) throw new Error(`tail equivalence failed: expected ${records}, got ${entries.length}`);
    });
    const preDispatch = await measureAsync(warmup, samples, async () => {
      const prepared = await prepareBeforeCallWithReductionSummary({
        envelope: structuredClone(localOverheadEnvelope()),
        codec,
        prepareStablePrefix: (next) => next,
        applyBeforeCallReduction: async ({ envelope }) => ({ envelope, summary: null }),
      });
      preDispatchStable = preDispatchStable && prepared.diagnostics.stablePrefixApplied === false;
    });
    await drainEventTraceQueue();
    const traceLines = (await readFile(eventTracePath(stateDir), "utf8")).trim().split(/\r?\n/u).filter(Boolean);
    const tailEntries = await readRecentJsonlEntries<{ index?: number }>(tailPath, records);
    return {
      mode: "local-overhead",
      warmup,
      samples,
      records,
      metrics: { traceEnqueue, traceBatchEnqueue, tailRead, preDispatch },
      equivalence: {
        traceRecords: traceLines.length,
        tailRecords: tailEntries.length,
        newestTailIndex: typeof tailEntries[0]?.index === "number" ? tailEntries[0].index : -1,
        preDispatchStable,
      },
    };
  } finally {
    await drainEventTraceQueue();
    await rm(stateDir, { recursive: true, force: true });
  }
}
export const STAGE_B_ARMS = [
  "caveman-lite",
  "caveman-full",
  "caveman-ultra",
  "ponytail-lite",
  "ponytail-full",
  "ponytail-ultra",
] as const;
export type StageBArm = typeof STAGE_B_ARMS[number];
export const SECURITY_FIXTURE_PROMPT = [
  "Explain the security risk of accepting an untrusted file path.",
  "Your response must begin with exactly `Security warning:`.",
  "Include three ordered mitigations: validate against an allowlist, confine the path to the intended directory, and do not execute untrusted files.",
].join(" ");

const MULTI_TURN_FIXTURE_PROMPT = "Implement a small validator change. First explain the exact verification command `git diff --check` and one edge-case test for an optional field. Do not use a placeholder or claim repository context is required. Keep the answer actionable.";
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
  const normalized = output.toLowerCase().replace(/[*_`]/gu, "").replace(/\s+/gu, " ");
  const negation = "(?:do not|don['’]t|never|should not|shouldn['’]t|must not|mustn['’]t)";
  const negatedMitigationPrefix = `\\b${negation}\\s+(?:\\w+\\s+){0,3}`;
  if (new RegExp(`${negatedMitigationPrefix}validat\\w*\\b.{0,120}\\ballow[- ]?list\\b`, "u").test(normalized)
    || new RegExp(`${negatedMitigationPrefix}confine\\b.{0,120}\\bintended\\b.{0,80}\\bdirector\\w*\\b`, "u").test(normalized)) return false;
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
  const normalized = output.toLowerCase().replace(/\s+/gu, " ");
  const asksForContext = /(?:\b(?:please\s+)?(?:provide|share|send)\b|\b(?:i\s+)?need\b).{0,120}\b(?:repository|repo|validator|file|details|context)\b/u.test(normalized);
  if (asksForContext) return false;
  const hasVerificationCommand = ["npm test", "pnpm test", "pytest", "cargo test", "go test"]
    .concat("git diff --check")
    .some((command) => normalized.includes(command));
  return hasVerificationCommand
    && normalized.includes("optional")
    && (normalized.includes("edge") || normalized.includes("omitted") || normalized.includes("absence"));
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

export function expectedStageAPolicyDigest(arm: StageAArm): string | null {
  return compileGenerationPolicy({
    caveman: { enabled: arm === "caveman-full" || arm === "both-full", level: "full" },
    ponytail: { enabled: arm === "ponytail-full" || arm === "both-full", level: "full" },
  }).digest;
}

export function buildStageBArmInstructions(arm: StageBArm): string {
  const [mechanism, level] = arm.split("-") as ["caveman" | "ponytail", GenerationPolicyLevel];
  return mechanism === "caveman"
    ? `[LightRSI Caveman v1 / ${level}]\n${resolveCavemanPolicy(level)}`
    : `[LightRSI Ponytail v1 / ${level}]\n${resolvePonytailPolicy(level)}`;
}

const STAGE_B_WORKLOAD = {
  fixtures: ["security", "multiturn"] as const,
  requestShape: "responses",
  repetitions: 5,
} as const;

type StageBWorkload = {
  fixtures: readonly ["security", "multiturn"];
  requestShape: "responses";
  repetitions: number;
};

type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
  reasoningTokens?: number | null;
};

export type ProviderPricing = {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
  tableVersion?: string;
};

export type MatchedStageAMeasurement = {
  transportRetryCount: number | null;
  clarificationCount: number | null;
  turnCount: number;
  usageCompleteness: "complete" | "incomplete" | "unavailable";
  cachedInputTokens: number | null;
  pricingTableVersion: string | null;
};

export type MatchedStageARow = {
  arm: StageAArm;
  fixture: StageAFixture;
  repetition: number;
  passed: boolean;
  outputChars: number;
  latencyMs: number | null;
  providerCalls: number;
  turns: number;
  toolCalls: number | null;
  transportRetries: number | null;
  clarifications: number | null;
  usage: ProviderUsage | null;
  measurement: MatchedStageAMeasurement;
  policyEvidence: GenerationPolicyEvidence[];
  error: string | null;
  failureOutputPreview?: string;
};

export type GenerationPolicyEvidence = {
  requestId: string | null;
  runtimeBuildId: string | null;
  generationPolicyVersion: string | null;
  generationPolicyDigest: string | null;
  generationPolicyApplied: boolean | null;
  generationPolicyBypassReason: string | null;
};

type MatchedStageAArmSummary = {
  correctness: "pass" | "fail" | "unavailable";
  stability: "pass" | "fail" | "unavailable";
  economics: "pass" | "fail" | "inconclusive";
  engineeringValue: "unavailable";
  providerCalls: number;
  completedTasks: number;
  totalCostUsd: number | null;
  completedTaskCostUsd: number | null;
  medianLatencyMs: number | null;
  measurement: Omit<MatchedStageAMeasurement, "turnCount"> & { turnCount: number | null };
  baselineDelta: {
    costUsd: number | null;
    latencyMs: number | null;
    providerCalls: number | null;
    turns: number | null;
    toolCalls: number | null;
    transportRetries: number | null;
    clarifications: number | null;
  } | null;
};

export type MatchedStageAReport = {
  workload: StageAWorkload;
  arms: Record<StageAArm, MatchedStageAArmSummary>;
  decision: "no-promotion" | "promotion-candidate";
  liveEconomics: "inconclusive" | "pass" | "fail";
};

export type TokenPilotGenerationPolicyPreflight = {
  status: "match" | "mismatch" | "unknown";
  source: "tokenpilot_config" | "unavailable";
  settings: {
    cavemanEnabled: boolean | null;
    ponytailEnabled: boolean | null;
  };
  configPath?: string;
  limitation?: string;
};

export type GenerationPolicyLiveRepairReport = {
  experiment: string;
  mode: "live-repair";
  sourceSha: string;
  sourceTreeStatus: "clean" | "dirty";
  model: string;
  repetitions: number;
  routerPreflight: RouterSettingsPreflight;
  tokenPilotPreflight: TokenPilotGenerationPolicyPreflight;
  providerCalls: number;
  rows: Array<{
    arm: StageAArm;
    fixture: "security" | "multiturn";
    repetition: number;
    passed: boolean;
    outputChars: number;
    usage: ProviderUsage | null;
    error: string | null;
    failureOutputPreview?: string;
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
  tokenPilotConfigPath?: string;
  fetchImpl?: typeof fetch;
};

type MatchedStageALiveOptions = LiveRepairOptions & {
  armBaseUrls: Record<StageAArm, string>;
  pricing?: ProviderPricing;
};

function responsePolicyEvidence(headers: Headers): GenerationPolicyEvidence {
  const header = (name: string): string | null => headers.get(name);
  const applied = header("x-lightrsi-generation-policy-applied");
  const digest = header("x-lightrsi-generation-policy-digest");
  const bypass = header("x-lightrsi-generation-policy-bypass");
  return {
    requestId: header("x-lightrsi-request-id"),
    runtimeBuildId: header("x-lightrsi-runtime-build-id"),
    generationPolicyVersion: header("x-lightrsi-generation-policy-version"),
    generationPolicyDigest: digest === "null" ? null : digest,
    generationPolicyApplied: applied === "true" ? true : applied === "false" ? false : null,
    generationPolicyBypassReason: bypass === "null" ? null : bypass,
  };
}

function parseNonNegativeIntegerHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (value === null || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseResponseMeasurementTelemetry(headers: Headers): {
  transportRetryCount: number | null;
  clarificationCount: number | null;
} {
  return {
    transportRetryCount: parseNonNegativeIntegerHeader(headers, "x-lightrsi-upstream-retry-count"),
    clarificationCount: parseNonNegativeIntegerHeader(headers, "x-lightrsi-clarification-count"),
  };
}

class LiveRequestError extends Error {
  constructor(
    message: string,
    readonly measurement: ReturnType<typeof parseResponseMeasurementTelemetry>,
  ) {
    super(message);
    this.name = "LiveRequestError";
  }
}

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

export function parseProviderUsage(value: unknown): ProviderUsage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const usage = (value as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const record = usage as Record<string, unknown>;
  const numberValue = (candidate: unknown): number | null => typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 ? candidate : null;
  const details = record.input_tokens_details ?? record.prompt_tokens_details;
  const detailRecord = details && typeof details === "object" && !Array.isArray(details)
    ? details as Record<string, unknown>
    : {};
  const inputTokens = numberValue(record.input_tokens ?? record.prompt_tokens);
  const cachedInputTokens = numberValue(
    record.cached_input_tokens
    ?? record.cache_read_input_tokens
    ?? record.prompt_cache_hit_tokens
    ?? detailRecord.cached_tokens,
  );
  if (inputTokens !== null && cachedInputTokens !== null && cachedInputTokens > inputTokens) return null;
  const reasoningTokens = numberValue(
    (record.output_tokens_details && typeof record.output_tokens_details === "object" && !Array.isArray(record.output_tokens_details)
      ? (record.output_tokens_details as Record<string, unknown>).reasoning_tokens
      : undefined)
      ?? record.reasoning_tokens,
  );
  return {
    inputTokens,
    outputTokens: numberValue(record.output_tokens ?? record.completion_tokens),
    totalTokens: numberValue(record.total_tokens),
    cachedInputTokens,
    ...(reasoningTokens !== null ? { reasoningTokens } : {}),
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function sumMetric(rows: MatchedStageARow[], selector: (row: MatchedStageARow) => number): number {
  return rows.reduce((total, row) => total + selector(row), 0);
}

function sumOptionalMetric(rows: MatchedStageARow[], selector: (row: MatchedStageARow) => number | null): number | null {
  const values = rows.map(selector);
  return values.every((value): value is number => value !== null)
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

function summarizeMeasurement(rows: MatchedStageARow[]): MatchedStageAArmSummary["measurement"] {
  const usageCompleteness = rows.length === 0
    ? "unavailable"
    : rows.every((row) => row.measurement.usageCompleteness === "complete")
      ? "complete"
      : rows.some((row) => row.measurement.usageCompleteness === "incomplete")
        ? "incomplete"
        : "unavailable";
  const pricingVersions = rows.map((row) => row.measurement.pricingTableVersion);
  return {
    transportRetryCount: sumOptionalMetric(rows, (row) => row.measurement.transportRetryCount),
    clarificationCount: sumOptionalMetric(rows, (row) => row.measurement.clarificationCount),
    turnCount: sumOptionalMetric(rows, (row) => row.measurement.turnCount),
    usageCompleteness,
    cachedInputTokens: sumOptionalMetric(rows, (row) => row.measurement.cachedInputTokens),
    pricingTableVersion: pricingVersions.length > 0
      && pricingVersions.every((value): value is string => value !== null)
      && new Set(pricingVersions).size === 1
      ? pricingVersions[0]
      : null,
  };
}

function rowCost(row: MatchedStageARow, pricing: ProviderPricing): number | null {
  const usage = row.usage;
  if (!usage || usage.inputTokens === null || usage.cachedInputTokens === null || usage.outputTokens === null) return null;
  const uncachedInputTokens = usage.inputTokens - usage.cachedInputTokens;
  if (uncachedInputTokens < 0) return null;
  return (
    uncachedInputTokens * pricing.inputUsdPerMillion
    + usage.cachedInputTokens * pricing.cachedInputUsdPerMillion
    + usage.outputTokens * pricing.outputUsdPerMillion
  ) / 1_000_000;
}

function hasCompleteMatchedStageAWorkload(rows: MatchedStageARow[], repetitions: number): boolean {
  const expectedKeys = new Set(
    Array.from({ length: repetitions }, (_, repetition) => STAGE_A_WORKLOAD.fixtures.map((fixture) => `${repetition}:${fixture}`)).flat(),
  );
  const actualKeys = new Set(rows.map((row) => `${row.repetition}:${row.fixture}`));
  return expectedKeys.size > 0
    && rows.length === expectedKeys.size
    && actualKeys.size === rows.length
    && [...expectedKeys].every((key) => actualKeys.has(key));
}

function assessPolicyEvidence(
  arm: StageAArm,
  rows: MatchedStageARow[],
  allRows = rows,
): "pass" | "fail" | "unavailable" {
  if (rows.some((row) => row.providerCalls < 1 || row.policyEvidence.length !== row.providerCalls)) return "unavailable";
  const allEvidence = allRows.flatMap((row) => row.policyEvidence);
  const requestIds = allEvidence.map((evidence) => evidence.requestId);
  if (
    requestIds.some((requestId) => requestId === null)
    || new Set(requestIds).size !== requestIds.length
  ) return "unavailable";
  const runtimeBuildIds = new Set(allEvidence.map((evidence) => evidence.runtimeBuildId));
  const policyVersions = new Set(allEvidence.map((evidence) => evidence.generationPolicyVersion));
  if (
    runtimeBuildIds.size !== 1
    || runtimeBuildIds.has(null)
    || runtimeBuildIds.has("unavailable")
    || policyVersions.size !== 1
    || policyVersions.has(null)
  ) return "unavailable";
  const expectedApplied = arm !== "baseline";
  const digests = new Set(rows.map((row) => row.policyEvidence.map((evidence) => evidence.generationPolicyDigest)).flat());
  if (digests.size !== 1 || [...digests][0] !== expectedStageAPolicyDigest(arm)) return "unavailable";
  let sawMismatch = false;
  for (const row of rows) {
    for (const evidence of row.policyEvidence) {
      if (
        evidence.generationPolicyApplied === null
        || evidence.generationPolicyBypassReason === null && evidence.generationPolicyApplied === false
      ) return "unavailable";
      if (evidence.generationPolicyApplied !== expectedApplied) sawMismatch = true;
      if (expectedApplied && evidence.generationPolicyBypassReason !== null) sawMismatch = true;
      if (!expectedApplied && evidence.generationPolicyBypassReason !== "disabled") return "unavailable";
    }
  }
  return sawMismatch ? "fail" : "pass";
}

export function summarizeMatchedStageAArm(params: {
  arm: StageAArm;
  repetitions: number;
  rows: MatchedStageARow[];
  pricing?: ProviderPricing;
}): MatchedStageAArmSummary {
  const completeRows = hasCompleteMatchedStageAWorkload(params.rows, params.repetitions);
  const policyEvidence = assessPolicyEvidence(params.arm, params.rows);
  const completedTasks = params.rows.filter((row) => row.passed && row.error === null).length;
  const costs = params.pricing ? params.rows.map((row) => rowCost(row, params.pricing!)) : [];
  const totalCostUsd = params.pricing && costs.every((cost): cost is number => cost !== null)
    ? costs.reduce((total, cost) => total + cost, 0)
    : null;
  return {
    correctness: !completeRows || policyEvidence === "unavailable"
      ? "unavailable"
      : policyEvidence === "fail" || params.rows.some((row) => !row.passed || row.error !== null)
        ? "fail"
        : "pass",
    stability: "unavailable",
    economics: "inconclusive",
    engineeringValue: "unavailable",
    providerCalls: sumMetric(params.rows, (row) => row.providerCalls),
    completedTasks,
    totalCostUsd,
    completedTaskCostUsd: totalCostUsd !== null && completedTasks > 0 ? totalCostUsd / completedTasks : null,
    medianLatencyMs: median(params.rows.flatMap((row) => row.latencyMs === null ? [] : [row.latencyMs])),
    measurement: summarizeMeasurement(params.rows),
    baselineDelta: null,
  };
}

export function compareMatchedStageA(
  rows: MatchedStageARow[],
  repetitions: number,
  pricing?: ProviderPricing,
): MatchedStageAReport {
  const summaries = Object.fromEntries(STAGE_A_ARMS.map((arm) => {
    const armRows = rows.filter((row) => row.arm === arm);
    return [arm, summarizeMatchedStageAArm({ arm, repetitions, rows: armRows, pricing })];
  })) as Record<StageAArm, MatchedStageAArmSummary>;
  const policyEvidence = Object.fromEntries(STAGE_A_ARMS.map((arm) => {
    const armRows = rows.filter((row) => row.arm === arm);
    return [arm, assessPolicyEvidence(arm, armRows, rows)];
  })) as Record<StageAArm, "pass" | "fail" | "unavailable">;
  for (const arm of STAGE_A_ARMS) {
    if (policyEvidence[arm] === "unavailable") summaries[arm].correctness = "unavailable";
    if (policyEvidence[arm] === "fail" && summaries[arm].correctness === "pass") summaries[arm].correctness = "fail";
  }
  const baselineRows = rows.filter((row) => row.arm === "baseline");
  const baseline = summaries.baseline;
  for (const arm of STAGE_A_ARMS) {
    if (arm === "baseline") continue;
    const summary = summaries[arm];
    const armRows = rows.filter((row) => row.arm === arm);
    const rowsComparable = hasCompleteMatchedStageAWorkload(baselineRows, repetitions)
      && hasCompleteMatchedStageAWorkload(armRows, repetitions)
      && assessPolicyEvidence("baseline", baselineRows, rows) === "pass"
      && assessPolicyEvidence(arm, armRows, rows) === "pass";
    const stabilityMetricsObserved = rowsComparable
      && [...baselineRows, ...armRows].every((row) => row.toolCalls !== null
        && row.measurement.turnCount === row.turns
        && row.measurement.transportRetryCount !== null
        && row.measurement.clarificationCount !== null);
    const stabilityPass = stabilityMetricsObserved
      && armRows.every((row) => {
        const baselineRow = baselineRows.find((candidate) => candidate.fixture === row.fixture && candidate.repetition === row.repetition);
        return baselineRow !== undefined
          && row.toolCalls !== null && baselineRow.toolCalls !== null
          && row.measurement.transportRetryCount !== null && baselineRow.measurement.transportRetryCount !== null
          && row.measurement.clarificationCount !== null && baselineRow.measurement.clarificationCount !== null
          && row.providerCalls <= baselineRow.providerCalls
          && row.turns <= baselineRow.turns
          && row.toolCalls <= baselineRow.toolCalls
           && row.measurement.transportRetryCount <= baselineRow.measurement.transportRetryCount
           && row.measurement.clarificationCount <= baselineRow.measurement.clarificationCount;
      });
    const armCost = summary.totalCostUsd;
    const baselineCost = baseline.totalCostUsd;
    const latencyDelta = summary.medianLatencyMs !== null && baseline.medianLatencyMs !== null
      ? summary.medianLatencyMs - baseline.medianLatencyMs
      : null;
    summary.stability = !rowsComparable || !stabilityMetricsObserved
      ? "unavailable"
      : stabilityPass ? "pass" : "fail";
    const economicsMetricsObserved = rowsComparable
      && pricing?.tableVersion !== undefined
      && [baseline, summary].every((candidate) => candidate.measurement.usageCompleteness === "complete"
        && candidate.measurement.cachedInputTokens !== null
        && candidate.measurement.pricingTableVersion === pricing.tableVersion);
    summary.economics = !economicsMetricsObserved || armCost === null || baselineCost === null
      ? "inconclusive"
      : armCost < baselineCost || (armCost === baselineCost && latencyDelta !== null && latencyDelta <= 0)
        ? "pass"
        : "fail";
    summary.baselineDelta = rowsComparable ? {
      costUsd: armCost !== null && baselineCost !== null ? armCost - baselineCost : null,
      latencyMs: latencyDelta,
      providerCalls: summary.providerCalls - baseline.providerCalls,
      turns: sumMetric(armRows, (row) => row.turns) - sumMetric(baselineRows, (row) => row.turns),
       toolCalls: sumOptionalMetric(armRows, (row) => row.toolCalls) !== null && sumOptionalMetric(baselineRows, (row) => row.toolCalls) !== null
         ? sumOptionalMetric(armRows, (row) => row.toolCalls)! - sumOptionalMetric(baselineRows, (row) => row.toolCalls)!
         : null,
       transportRetries: sumOptionalMetric(armRows, (row) => row.transportRetries) !== null && sumOptionalMetric(baselineRows, (row) => row.transportRetries) !== null
         ? sumOptionalMetric(armRows, (row) => row.transportRetries)! - sumOptionalMetric(baselineRows, (row) => row.transportRetries)!
         : null,
       clarifications: sumOptionalMetric(armRows, (row) => row.clarifications) !== null && sumOptionalMetric(baselineRows, (row) => row.clarifications) !== null
         ? sumOptionalMetric(armRows, (row) => row.clarifications)! - sumOptionalMetric(baselineRows, (row) => row.clarifications)!
         : null,
    } : null;
  }
  const promotedArms = STAGE_A_ARMS.filter((arm) => arm !== "baseline").every((arm) => {
    const summary = summaries[arm];
    return summary.correctness === "pass"
      && summary.stability === "pass"
      && summary.economics === "pass"
      && summary.engineeringValue !== "unavailable";
  });
  return {
    workload: { ...STAGE_A_WORKLOAD, repetitions },
    arms: summaries,
    decision: promotedArms ? "promotion-candidate" : "no-promotion",
    liveEconomics: STAGE_A_ARMS.slice(1).some((arm) => summaries[arm].economics === "inconclusive")
      ? "inconclusive"
      : promotedArms ? "pass" : "fail",
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
): Promise<{ text: string; history: Record<string, unknown>[]; usage: ProviderUsage | null; policyEvidence: GenerationPolicyEvidence; measurement: ReturnType<typeof parseResponseMeasurementTelemetry> }> {
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
  const responseMeasurement = parseResponseMeasurementTelemetry(response.headers);
  if (!response.ok) throw new LiveRequestError(`provider_status:${response.status}`, responseMeasurement);
  const output = Array.isArray(body.output) ? body.output : [];
  return {
    text: responseText(body),
    history: projectAssistantHistory(output),
    usage: parseProviderUsage(body),
    policyEvidence: responsePolicyEvidence(response.headers),
    measurement: responseMeasurement,
  };
}

export function stageAFixturePrompt(fixture: StageAFixture): string {
  switch (fixture) {
    case "prose":
      return "Explain input validation in two short paragraphs. Include the exact terms boundary validation and actionable error.";
    case "code":
      return "Give a concise implementation checklist. Preserve the exact command `pnpm test`, path `src/validator.ts`, and identifier `optionalField`.";
    case "json":
      return "Return only valid JSON with exactly these string keys: status set to ready, and schemaVersion set to 1. Do not wrap it in Markdown.";
    case "tool-history":
      return "Use the historical tool result exactly as provided. Confirm the exact marker TOOL_RESULT_ALPHA and do not invent a different result.";
    case "security":
      return SECURITY_FIXTURE_PROMPT;
    case "detail":
      return "Explain a safe validator change with exactly these sections: Assumptions, Implementation, Verification. Include one failure case and one test command.";
    case "multiturn":
      return MULTI_TURN_FIXTURE_PROMPT;
    case "artifact":
      return "Return a persisted artifact payload beginning with `--- artifact.md ---`, followed by a Markdown heading `# Validation Plan` and exactly one safe, non-composite verification command: `git diff --check`. Do not use shell chaining, redirection, or separators.";
  }
}

export function validateStageAFixtureOutput(fixture: StageAFixture, output: string): boolean {
  const normalized = output.toLowerCase();
  switch (fixture) {
    case "prose":
      return normalized.includes("boundary validation") && normalized.includes("actionable error");
    case "code":
      return output.includes("pnpm test") && output.includes("src/validator.ts") && output.includes("optionalField");
    case "json": {
      try {
        const parsed = JSON.parse(output) as Record<string, unknown>;
        return Object.keys(parsed).length === 2
          && parsed.status === "ready"
          && (parsed.schemaVersion === "1" || parsed.schemaVersion === 1);
      } catch {
        return false;
      }
    }
    case "tool-history":
      return output.includes("TOOL_RESULT_ALPHA");
    case "security":
      return validateSecurityFixtureOutput(output);
    case "detail":
      return ["assumptions", "implementation", "verification"].every((section) => normalized.includes(section))
        && normalized.includes("test");
    case "multiturn":
      return validateMultiTurnFixtureOutput(output);
    case "artifact": {
      return output.startsWith("--- artifact.md ---")
        && output.includes("# Validation Plan")
        && hasVerificationCommand(output);
    }
  }
}

function hasVerificationCommand(output: string): boolean {
  const normalized = output.toLowerCase();
  const candidates = [
    ...normalized.split(/\r?\n/u),
    ...Array.from(normalized.matchAll(/`([^`]+)`/gu), (match) => match[1] ?? ""),
  ];
  const commandPatterns = [
    /^(?:pnpm|npm)\s+(?:test|run\s+test)(?:\s|$)/u,
    /^pytest(?:\s|$)/u,
    /^python(?:\d+(?:\.\d+)?)?(?:\s+-i)*\s+-m\s+pytest(?:\s|$)/u,
    /^python(?:\d+(?:\.\d+)?)?(?:\s+-i)*\s+-m\s+unittest(?:\s|$)/u,
    /^python(?:\d+(?:\.\d+)?)?(?:\s+-i)*\s+-m\s+compileall(?:\s|$)/u,
    /^(?:cargo|go)\s+test(?:\s|$)/u,
    /^make\s+test(?:\s|$)/u,
    /^git\s+diff\s+--check(?:\s|$)/u,
    /^grep\s+\S+(?:\s+\S+)+$/u,
    /^test\s+-[efsdxrw]\s+(?!.*[;&|><"'`\\#$(){}[\]])\S+$/u,
  ];
  return candidates.some((candidate) => {
    let command = candidate.trim();
    command = command.replace(/^(?:-\s+|\*\s+)/u, "");
    command = command.replace(/^run:?\s+/u, "");
    return commandPatterns.some((pattern) => pattern.test(command));
  });
}

function stageAFixtureInput(fixture: StageAFixture): readonly unknown[] {
  if (fixture === "tool-history") {
    return [
      { role: "user", content: stageAFixturePrompt(fixture) },
      { type: "function_call", call_id: "fixture-call", name: "read_fixture", arguments: "{\"path\":\"fixture.txt\"}" },
      { type: "function_call_output", call_id: "fixture-call", output: "TOOL_RESULT_ALPHA" },
    ];
  }
  return [{ role: "user", content: stageAFixturePrompt(fixture) }];
}

export function sumUsage(responses: Array<{ usage: ProviderUsage | null }>): ProviderUsage | null {
  const usages = responses.map((response) => response.usage);
  if (usages.length === 0 || usages.every((usage) => usage === null)) return null;
  const sumField = (field: keyof Pick<ProviderUsage, "inputTokens" | "outputTokens" | "totalTokens" | "cachedInputTokens">): number | null => {
    if (!usages.every((usage) => usage?.[field] !== null && usage?.[field] !== undefined)) return null;
    return usages.reduce((total, usage) => total + (usage?.[field] as number), 0);
  };
  const reasoningValues = usages.map((usage) => usage?.reasoningTokens);
  return {
    inputTokens: sumField("inputTokens"),
    outputTokens: sumField("outputTokens"),
    totalTokens: sumField("totalTokens"),
    cachedInputTokens: sumField("cachedInputTokens"),
    ...(reasoningValues.every((value): value is number => value !== undefined && value !== null)
      ? { reasoningTokens: reasoningValues.reduce((total, value) => total + value, 0) }
      : {}),
  };
}

function observedToolCalls(responses: Array<{ history: Record<string, unknown>[] }>): number {
  return responses.reduce((total, response) => total + response.history.filter((item) => (
    item.type === "function_call"
      || item.type === "custom_tool_call"
      || item.type === "computer_call"
      || item.type === "local_shell_call"
      || item.type === "shell_call"
  )).length, 0);
}

function buildMatchedStageAMeasurement(
  usage: ProviderUsage | null,
  turns: number,
  pricing: ProviderPricing | undefined,
  telemetry: { transportRetryCount: number | null; clarificationCount: number | null },
): MatchedStageAMeasurement {
  return {
    transportRetryCount: telemetry.transportRetryCount,
    clarificationCount: telemetry.clarificationCount,
    turnCount: turns,
    usageCompleteness: usage === null
      ? "unavailable"
      : usage.inputTokens !== null && usage.outputTokens !== null && usage.totalTokens !== null
        ? "complete"
        : "incomplete",
    cachedInputTokens: usage?.cachedInputTokens ?? null,
    pricingTableVersion: pricing?.tableVersion ?? null,
  };
}

async function runCompletedTask(
  options: MatchedStageALiveOptions,
  fixture: StageAFixture,
): Promise<{
  passed: boolean;
  outputChars: number;
  latencyMs: number;
  providerCalls: number;
  turns: number;
  toolCalls: number | null;
  transportRetries: number | null;
  clarifications: number | null;
  usage: ProviderUsage | null;
  measurement: MatchedStageAMeasurement;
  policyEvidence: GenerationPolicyEvidence[];
  error: string | null;
  failureOutputPreview?: string;
}> {
  const started = Date.now();
  const responses: Array<{ text: string; history: Record<string, unknown>[]; usage: ProviderUsage | null; policyEvidence: GenerationPolicyEvidence }> = [];
  const measurements: Array<{ transportRetryCount: number | null; clarificationCount: number | null }> = [];
  let providerCalls = 0;
  const request = async (input: readonly unknown[]) => {
    providerCalls += 1;
    return runLiveRequest(options, "", input);
  };
  try {
    const first = await request(stageAFixtureInput(fixture));
    responses.push(first);
    measurements.push(first.measurement);
    if (fixture === "multiturn") {
      const second = await request([
        { role: "user", content: MULTI_TURN_FIXTURE_PROMPT },
        ...first.history,
        { role: "user", content: MULTI_TURN_FIXTURE_FOLLOW_UP },
      ]);
      responses.push(second);
      measurements.push(second.measurement);
    }
    const finalText = responses[responses.length - 1]!.text;
    const passed = validateStageAFixtureOutput(fixture, finalText);
    const usage = sumUsage(responses);
    const measurement = buildMatchedStageAMeasurement(usage, responses.length, options.pricing, {
      transportRetryCount: measurements.every((value) => value.transportRetryCount !== null)
        ? measurements.reduce((total, value) => total + value.transportRetryCount!, 0)
        : null,
      clarificationCount: measurements.every((value) => value.clarificationCount !== null)
        ? measurements.reduce((total, value) => total + value.clarificationCount!, 0)
        : null,
    });
    return {
      passed,
      outputChars: finalText.length,
      latencyMs: Date.now() - started,
      providerCalls,
      turns: responses.length,
      toolCalls: observedToolCalls(responses),
      transportRetries: measurement.transportRetryCount,
      clarifications: measurement.clarificationCount,
      usage,
      measurement,
      policyEvidence: responses.map((response) => response.policyEvidence),
      error: null,
      ...(passed ? {} : { failureOutputPreview: captureFailedOutput(finalText) }),
    };
  } catch (error) {
    const usage = sumUsage(responses);
    const failedMeasurement = error instanceof LiveRequestError ? error.measurement : null;
    const observedMeasurements = failedMeasurement === null
      ? measurements
      : [...measurements, failedMeasurement];
    const measurement = buildMatchedStageAMeasurement(usage, responses.length, options.pricing, {
      transportRetryCount: failedMeasurement !== null && observedMeasurements.every((value) => value.transportRetryCount !== null)
        ? observedMeasurements.reduce((total, value) => total + value.transportRetryCount!, 0)
        : null,
      clarificationCount: failedMeasurement !== null && observedMeasurements.every((value) => value.clarificationCount !== null)
        ? observedMeasurements.reduce((total, value) => total + value.clarificationCount!, 0)
        : null,
    });
    return {
      passed: false,
      outputChars: responses.length > 0 ? responses[responses.length - 1]!.text.length : 0,
      latencyMs: Date.now() - started,
      providerCalls,
      turns: responses.length,
      toolCalls: observedToolCalls(responses),
      transportRetries: measurement.transportRetryCount,
      clarifications: measurement.clarificationCount,
      usage,
      measurement,
      policyEvidence: responses.map((response) => response.policyEvidence),
      error: error instanceof Error ? error.message : "provider_error",
      ...(responses.length > 0
        ? { failureOutputPreview: captureFailedOutput(responses[responses.length - 1]!.text) }
        : {}),
    };
  }
}

function rotatedStageAArms(repetition: number): readonly StageAArm[] {
  const offset = repetition % STAGE_A_ARMS.length;
  return [...STAGE_A_ARMS.slice(offset), ...STAGE_A_ARMS.slice(0, offset)];
}

export async function runGenerationPolicyMatchedLive(
  options: MatchedStageALiveOptions,
): Promise<GenerationPolicyBenchmarkReport> {
  const sourceSha = gitOutput(["rev-parse", "HEAD"]);
  const sourceTreeStatus = gitOutput(["status", "--porcelain"]) ? "dirty" : "clean";
  if (sourceTreeStatus !== "clean") throw new Error("Matched live benchmark requires a clean source checkpoint.");
  const repetitions = options.repetitions ?? STAGE_A_WORKLOAD.repetitions;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > STAGE_A_WORKLOAD.repetitions) {
    throw new Error(`Matched Stage A repetitions must be an integer from 1 through ${STAGE_A_WORKLOAD.repetitions}.`);
  }
  const armBaseUrls = STAGE_A_ARMS.map((arm) => options.armBaseUrls[arm]);
  if (armBaseUrls.some((baseUrl) => !baseUrl) || new Set(armBaseUrls).size !== STAGE_A_ARMS.length) {
    throw new Error("Matched Stage A requires one distinct configured proxy URL per arm.");
  }
  const tokenPilotPreflight = await requireTokenPilotGenerationPoliciesDisabled(options.tokenPilotConfigPath);
  let routerPreflight = await readRouterSettingsPreflight(options.routerUrl, undefined, options.apiKey, options.fetchImpl);
  if (routerPreflight.status === "unknown" && routerPreflight.source === "unavailable" && options.routerSettingsEvidencePath) {
    const dashboardEvidence = await readRouterSettingsEvidence(options.routerSettingsEvidencePath, options.routerUrl);
    if (shouldUseRouterSettingsEvidenceFallback(routerPreflight, dashboardEvidence)) routerPreflight = dashboardEvidence;
  }
  if (routerPreflight.status !== "match") throw new Error(`Router preflight failed: ${routerPreflight.status}.`);

  const rows: MatchedStageARow[] = [];
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    for (const arm of rotatedStageAArms(repetition)) {
      const armOptions = { ...options, baseUrl: options.armBaseUrls[arm] };
      for (const fixture of STAGE_A_WORKLOAD.fixtures) {
        const result = await runCompletedTask(armOptions, fixture);
        rows.push({ arm, fixture, repetition, ...result });
      }
    }
  }
  const matched = compareMatchedStageA(rows, repetitions, options.pricing);
  return {
    experiment: "lightrsi-generation-policy-stage-a-matched",
    mode: "live",
    sourceSha,
    sourceTreeStatus,
    model: options.model,
    repetitions,
    workload: { ...STAGE_A_WORKLOAD, repetitions },
    arms: Object.fromEntries(STAGE_A_ARMS.map((arm) => [arm, {
      correctness: matched.arms[arm].correctness,
      stability: matched.arms[arm].stability,
      economics: matched.arms[arm].economics,
      providerCalls: matched.arms[arm].providerCalls,
    }])) as GenerationPolicyBenchmarkReport["arms"],
    liveEconomics: matched.liveEconomics,
    routerPreflight,
    tokenPilotPreflight,
    decision: matched.decision,
    rows,
    matched,
    routerTelemetry: { source: "tokenpilot-event-trace", exactIdentity: "unavailable" },
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
  const tokenPilotPreflight = await requireTokenPilotGenerationPoliciesDisabled(options.tokenPilotConfigPath);
  let routerPreflight = await readRouterSettingsPreflight(options.routerUrl, undefined, options.apiKey);
  if (routerPreflight.status === "unknown" && routerPreflight.source === "unavailable" && options.routerSettingsEvidencePath) {
    const dashboardEvidence = await readRouterSettingsEvidence(options.routerSettingsEvidencePath, options.routerUrl);
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
        const passed = validateSecurityFixtureOutput(security.text);
        rows.push({
          arm,
          fixture: "security",
          repetition,
          passed,
          outputChars: security.text.length,
          usage: security.usage,
          error: null,
          ...(passed ? {} : { failureOutputPreview: captureFailedOutput(security.text) }),
        });
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
        const passed = validateMultiTurnFixtureOutput(second.text);
        rows.push({
          arm,
          fixture: "multiturn",
          repetition,
          passed,
          outputChars: second.text.length,
          usage: second.usage,
          error: null,
          ...(passed ? {} : { failureOutputPreview: captureFailedOutput(second.text) }),
        });
      } catch (error) {
        rows.push({ arm, fixture: "multiturn", repetition, passed: false, outputChars: 0, usage: null, error: error instanceof Error ? error.message : "provider_error" });
      }
    }
  }
  return { experiment: "lightrsi-generation-policy-stage-a-repair", mode: "live-repair", sourceSha, sourceTreeStatus, model: options.model, repetitions, routerPreflight, tokenPilotPreflight, providerCalls, rows, decision: "no-promotion" };
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
  tokenPilotPreflight: TokenPilotGenerationPolicyPreflight;
  decision: "no-promotion" | "promotion-candidate";
  model?: string;
  repetitions?: number;
  workload?: StageAWorkload;
  rows?: MatchedStageARow[];
  matched?: MatchedStageAReport;
  routerTelemetry?: {
    source: "tokenpilot-event-trace";
    exactIdentity: "available" | "unavailable";
  };
};

export type GenerationPolicyStageBReport = {
  experiment: "lightrsi-generation-policy-stage-b";
  mode: "mock" | "live";
  sourceSha: string;
  sourceTreeStatus: "clean" | "dirty";
  model: string;
  repetitions: number;
  workload: StageBWorkload;
  routerPreflight: RouterSettingsPreflight;
  tokenPilotPreflight: TokenPilotGenerationPolicyPreflight;
  arms: Record<StageBArm, {
    mechanism: "caveman" | "ponytail";
    level: GenerationPolicyLevel;
    correctness: "pass" | "fail" | "unavailable";
    stability: "pass" | "fail" | "unavailable";
    economics: "pass" | "fail" | "inconclusive";
    providerCalls: number;
    workloadFingerprint: string;
  }>;
  rows: Array<{
    arm: StageBArm;
    fixture: "security" | "multiturn";
    repetition: number;
    passed: boolean;
    outputChars: number;
    latencyMs: number | null;
    usage: ProviderUsage | null;
    error: string | null;
    failureOutputPreview?: string;
  }>;
  liveEconomics: "inconclusive" | "pass" | "fail";
  decision: "no-promotion";
};

export type RouterSettingsPreflight = {
  status: "match" | "mismatch" | "unknown";
  source: "settings_api" | "dashboard_evidence" | "unavailable";
  settings: Record<string, boolean | string | null>;
  unavailableReason?: "authentication" | "http" | "transport";
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
  fetchImpl: typeof fetch = fetch,
): Promise<RouterSettingsPreflight> {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/u, "")}/api/settings`, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : undefined,
    });
    if (!response.ok) {
      return {
        status: "unknown",
        source: "unavailable",
        settings: {},
        unavailableReason: response.status === 401 || response.status === 403 ? "authentication" : "http",
      };
    }
    return evaluateRouterSettingsPreflight(await response.json(), expected);
  } catch {
    return { status: "unknown", source: "unavailable", settings: {}, unavailableReason: "transport" };
  }
}

const ROUTER_SETTINGS_EVIDENCE_MAX_AGE_MS = 5 * 60 * 1000;

export async function readRouterSettingsEvidence(
  path: string,
  routerUrl: string,
  now = new Date(),
): Promise<RouterSettingsPreflight> {
  try {
    const payload = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    const capturedAt = typeof payload.capturedAt === "string" ? Date.parse(payload.capturedAt) : NaN;
    const normalizedRouterUrl = routerUrl.replace(/\/+$/u, "");
    const evidenceRouterUrl = typeof payload.routerUrl === "string" ? payload.routerUrl.replace(/\/+$/u, "") : "";
    if (payload.source !== "9router_dashboard"
      || payload.status !== 200
      || evidenceRouterUrl !== normalizedRouterUrl
      || !Number.isFinite(capturedAt)
      || capturedAt > now.getTime()
      || now.getTime() - capturedAt > ROUTER_SETTINGS_EVIDENCE_MAX_AGE_MS) {
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
    && primary.unavailableReason === "authentication"
    && evidence.source === "dashboard_evidence"
    && evidence.status !== "unknown";
}

export async function readTokenPilotGenerationPolicyPreflight(
  configPath = defaultTokenPilotConfigPath(),
): Promise<TokenPilotGenerationPolicyPreflight> {
  if (!existsSync(configPath)) {
    return {
      status: "unknown",
      source: "unavailable",
      settings: { cavemanEnabled: null, ponytailEnabled: null },
      configPath,
      limitation: "TokenPilot config is missing; local generation policies cannot be proven disabled",
    };
  }
  try {
    const config = await loadTokenPilotCodexConfig(configPath);
    const settings = {
      cavemanEnabled: config.generationPolicy.caveman.enabled,
      ponytailEnabled: config.generationPolicy.ponytail.enabled,
    };
    return {
      status: settings.cavemanEnabled === false && settings.ponytailEnabled === false ? "match" : "mismatch",
      source: "tokenpilot_config",
      settings,
      configPath,
    };
  } catch (error) {
    return {
      status: "unknown",
      source: "unavailable",
      settings: { cavemanEnabled: null, ponytailEnabled: null },
      configPath,
      limitation: error instanceof Error ? error.message : "TokenPilot config could not be read",
    };
  }
}

async function requireTokenPilotGenerationPoliciesDisabled(
  configPath?: string,
): Promise<TokenPilotGenerationPolicyPreflight> {
  const preflight = await readTokenPilotGenerationPolicyPreflight(configPath);
  if (preflight.status !== "match") throw new Error(`TokenPilot generation policy preflight failed: ${preflight.status}.`);
  return preflight;
}

function stageBArmMetadata(arm: StageBArm): Pick<GenerationPolicyStageBReport["arms"][StageBArm], "mechanism" | "level" | "workloadFingerprint"> {
  const [mechanism, level] = arm.split("-") as ["caveman" | "ponytail", GenerationPolicyLevel];
  return {
    mechanism,
    level,
    workloadFingerprint: JSON.stringify(STAGE_B_WORKLOAD),
  };
}

type StageBLiveOptions = LiveRepairOptions;

export async function runGenerationPolicyStageBLive(
  options: StageBLiveOptions,
): Promise<GenerationPolicyStageBReport> {
  const sourceSha = gitOutput(["rev-parse", "HEAD"]);
  const sourceTreeStatus = gitOutput(["status", "--porcelain"]) ? "dirty" : "clean";
  if (sourceTreeStatus !== "clean") throw new Error("Stage B live execution requires a clean source checkpoint.");
  const repetitions = options.repetitions ?? STAGE_B_WORKLOAD.repetitions;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > STAGE_B_WORKLOAD.repetitions) {
    throw new Error(`Stage B repetitions must be an integer from 1 through ${STAGE_B_WORKLOAD.repetitions}.`);
  }
  const tokenPilotPreflight = await requireTokenPilotGenerationPoliciesDisabled(options.tokenPilotConfigPath);
  let routerPreflight = await readRouterSettingsPreflight(options.routerUrl, undefined, options.apiKey);
  if (routerPreflight.status === "unknown" && routerPreflight.source === "unavailable" && options.routerSettingsEvidencePath) {
    const dashboardEvidence = await readRouterSettingsEvidence(options.routerSettingsEvidencePath, options.routerUrl);
    if (shouldUseRouterSettingsEvidenceFallback(routerPreflight, dashboardEvidence)) routerPreflight = dashboardEvidence;
  }
  if (routerPreflight.status !== "match") throw new Error(`Router preflight failed: ${routerPreflight.status}.`);

  const rows: GenerationPolicyStageBReport["rows"] = [];
  const providerCalls = new Map<StageBArm, number>();
  const instructionsByArm = new Map(STAGE_B_ARMS.map((arm) => [arm, buildStageBArmInstructions(arm)]));
  for (const arm of STAGE_B_ARMS) {
    const instructions = instructionsByArm.get(arm) ?? "";
    providerCalls.set(arm, 0);
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      const securityStarted = Date.now();
      try {
        providerCalls.set(arm, (providerCalls.get(arm) ?? 0) + 1);
        const security = await runLiveRequest(options, instructions, [{ role: "user", content: SECURITY_FIXTURE_PROMPT }]);
        const passed = validateSecurityFixtureOutput(security.text);
        rows.push({
          arm,
          fixture: "security",
          repetition,
          passed,
          outputChars: security.text.length,
          latencyMs: Date.now() - securityStarted,
          usage: security.usage,
          error: null,
          ...(passed ? {} : { failureOutputPreview: captureFailedOutput(security.text) }),
        });
      } catch (error) {
        rows.push({ arm, fixture: "security", repetition, passed: false, outputChars: 0, latencyMs: Date.now() - securityStarted, usage: null, error: error instanceof Error ? error.message : "provider_error" });
      }

      const multiturnStarted = Date.now();
      try {
        providerCalls.set(arm, (providerCalls.get(arm) ?? 0) + 1);
        const first = await runLiveRequest(options, instructions, [{ role: "user", content: MULTI_TURN_FIXTURE_PROMPT }]);
        providerCalls.set(arm, (providerCalls.get(arm) ?? 0) + 1);
        const second = await runLiveRequest(options, instructions, [
          { role: "user", content: MULTI_TURN_FIXTURE_PROMPT },
          ...first.history,
          { role: "user", content: MULTI_TURN_FIXTURE_FOLLOW_UP },
        ]);
        const passed = validateMultiTurnFixtureOutput(second.text);
        rows.push({
          arm,
          fixture: "multiturn",
          repetition,
          passed,
          outputChars: second.text.length,
          latencyMs: Date.now() - multiturnStarted,
          usage: second.usage,
          error: null,
          ...(passed ? {} : { failureOutputPreview: captureFailedOutput(second.text) }),
        });
      } catch (error) {
        rows.push({ arm, fixture: "multiturn", repetition, passed: false, outputChars: 0, latencyMs: Date.now() - multiturnStarted, usage: null, error: error instanceof Error ? error.message : "provider_error" });
      }
    }
  }

  const arms = Object.fromEntries(STAGE_B_ARMS.map((arm) => {
    const armRows = rows.filter((row) => row.arm === arm);
    return [arm, {
      ...stageBArmMetadata(arm),
      correctness: armRows.length === repetitions * STAGE_B_WORKLOAD.fixtures.length && armRows.every((row) => row.passed) ? "pass" : "fail",
      stability: "unavailable",
      economics: "inconclusive",
      providerCalls: providerCalls.get(arm) ?? 0,
    }];
  })) as GenerationPolicyStageBReport["arms"];
  return {
    experiment: "lightrsi-generation-policy-stage-b",
    mode: "live",
    sourceSha,
    sourceTreeStatus,
    model: options.model,
    repetitions,
    workload: { ...STAGE_B_WORKLOAD, repetitions },
    routerPreflight,
    tokenPilotPreflight,
    arms,
    rows,
    liveEconomics: "inconclusive",
    decision: "no-promotion",
  };
}

export function buildMockStageBReport(): GenerationPolicyStageBReport {
  const sourceSha = gitOutput(["rev-parse", "HEAD"]);
  const sourceTreeStatus = gitOutput(["status", "--porcelain"]) ? "dirty" : "clean";
  const arms = Object.fromEntries(STAGE_B_ARMS.map((arm) => [arm, {
    ...stageBArmMetadata(arm),
    correctness: "unavailable",
    stability: "unavailable",
    economics: "inconclusive",
    providerCalls: 0,
  }])) as GenerationPolicyStageBReport["arms"];
  return {
    experiment: "lightrsi-generation-policy-stage-b",
    mode: "mock",
    sourceSha,
    sourceTreeStatus,
    model: "unavailable",
    repetitions: STAGE_B_WORKLOAD.repetitions,
    workload: STAGE_B_WORKLOAD,
    routerPreflight: { status: "unknown", source: "unavailable", settings: {} },
    tokenPilotPreflight: { status: "unknown", source: "unavailable", settings: { cavemanEnabled: null, ponytailEnabled: null } },
    arms,
    rows: [],
    liveEconomics: "inconclusive",
    decision: "no-promotion",
  };
}

export async function runGenerationPolicyStageB(options?: { mock?: boolean }): Promise<GenerationPolicyStageBReport> {
  if (!options?.mock) {
    throw new Error("Stage B live execution requires the explicit stage-b live runner.");
  }
  return buildMockStageBReport();
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
    tokenPilotPreflight: { status: "unknown", source: "unavailable", settings: { cavemanEnabled: null, ponytailEnabled: null } },
    decision: "no-promotion",
    model: "unavailable",
    repetitions: STAGE_A_WORKLOAD.repetitions,
    workload: STAGE_A_WORKLOAD,
    rows: [],
    matched: compareMatchedStageA([], STAGE_A_WORKLOAD.repetitions),
    routerTelemetry: { source: "tokenpilot-event-trace", exactIdentity: "unavailable" },
  };
}

export async function runGenerationPolicyBenchmark(options?: { mock?: boolean }): Promise<GenerationPolicyBenchmarkReport> {
  if (!options?.mock) {
    throw new Error("Live benchmark requires explicit provider approval and a clean source checkpoint.");
  }
  return buildMockGenerationPolicyReport();
}

export function parseMatchedStageAPricing(environment: NodeJS.ProcessEnv = process.env): ProviderPricing | undefined {
  const pricingValues = [
    environment.LIGHTRSI_BENCHMARK_INPUT_USD_PER_MILLION,
    environment.LIGHTRSI_BENCHMARK_CACHED_INPUT_USD_PER_MILLION,
    environment.LIGHTRSI_BENCHMARK_OUTPUT_USD_PER_MILLION,
  ].map((value) => value === undefined ? null : Number(value));
  if (!pricingValues.every((value): value is number => value !== null && Number.isFinite(value) && value >= 0)) return undefined;
  const tableVersion = environment.LIGHTRSI_BENCHMARK_PRICING_TABLE_VERSION?.trim();
  return {
    inputUsdPerMillion: pricingValues[0],
    cachedInputUsdPerMillion: pricingValues[1],
    outputUsdPerMillion: pricingValues[2],
    ...(tableVersion ? { tableVersion } : {}),
  };
}

async function main(): Promise<void> {
  if (process.argv.includes("--mode") && process.argv[process.argv.indexOf("--mode") + 1] === "local-overhead") {
    const report = await runLocalOverheadBenchmark({
      warmup: argumentValue("--warmup", 20),
      samples: argumentValue("--samples", 100),
      records: argumentValue("--records", 256),
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
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
      tokenPilotConfigPath: process.env.LIGHTRSI_BENCHMARK_TOKENPILOT_CONFIG?.trim() || defaultTokenPilotConfigPath(),
    });
    const outputPath = process.env.LIGHTRSI_BENCHMARK_OUTPUT?.trim()
      || resolve(tmpdir(), "lightrsi-generation-policy-stage-a-repair.json");
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ ...report, outputPath }, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--matched-live")) {
    const initialCwd = process.env.INIT_CWD?.trim() || process.cwd();
    await loadProviderEnvFile(process.env.LIGHTRSI_BENCHMARK_CREDENTIALS_FILE?.trim() || resolve(initialCwd, ".env"));
    const baseUrl = process.env.LIGHTRSI_BENCHMARK_BASE_URL?.trim() || process.env.OPENAI_BASE_URL?.trim();
    const routerUrl = process.env.LIGHTRSI_BENCHMARK_ROUTER_URL?.trim();
    const apiKey = process.env.OPENAI_API_KEY?.trim() || await loadCodexAuthApiKey();
    const model = process.env.LIGHTRSI_BENCHMARK_MODEL?.trim() || providerModelFromEnvironment();
    if (!baseUrl || !routerUrl || !apiKey || !model) {
      throw new Error("Matched live execution requires LIGHTRSI_BENCHMARK_BASE_URL, LIGHTRSI_BENCHMARK_ROUTER_URL, OPENAI_API_KEY, and a model.");
    }
    const armBaseUrls = Object.fromEntries(STAGE_A_ARMS.map((arm) => {
      const name = `LIGHTRSI_BENCHMARK_${arm.toUpperCase().replace(/-/gu, "_")}_BASE_URL`;
      return [arm, process.env[name]?.trim() ?? ""];
    })) as Record<StageAArm, string>;
    if (Object.values(armBaseUrls).some((value) => !value) || new Set(Object.values(armBaseUrls)).size !== STAGE_A_ARMS.length) {
      throw new Error("Matched live execution requires one distinct LIGHTRSI_BENCHMARK_<ARM>_BASE_URL per Stage A arm.");
    }
    const pricing = parseMatchedStageAPricing();
    const report = await runGenerationPolicyMatchedLive({
      baseUrl,
      armBaseUrls,
      routerUrl,
      apiKey,
      model,
      pricing,
      repetitions: Number(process.env.LIGHTRSI_BENCHMARK_REPETITIONS ?? STAGE_A_WORKLOAD.repetitions),
      routerSettingsEvidencePath: process.env.LIGHTRSI_BENCHMARK_ROUTER_SETTINGS_EVIDENCE?.trim(),
      tokenPilotConfigPath: process.env.LIGHTRSI_BENCHMARK_TOKENPILOT_CONFIG?.trim() || defaultTokenPilotConfigPath(),
    });
    const outputPath = process.env.LIGHTRSI_BENCHMARK_OUTPUT?.trim()
      || resolve(tmpdir(), "lightrsi-generation-policy-stage-a-matched.json");
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ ...report, outputPath }, null, 2)}\n`);
    return;
  }
  if (process.argv.includes("--stage-b")) {
    let report: GenerationPolicyStageBReport;
    if (process.argv.includes("--mock")) {
      report = await runGenerationPolicyStageB({ mock: true });
    } else {
      const initialCwd = process.env.INIT_CWD?.trim() || process.cwd();
      await loadProviderEnvFile(process.env.LIGHTRSI_BENCHMARK_CREDENTIALS_FILE?.trim() || resolve(initialCwd, ".env"));
      const baseUrl = process.env.LIGHTRSI_BENCHMARK_BASE_URL?.trim() || process.env.OPENAI_BASE_URL?.trim();
      const routerUrl = process.env.LIGHTRSI_BENCHMARK_ROUTER_URL?.trim();
      const apiKey = process.env.OPENAI_API_KEY?.trim() || await loadCodexAuthApiKey();
      const model = process.env.LIGHTRSI_BENCHMARK_MODEL?.trim() || providerModelFromEnvironment();
      if (!baseUrl || !routerUrl || !apiKey || !model) {
        throw new Error("Stage B live execution requires LIGHTRSI_BENCHMARK_BASE_URL, LIGHTRSI_BENCHMARK_ROUTER_URL, OPENAI_API_KEY, and a model.");
      }
      report = await runGenerationPolicyStageBLive({
        baseUrl,
        routerUrl,
        apiKey,
        model,
        repetitions: Number(process.env.LIGHTRSI_BENCHMARK_REPETITIONS ?? STAGE_B_WORKLOAD.repetitions),
        routerSettingsEvidencePath: process.env.LIGHTRSI_BENCHMARK_ROUTER_SETTINGS_EVIDENCE?.trim(),
        tokenPilotConfigPath: process.env.LIGHTRSI_BENCHMARK_TOKENPILOT_CONFIG?.trim() || defaultTokenPilotConfigPath(),
      });
    }
    const root = resolve(process.cwd(), "../../..");
    const outputRoot = report.mode === "mock" ? tmpdir() : resolve(root, "docs/benchmarks");
    const manifestPath = resolve(outputRoot, "2026-10-10-generation-policy-stage-b-manifest.json");
    const resultsPath = resolve(outputRoot, "2026-10-10-generation-policy-stage-b-results.json");
    const reportPath = resolve(outputRoot, "2026-10-10-generation-policy-stage-b-report.md");
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify({
      experiment: report.experiment,
      mode: report.mode,
      sourceSha: report.sourceSha,
      benchmarkSha: report.sourceSha,
      sourceTreeStatus: report.sourceTreeStatus,
      model: report.model,
      workload: report.workload,
      arms: STAGE_B_ARMS,
      liveTraffic: report.mode === "live" ? "completed" : "not-run",
      liveEconomics: report.liveEconomics,
    }, null, 2)}\n`);
    await writeFile(resultsPath, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(reportPath, [
      "# LightRSI generation policy Stage B",
      "",
      `- Mode: ${report.mode}`,
      `- Source SHA: ${report.sourceSha}`,
      `- Source tree: ${report.sourceTreeStatus}`,
      `- Workload: ${report.workload.fixtures.join(", ")}; repetitions=${report.repetitions}.`,
      "- Caveman and Ponytail were swept independently; no combined cross-product was run.",
      report.mode === "mock"
        ? "- Mock contract evidence: correctness, stability, and economics are unavailable; provider calls = 0."
        : "- Live Stage B economics remain exploratory and are not a promotion gate because no baseline arm was run.",
      "- The exploratory exception does not authorize promotion, default changes, or adapter expansion.",
      "- Decision: no promotion.",
      "",
    ].join("\n"));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  const mock = process.argv.includes("--mock");
  const report = await runGenerationPolicyBenchmark({ mock });
  const root = resolve(process.cwd(), "../../..");
  const outputRoot = report.mode === "mock" ? tmpdir() : resolve(root, "docs/benchmarks");
  const manifestPath = resolve(outputRoot, "2026-10-10-generation-policy-stage-a-manifest.json");
  const resultsPath = resolve(outputRoot, "2026-10-10-generation-policy-stage-a-results.json");
  const reportPath = resolve(outputRoot, "2026-10-10-generation-policy-stage-a-report.md");
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
      report.mode === "mock"
        ? "- Mock contract evidence: correctness and stability are unavailable in this report; provider calls = 0."
        : "- Live provider economics: inconclusive by design; this exploratory run does not authorize promotion.",
      report.mode === "live"
        ? "- Router cache telemetry: inspect the existing TokenPilot event trace with report-cache-audit-codex; no router settings were changed."
        : "- Live traffic: not run.",
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
