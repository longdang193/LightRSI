import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { performance } from "node:perf_hooks";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createContextCleanerControlPlane,
  createContextCleanerControlService,
  type ContextCleanOccurrenceSelection,
  type ContextCleanSnapshot,
} from "@lightrsi/cleaner";
import {
  createTemporaryAcceptanceEnvironment,
  readJsonFile,
  reserveUnusedPort,
  sessionSnapshotPath,
  writeJsonFileAtomic,
} from "@lightrsi/host-adapter";

import {
  defaultTokenPilotConfigPath,
  loadTokenPilotCodexConfig,
  normalizeTokenPilotCodexConfig,
  resolveUpstreamProvider,
} from "../src/config.js";
import { createCodexContextCleanerBridge } from "../src/context-cleaner/index.js";
import { buildCodexEffectiveHistoryView, readCodexContextHistoryJournal } from "../src/context-history/index.js";
import { loadCodexSessionSnapshot } from "../src/session-state.js";
import { loadProviderEnvFile, providerModelFromEnvironment } from "./context-rebase-smoke.js";
import { createBenchmarkTiming, type BenchmarkTimingSnapshot } from "../src/benchmark-timing.js";
import { createConsoleLogger } from "../src/logger.js";
import { computeEncodedProviderWirePrefixDiagnostics, startCodexResponsesProxy } from "../src/proxy-runtime.js";

type JsonObject = Record<string, unknown>;
type Arm = "baseline" | "cleaner";
type FixtureName = "short/early" | "long/early" | "long/late" | "recovery/early";
type CacheCondition = "cold" | "warm";
type AttemptOutcome = "pending" | "success" | "provider_error" | "transport_error" | "timeout" | "cancelled";

type StageBFixtureSpec = {
  id: FixtureName;
  releasePosition: "early" | "late";
  cacheCondition: CacheCondition;
  recovery: boolean;
  noiseBefore: number;
  noiseBetween: number;
};

type StageBManifest = {
  experiment: string;
  runtimeSha: string;
  benchmarkSha: string;
  comparison: { keep: Arm; release: Arm };
  releaseMode: ReleaseMode;
  controls: { causalPairs: boolean; armOrder: string };
  measurement: Record<string, string>;
  fixtures: StageBFixtureSpec[];
  provider: JsonObject;
  repetitions: number;
  spendingCapUsd: number | string;
  outcomes: string[];
  decisionStates: string[];
  acceptance: JsonObject;
};

type Fixture = {
  name: FixtureName;
  releasePosition: StageBFixtureSpec["releasePosition"];
  cacheCondition: CacheCondition;
  recovery: boolean;
  noiseBefore: string[];
  noiseBetween: string[];
  retained: string;
  releaseA: string;
  releaseB: string;
};

type UpstreamRequest = {
  attemptIndex: number;
  body: JsonObject;
  inputBytes: number;
  startedAt: number;
  headersAt: number;
  firstChunkAt: number;
  finishedAt: number;
  providerUsage: ProviderUsage | null;
  providerLatencyMs: number | null;
  providerHeadersLatencyMs: number | null;
  promptCacheKey: string | null;
  responsePromptCacheKey: string | null;
  providerWirePrefixHash: string;
  providerWirePrefixItemCount: number;
  promptCacheBreakpoint: boolean;
  outputItemTypes: string[];
  outcome: AttemptOutcome;
  failureReason: string | null;
};

type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
};

type UsageField = "inputTokens" | "outputTokens" | "cachedInputTokens";
type UsageCompletenessStatus = "complete" | "incomplete" | "unavailable";

type UsageSummary = {
  expectedRequests: number;
  observedRequests: number;
  observedByField: Record<UsageField, number>;
  status: UsageCompletenessStatus;
  invalidReasons: string[];
  totals: Record<UsageField, number | null>;
};

export type ProviderPricing = {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

type ReleaseMode = "lifecycle" | "one-release";

export type BreakEvenCheckpoint = {
  label: string;
  keepCost: number;
  releaseCost: number;
  netSavings: number;
};

export type BreakEvenSummary = {
  checkpoints: BreakEvenCheckpoint[];
  firstBreakEven: string | null;
  sustainedBreakEven: boolean;
};

type BenchmarkMode = "mock" | "live";

type LiveOptions = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type GitPreflight = {
  status: "clean_match" | "clean_mismatch" | "dirty";
  actualSha: string | null;
  expectedRuntimeSha: string;
  expectedBenchmarkSha: string;
  runtimeMatch: boolean | null;
  benchmarkMatch: boolean | null;
};

const BENCHMARK_STABLE_INSTRUCTIONS = "Stable benchmark policy. ".repeat(512).trim();

type TurnResult = {
  label: string;
  inputBytes: number;
  inputItemCount: number;
  historyPreparationMs: number;
  serializationMs: number;
  timing: BenchmarkTimingSnapshot;
};

type RunResult = {
  fixture: FixtureName;
  releasePosition: StageBFixtureSpec["releasePosition"];
  cacheCondition: CacheCondition;
  recovery: boolean;
  arm: Arm;
  repetition: number;
  passed: boolean;
  upstreamRequestCount: number;
  turns: TurnResult[];
  localInputBytes: number[];
  releaseOverheadMs: number;
  providerUsage: Array<ProviderUsage | null> | null;
  providerShape: ProviderShape[] | null;
  seedRequestCount: number;
  attempts: Array<{
    attemptIndex: number;
    checkpoint: string;
    outcome: AttemptOutcome;
    failureReason: string | null;
    inputBytes: number;
    providerUsage: ProviderUsage | null;
  }>;
  executionStatus: "complete" | "partial" | "failed";
  measurementStatus: UsageCompletenessStatus;
  correctnessStatus: "pass" | "fail" | "unavailable";
  economicStatus: "pass" | "fail" | "inconclusive";
  failure?: string;
};

type BenchmarkSeed = {
  stateDir: string;
  sessionId: string;
  history: JsonObject[];
  turns: TurnResult[];
  requests: UpstreamRequest[];
  cleanup(): void;
};

export type ProviderShape = {
  inputBytes: number;
  inputFingerprint: string;
  userItemCount: number;
  replayableItemCount: number;
  inputTypeCounts: Record<string, number>;
  outputItemTypes: string[];
  providerLatencyMs: number | null;
  providerHeadersLatencyMs: number | null;
  promptCacheKey?: string | null;
  responsePromptCacheKey?: string | null;
  providerWirePrefixHash?: string;
  providerWirePrefixItemCount?: number;
  promptCacheBreakpoint?: boolean;
};

async function loadStageBManifest(): Promise<{ manifest: StageBManifest; path: string }> {
  const relativePath = join("docs", "superpowers", "experiments", "2026-09-24-context-cleaner-stage-b.json");
  const candidates = [
    process.env.LIGHTRSI_BENCHMARK_MANIFEST?.trim(),
    join(process.cwd(), relativePath),
    join(process.cwd(), "..", "..", "..", relativePath),
  ].filter((value): value is string => Boolean(value));
  let lastError: unknown;
  for (const path of candidates) {
    try {
      const raw = await readFile(path);
      const manifest = JSON.parse(raw.toString("utf8")) as StageBManifest;
      assert.equal(manifest.experiment, "context-cleaner-stage-b");
      assert.ok(manifest.fixtures.length === 4, "Stage B manifest must define four fixtures");
      assert.ok(manifest.comparison.keep === "baseline" && manifest.comparison.release === "cleaner");
      return { manifest, path };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Stage B manifest unavailable: ${String(lastError)}`);
}

function createFixture(name: FixtureName, manifest: StageBManifest): Fixture {
  const spec = manifest.fixtures.find((fixture) => fixture.id === name);
  assert.ok(spec, `unknown Stage B fixture: ${name}`);
  const makeNoise = (prefix: string, count: number) => Array.from(
    { length: count },
    (_, index) => `${prefix}_${String(index + 1).padStart(2, "0")}_${"noise ".repeat(count < 10 ? 8 : 80)}`,
  );
  return {
    name,
    releasePosition: spec.releasePosition,
    cacheCondition: spec.cacheCondition,
    recovery: spec.recovery,
    noiseBefore: makeNoise("NOISE_BEFORE", spec.noiseBefore),
    noiseBetween: makeNoise("NOISE_BETWEEN", spec.noiseBetween),
    retained: `RETAINED_${name.replace("/", "_")}`,
    releaseA: `RELEASE_A_${name.replace("/", "_")}`,
    releaseB: `RELEASE_B_${name.replace("/", "_")}`,
  };
}

function responseEvent(event: string, payload: JsonObject): string {
  return `event: ${event}\ndata: ${JSON.stringify({ type: event, ...payload })}\n\n`;
}

async function startUpstream(initialRequestCount = 0): Promise<{
  baseUrl: string;
  requests: UpstreamRequest[];
  close(): Promise<void>;
}> {
  const requests: UpstreamRequest[] = [];
  const server: Server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/responses") {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    const startedAt = performance.now();
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonObject;
    const inputBytes = Buffer.byteLength(JSON.stringify(body.input ?? body), "utf8");
    const responseId = `benchmark-response-${initialRequestCount + requests.length + 1}`;
    const assistantText = `ACK_${responseId}`;
    response.statusCode = 200;
    response.setHeader("content-type", "text/event-stream; charset=utf-8");
    response.setHeader("cache-control", "no-cache");
    response.write(responseEvent("response.created", {
      response: { id: responseId, status: "in_progress" },
    }));
    const headersAt = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 1));
    const itemId = `message-${responseId}`;
    response.write(responseEvent("response.output_item.added", {
      output_index: 0,
      item: { id: itemId, type: "message", role: "assistant", content: [] },
    }));
    await new Promise((resolve) => setTimeout(resolve, 1));
    response.write(responseEvent("response.output_text.delta", {
      item_id: itemId,
      output_index: 0,
      delta: assistantText,
    }));
    const firstChunkAt = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 1));
    response.write(responseEvent("response.output_text.done", {
      item_id: itemId,
      output_index: 0,
      text: assistantText,
    }));
    await new Promise((resolve) => setTimeout(resolve, 1));
    response.end(`${responseEvent("response.completed", {
      response: { id: responseId, status: "completed" },
    })}data: [DONE]\n\n`);
    const finishedAt = performance.now();
    const prefixDiagnostics = computeEncodedProviderWirePrefixDiagnostics(body);
    requests.push({
      attemptIndex: initialRequestCount + requests.length,
      body,
      inputBytes,
      startedAt,
      headersAt,
      firstChunkAt,
      finishedAt,
      providerUsage: null,
      providerLatencyMs: finishedAt - startedAt,
      providerHeadersLatencyMs: headersAt - startedAt,
      promptCacheKey: typeof body.prompt_cache_key === "string" ? body.prompt_cache_key : null,
      responsePromptCacheKey: null,
      providerWirePrefixHash: prefixDiagnostics.fullHash,
      providerWirePrefixItemCount: prefixDiagnostics.inputItems.length,
      promptCacheBreakpoint: hasPromptCacheBreakpoint(body.input),
      outputItemTypes: ["message"],
      outcome: "success",
      failureReason: null,
    });
  });
  const port = await reserveUnusedPort();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function providerUsage(value: unknown): ProviderUsage | null {
  if (!value || typeof value !== "object") return null;
  const usage = (value as JsonObject).usage;
  if (!usage || typeof usage !== "object") return null;
  const details = (usage as JsonObject).input_tokens_details;
  const promptDetails = (usage as JsonObject).prompt_tokens_details;
  const detailObject = details && typeof details === "object" ? details : promptDetails;
  return {
    inputTokens: numberValue((usage as JsonObject).input_tokens ?? (usage as JsonObject).prompt_tokens),
    outputTokens: numberValue((usage as JsonObject).output_tokens ?? (usage as JsonObject).completion_tokens),
    totalTokens: numberValue((usage as JsonObject).total_tokens),
    cachedInputTokens: detailObject && typeof detailObject === "object"
      ? numberValue((detailObject as JsonObject).cached_tokens)
      : null,
  };
}

function hasPromptCacheBreakpoint(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((item) => {
    if (!item || typeof item !== "object") return false;
    const content = (item as JsonObject).content;
    return Array.isArray(content) && content.some((block: unknown) => (
      block && typeof block === "object" && "prompt_cache_breakpoint" in (block as JsonObject)
    ));
  });
}

async function consumeProviderResponse(response: Response, request: UpstreamRequest): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    request.finishedAt = performance.now();
    request.providerLatencyMs = request.finishedAt - request.startedAt;
    request.outcome = response.ok ? "success" : "provider_error";
    if (!response.ok) request.failureReason = `provider_status:${response.status}`;
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  const outputTypes = new Map<number, string>();
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    buffer += decoder.decode(next.value, { stream: true });
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6)) as JsonObject;
        if ((event.type === "response.output_item.added" || event.type === "response.output_item.done")
          && typeof event.output_index === "number"
          && event.item && typeof event.item === "object"
          && typeof (event.item as JsonObject).type === "string") {
          outputTypes.set(event.output_index, (event.item as JsonObject).type as string);
        }
        if (typeof event.type === "string" && /output_text|content_part/iu.test(event.type) && !request.firstChunkAt) {
          request.firstChunkAt = performance.now();
        }
        request.providerUsage = providerUsage(event.response) ?? providerUsage(event) ?? request.providerUsage;
        const eventResponse = event.response && typeof event.response === "object"
          ? event.response as JsonObject
          : event;
        const responsePromptCacheKey = typeof eventResponse.prompt_cache_key === "string"
          ? eventResponse.prompt_cache_key
          : null;
        if (responsePromptCacheKey) request.responsePromptCacheKey = responsePromptCacheKey;
      } catch {
        // Provider stream diagnostics stay in memory only; malformed events remain unknown.
      }
    }
  }
  request.finishedAt = performance.now();
  request.providerLatencyMs = request.finishedAt - request.startedAt;
  request.outputItemTypes = [...outputTypes.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, type]) => type);
  request.outcome = response.ok ? "success" : "provider_error";
  if (!response.ok) request.failureReason = `provider_status:${response.status}`;
}

export function captureLiveProvider(baseUrl: string): {
  requests: UpstreamRequest[];
  close(): Promise<void>;
} {
  const originalFetch = globalThis.fetch;
  const requests: UpstreamRequest[] = [];
  const pending = new Set<Promise<void>>();
  const endpointPrefix = baseUrl.replace(/\/+$/u, "");
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(`${endpointPrefix}/responses`)) return originalFetch(input, init);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) as JsonObject : {};
    const inputValue = body.input ?? body;
    const prefixDiagnostics = computeEncodedProviderWirePrefixDiagnostics(body);
    const request: UpstreamRequest = {
      attemptIndex: requests.length,
      body,
      inputBytes: Buffer.byteLength(JSON.stringify(inputValue), "utf8"),
      startedAt: performance.now(),
      headersAt: 0,
      firstChunkAt: 0,
      finishedAt: 0,
      providerUsage: null,
      providerLatencyMs: null,
      providerHeadersLatencyMs: null,
      promptCacheKey: typeof body.prompt_cache_key === "string" ? body.prompt_cache_key : null,
      responsePromptCacheKey: null,
      providerWirePrefixHash: prefixDiagnostics.fullHash,
      providerWirePrefixItemCount: prefixDiagnostics.inputItems.length,
      promptCacheBreakpoint: hasPromptCacheBreakpoint(body.input),
      outputItemTypes: [],
      outcome: "pending",
      failureReason: null,
    };
    requests.push(request);
    try {
      const response = await originalFetch(input, init);
      request.headersAt = performance.now();
      request.providerHeadersLatencyMs = request.headersAt - request.startedAt;
      const task = consumeProviderResponse(response.clone(), request)
        .catch((error: unknown) => {
          request.finishedAt = performance.now();
          request.providerLatencyMs = request.finishedAt - request.startedAt;
          request.outcome = "provider_error";
          request.failureReason = error instanceof Error ? error.message : String(error);
        });
      pending.add(task);
      void task.finally(() => pending.delete(task)).catch(() => undefined);
      return response;
    } catch (error) {
      request.finishedAt = performance.now();
      request.providerLatencyMs = request.finishedAt - request.startedAt;
      request.outcome = error instanceof DOMException && error.name === "TimeoutError"
        ? "timeout"
        : "transport_error";
      request.failureReason = error instanceof Error ? error.message : String(error);
      throw error;
    }
  };
  return {
    requests,
    async close(): Promise<void> {
      globalThis.fetch = originalFetch;
      await Promise.all(pending);
    },
  };
}

function userItems(snapshot: ContextCleanSnapshot) {
  return snapshot.items.filter((item) => item.role === "user" || item.kind === "user");
}

function releaseSelection(
  snapshot: ContextCleanSnapshot,
  userIndex: number,
  retainedFindings: string[] = [],
): ContextCleanOccurrenceSelection {
  const item = userItems(snapshot)[userIndex];
  assert.ok(item, `missing user occurrence ${userIndex}`);
  return {
    stableId: item.stableId,
    fingerprint: item.fingerprint,
    completionEvidence: [item.stableId],
    continuingUseful: false,
    releaseIntent: "release",
    retainedFindings,
    nothingReusable: retainedFindings.length === 0,
    dependencyDirection: "none",
  };
}

function durableCompletionWait(turn: TurnResult | undefined): number {
  const durable = turn?.timing.durationsMs.handlerToDurableCompletion;
  const finished = turn?.timing.durationsMs.handlerToFinish;
  return durable !== undefined && finished !== undefined ? Math.max(0, durable - finished) : 0;
}

export function userInputText(request: UpstreamRequest): string {
  const input = request.body.input;
  if (!Array.isArray(input)) return JSON.stringify(input ?? request.body);
  return input
    .filter((item): item is JsonObject => Boolean(item && typeof item === "object" && (item as JsonObject).role === "user"))
    .map((item) => JSON.stringify(item.content ?? item))
    .join("\n");
}

function providerShape(request: UpstreamRequest): ProviderShape {
  const input = request.body.input;
  const items = Array.isArray(input)
    ? input.filter((item): item is JsonObject => Boolean(item && typeof item === "object"))
    : [];
  return {
    inputBytes: request.inputBytes,
    inputFingerprint: createHash("sha256").update(JSON.stringify(input ?? request.body)).digest("hex"),
    userItemCount: items.filter((item) => item.role === "user").length,
    replayableItemCount: items.filter((item) => typeof item.type === "string").length,
    inputTypeCounts: items.reduce<Record<string, number>>((counts, item) => {
      if (typeof item.type === "string") counts[item.type] = (counts[item.type] ?? 0) + 1;
      return counts;
    }, {}),
    outputItemTypes: request.outputItemTypes,
    providerLatencyMs: request.providerLatencyMs,
    providerHeadersLatencyMs: request.providerHeadersLatencyMs,
    promptCacheKey: request.promptCacheKey,
    responsePromptCacheKey: request.responsePromptCacheKey,
    providerWirePrefixHash: request.providerWirePrefixHash,
    providerWirePrefixItemCount: request.providerWirePrefixItemCount,
    promptCacheBreakpoint: request.promptCacheBreakpoint,
  };
}

export function providerShapesComparableBeforeRelease(
  baselineLabels: readonly string[],
  baselineShapes: readonly ProviderShape[] | null,
  cleanerLabels: readonly string[],
  cleanerShapes: readonly ProviderShape[] | null,
  releasePosition: StageBFixtureSpec["releasePosition"] = "late",
): boolean {
  if (!baselineShapes || !cleanerShapes) return true;
  const boundaryLabel = releasePosition === "early"
    ? baselineLabels.find((label) => label.startsWith("noise_before_")) ?? "after_release_a"
    : "after_release_a";
  const baselineBoundary = baselineLabels.indexOf(boundaryLabel);
  const cleanerBoundary = cleanerLabels.indexOf(boundaryLabel);
  if (baselineBoundary < 0 || cleanerBoundary < 0 || baselineBoundary !== cleanerBoundary) return false;
  for (let index = 0; index < baselineBoundary; index += 1) {
    const baseline = baselineShapes[index];
    const cleaner = cleanerShapes[index];
    if (baseline?.inputFingerprint !== cleaner?.inputFingerprint) return false;
    if (baseline?.promptCacheKey !== undefined
      && cleaner?.promptCacheKey !== undefined
      && baseline.promptCacheKey !== cleaner.promptCacheKey) return false;
    if (baseline?.providerWirePrefixHash !== undefined
      && cleaner?.providerWirePrefixHash !== undefined
      && baseline.providerWirePrefixHash !== cleaner.providerWirePrefixHash) return false;
    if (baseline?.promptCacheBreakpoint !== undefined
      && cleaner?.promptCacheBreakpoint !== undefined
      && baseline.promptCacheBreakpoint !== cleaner.promptCacheBreakpoint) return false;
  }
  return true;
}

function assertMarker(text: string, marker: string, expected: boolean, label: string): void {
  const observed = text.includes(marker);
  if (observed !== expected) {
    throw new Error(`forwarded marker assertion failed: ${label}; marker=${marker}; expected=${expected}; observed=${observed}`);
  }
}

async function sendTurn(params: {
  runtime: Awaited<ReturnType<typeof startCodexResponsesProxy>>;
  sessionId: string;
  model: string;
  history: JsonObject[];
  label: string;
  content: string;
  requestTimeoutMs: number;
  durableCompletion?: () => Promise<void>;
}): Promise<{ history: JsonObject[]; result: TurnResult }> {
  const timing = createBenchmarkTiming();
  timing.mark("handlerStart");
  const preparationStartedAt = performance.now();
  const input = [...params.history, { role: "user", content: params.content }];
  const historyPreparationMs = performance.now() - preparationStartedAt;
  timing.mark("bodyComplete");
  const serializationStartedAt = performance.now();
  const requestBody = JSON.stringify({
    model: params.model,
    stream: true,
    instructions: BENCHMARK_STABLE_INSTRUCTIONS,
    metadata: { tokenpilotSessionId: params.sessionId },
    input,
  });
  const serializationMs = performance.now() - serializationStartedAt;
  timing.mark("dispatchStart");
  const response = await fetch(`${params.runtime.baseUrl}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: requestBody,
    signal: AbortSignal.timeout(params.requestTimeoutMs),
  });
  assert.equal(response.status, 200);
  timing.mark("upstreamHeaders");
  const reader = response.body?.getReader();
  assert.ok(reader, "stream response body missing");
  const decoder = new TextDecoder();
  let buffer = "";
  const outputItems = new Map<number, JsonObject>();
  const outputTexts = new Map<number, string>();
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    const chunk = decoder.decode(next.value, { stream: true });
    buffer += chunk;
    const lines = buffer.split(/\r?\n/u);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6)) as JsonObject;
        const eventType = typeof event.type === "string" ? event.type : "";
        if (/output_text|content_part/iu.test(eventType) && eventType.endsWith(".delta")) {
          timing.mark("firstUsefulOutput");
        }
        const outputIndex = typeof event.output_index === "number" ? event.output_index : null;
        if (outputIndex !== null && eventType === "response.output_item.added" && event.item && typeof event.item === "object") {
          outputItems.set(outputIndex, event.item as JsonObject);
        }
        if (outputIndex !== null && eventType === "response.output_item.done" && event.item && typeof event.item === "object") {
          outputItems.set(outputIndex, event.item as JsonObject);
        }
        if (outputIndex !== null && eventType === "response.output_text.delta" && typeof event.delta === "string") {
          outputTexts.set(outputIndex, `${outputTexts.get(outputIndex) ?? ""}${event.delta}`);
        }
        if (outputIndex !== null && eventType === "response.output_text.done" && typeof event.text === "string") {
          outputTexts.set(outputIndex, event.text);
        }
      } catch {
        // Invalid provider events remain outside benchmark history.
      }
    }
  }
  timing.mark("responseFinish");
  await params.durableCompletion?.();
  timing.mark("durableCompletion");
  const assistantItems = [...outputItems.entries()]
    .sort(([left], [right]) => left - right)
    .map(([outputIndex, item]) => {
      const text = outputTexts.get(outputIndex);
      return text !== undefined && item.type === "message"
        ? { ...item, content: [{ type: "output_text", text }] }
        : item;
    });
  const assistantItemsWithFallback = assistantItems.length > 0
    ? assistantItems
    : [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ACK_UNKNOWN" }] }];
  return {
    history: [...input, ...assistantItemsWithFallback],
    result: {
      label: params.label,
      inputBytes: Buffer.byteLength(JSON.stringify(input), "utf8"),
      inputItemCount: input.length,
      historyPreparationMs,
      serializationMs,
      timing: timing.snapshot("streamed"),
    },
  };
}

async function waitForApplied(
  cleaner: ReturnType<typeof createContextCleanerControlService>,
  planId: string,
  stateDir: string,
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if ((await cleaner.readReceipt(planId))?.status === "applied") return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  let trace = "";
  try {
    trace = await readFile(join(stateDir, "event-trace.jsonl"), "utf8");
  } catch {
    trace = "trace unavailable";
  }
  throw new Error(`cleaner receipt did not apply: ${planId}\n${trace.slice(-4000)}`);
}

async function cleanerTraceSummary(stateDir: string): Promise<string> {
  try {
    const lines = (await readFile(join(stateDir, "event-trace.jsonl"), "utf8")).trim().split(/\r?\n/u);
    const entries = lines.flatMap((line) => {
      try {
        const value = JSON.parse(line) as JsonObject;
        return [{
          stage: value.stage ?? null,
          outcome: value.outcome ?? null,
          status: value.status ?? null,
          planId: value.planId ?? null,
          reasonCodes: value.reasonCodes ?? null,
        }];
      } catch {
        return [];
      }
    });
    return JSON.stringify(entries.slice(-12));
  } catch {
    return "unavailable";
  }
}

function summarizeAttempt(request: UpstreamRequest, checkpoint: string) {
  return {
    attemptIndex: request.attemptIndex,
    checkpoint,
    outcome: request.outcome,
    failureReason: request.failureReason,
    inputBytes: request.inputBytes,
    providerUsage: request.providerUsage,
  };
}

function runResultFromRequests(params: {
  fixture: Fixture;
  arm: Arm;
  repetition: number;
  mode: BenchmarkMode;
  seedRequestCount: number;
  turns: TurnResult[];
  requests: UpstreamRequest[];
  releaseOverheadMs: number;
  passed: boolean;
  failure?: string;
}): RunResult {
  const usage = params.mode === "live" ? params.requests.map((request) => request.providerUsage) : null;
  const measurementStatus = params.mode === "live"
    ? summarizeUsageValues(usage, params.requests.length).status
    : "unavailable";
  const completeTiming = params.turns.every((turn) => turn.timing.complete);
  return {
    fixture: params.fixture.name,
    releasePosition: params.fixture.releasePosition,
    cacheCondition: params.fixture.cacheCondition,
    recovery: params.fixture.recovery,
    arm: params.arm,
    repetition: params.repetition,
    passed: params.passed,
    upstreamRequestCount: params.requests.length,
    turns: params.turns,
    localInputBytes: params.requests.map((request) => request.inputBytes),
    releaseOverheadMs: params.releaseOverheadMs,
    providerUsage: usage,
    providerShape: params.mode === "live" ? params.requests.map(providerShape) : null,
    seedRequestCount: params.seedRequestCount,
    attempts: params.requests.map((request, index) => summarizeAttempt(request, params.turns[index]?.label ?? `provider_attempt_${index}`)),
    executionStatus: params.passed && completeTiming ? "complete" : params.requests.length > 0 ? "partial" : "failed",
    measurementStatus,
    correctnessStatus: params.passed ? "pass" : "fail",
    economicStatus: "inconclusive",
    ...(params.failure ? { failure: params.failure } : {}),
  };
}

async function copyHistoryState(sourceDir: string, targetDir: string): Promise<void> {
  for (const directory of ["context-history", "session-state"]) {
    const sourcePath = join(sourceDir, directory);
    for (const entry of await readdir(sourcePath)) {
      await cp(join(sourcePath, entry), join(targetDir, directory, entry), { recursive: true, force: true });
    }
  }
}

async function waitForSeedDurability(stateDir: string, sessionId: string, expectedTurns: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const journal = await readCodexContextHistoryJournal(stateDir, sessionId);
    const requests = journal.entries.filter((entry) => entry.kind === "request").length;
    const responses = journal.entries.filter((entry) => entry.kind === "response").length;
    if (requests >= expectedTurns && responses >= expectedTurns && await loadCodexSessionSnapshot(stateDir, sessionId)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`benchmark seed durability timeout: ${sessionId}`);
}

function benchmarkConfig(
  stateDir: string,
  mode: BenchmarkMode,
  liveOptions: LiveOptions | undefined,
  upstreamBaseUrl: string | undefined,
) {
  return normalizeTokenPilotCodexConfig({
    stateDir,
    proxyPort: 0,
    upstreamProvider: "OpenAI",
    upstream: {
      baseUrl: upstreamBaseUrl ?? liveOptions!.baseUrl,
      apiKey: liveOptions?.apiKey,
      wireApi: "responses",
      requiresOpenAIAuth: mode === "live",
    },
    modules: { stabilizer: true, reduction: false },
    contextRewrite: {
      enabled: true,
      providerCompatibilityProbe: mode === "live" ? "real_provider" : "mock_fixture",
    },
  } as any);
}

async function createBenchmarkSeed(
  fixture: Fixture,
  releaseMode: ReleaseMode,
  mode: BenchmarkMode,
  repetition: number,
  requestTimeoutMs: number,
  liveOptions?: LiveOptions,
): Promise<BenchmarkSeed> {
  const environment = createTemporaryAcceptanceEnvironment(`lightrsi-cleaner-benchmark-seed-`);
  const upstream = mode === "mock" ? await startUpstream() : undefined;
  const liveCapture = mode === "live" ? captureLiveProvider(liveOptions!.baseUrl) : undefined;
  const sessionId = `cleaner-benchmark-${fixture.name}-pair-${repetition}`;
  const config = benchmarkConfig(environment.stateDir, mode, liveOptions, upstream?.baseUrl);
  let runtime: Awaited<ReturnType<typeof startCodexResponsesProxy>> | undefined;
  const turns: TurnResult[] = [];
  let history: JsonObject[] = [];
  try {
    runtime = await startCodexResponsesProxy({
      config,
      logger: createConsoleLogger(false),
      allowMockFixtureEvidence: true,
    });
    const send = async (label: string, content: string) => {
      const sent = await sendTurn({
        runtime: runtime!,
        sessionId,
        model: liveOptions?.model ?? "gpt-5.4-mini",
        history,
        label,
        content,
        requestTimeoutMs,
      });
      history = sent.history;
      turns.push(sent.result);
    };
    await send("retained", fixture.retained);
    await send("release_a", fixture.releaseA);
    if (fixture.releasePosition === "late") {
      for (const [index, content] of fixture.noiseBefore.entries()) await send(`noise_before_${index}`, content);
    }
    await runtime.close();
    runtime = undefined;
    await waitForSeedDurability(environment.stateDir, sessionId, turns.length);
    await liveCapture?.close();
    const requests = upstream?.requests ?? liveCapture?.requests ?? [];
    await upstream?.close();
    return { stateDir: environment.stateDir, sessionId, history, turns, requests, cleanup: environment.cleanup };
  } catch (error) {
    await runtime?.close();
    await liveCapture?.close();
    await upstream?.close();
    environment.cleanup();
    throw error;
  }
}

async function runArm(
  fixture: Fixture,
  releaseMode: ReleaseMode,
  arm: Arm,
  repetition: number,
  mode: BenchmarkMode,
  liveOptions?: LiveOptions,
  seed?: BenchmarkSeed,
  requestTimeoutMs = 120_000,
): Promise<RunResult> {
  const environment = createTemporaryAcceptanceEnvironment(`lightrsi-cleaner-benchmark-${arm}-`);
  if (seed) {
    await copyHistoryState(seed.stateDir, environment.stateDir);
    const clonedSnapshotPath = sessionSnapshotPath(environment.stateDir, seed.sessionId);
    const clonedSnapshot = await readJsonFile<Record<string, unknown>>(clonedSnapshotPath);
    if (clonedSnapshot && "transcriptPath" in clonedSnapshot) {
      delete clonedSnapshot.transcriptPath;
      await writeJsonFileAtomic(clonedSnapshotPath, clonedSnapshot);
    }
    const sourceJournal = await readCodexContextHistoryJournal(seed.stateDir, seed.sessionId);
    const targetJournal = await readCodexContextHistoryJournal(environment.stateDir, seed.sessionId);
    assert.deepEqual(targetJournal.entries, sourceJournal.entries, "causal seed journal clone mismatch");
    const targetSession = await loadCodexSessionSnapshot(environment.stateDir, seed.sessionId);
    assert.ok(targetSession, "causal seed session clone missing");
    const targetView = await buildCodexEffectiveHistoryView({
      stateDir: environment.stateDir,
      sessionId: seed.sessionId,
      headResponseId: targetSession.latestResponseId,
    });
    assert.equal(targetView.reasonCodes.length, 0, `causal seed clone incomplete: ${targetView.reasonCodes.join(",")}`);
  }
  const upstream = mode === "mock" ? await startUpstream(seed?.requests.length ?? 0) : undefined;
  const liveCapture = mode === "live" ? captureLiveProvider(liveOptions!.baseUrl) : undefined;
  const sessionId = seed?.sessionId ?? `cleaner-benchmark-${fixture.name}-${arm}-${repetition}`;
  const config = benchmarkConfig(environment.stateDir, mode, liveOptions, upstream?.baseUrl);
  let runtime: Awaited<ReturnType<typeof startCodexResponsesProxy>> | undefined;
  const turns: TurnResult[] = seed ? structuredClone(seed.turns) : [];
  let history: JsonObject[] = seed ? structuredClone(seed.history) : [];
  let firstReleasePlan: string | undefined;
  let secondReleasePlan: string | undefined;
  let releaseOverheadMs = 0;
  let captureClosed = false;
  const closeCapture = async () => {
    if (captureClosed) return;
    captureClosed = true;
    await liveCapture?.close();
  };
  try {
    runtime = await startCodexResponsesProxy({
      config,
      logger: createConsoleLogger(false),
      allowMockFixtureEvidence: true,
    });
    const controlPlane = createContextCleanerControlPlane({ stateDir: environment.stateDir });
    const bridge = createCodexContextCleanerBridge({ stateDir: environment.stateDir, controlPlane, boundSessionId: sessionId });
    const cleaner = createContextCleanerControlService({ stateDir: environment.stateDir, bridge });
    const send = async (label: string, content: string, planId?: string) => {
      const sent = await sendTurn({
        runtime: runtime!,
        sessionId,
        model: liveOptions?.model ?? "gpt-5.4-mini",
        history,
        label,
        content,
        requestTimeoutMs,
        durableCompletion: planId
          ? async () => { await waitForApplied(cleaner, planId, environment.stateDir); }
          : undefined,
      });
      history = sent.history;
      turns.push(sent.result);
    };
    if (!seed) {
      await send("retained", fixture.retained);
      await send("release_a", fixture.releaseA);
      if (fixture.releasePosition === "late") {
        for (const [index, content] of fixture.noiseBefore.entries()) await send(`noise_before_${index}`, content);
      }
    }
    if (arm === "cleaner") {
      if (seed) {
        const runtimeSession = await loadCodexSessionSnapshot(environment.stateDir, sessionId);
        assert.ok(runtimeSession, "causal runtime session missing");
        const runtimeView = await buildCodexEffectiveHistoryView({
          stateDir: environment.stateDir,
          sessionId,
          headResponseId: runtimeSession.latestResponseId,
        });
        assert.equal(runtimeView.reasonCodes.length, 0, `causal runtime clone incomplete: ${runtimeView.reasonCodes.join(",")}`);
      }
      const releaseStartedAt = performance.now();
      const snapshot = await cleaner.inspect(sessionId);
      const retained = userItems(snapshot)[0]?.stableId;
      firstReleasePlan = (await cleaner.releaseOccurrences(sessionId, [
        releaseSelection(snapshot, 1, retained ? [retained] : []),
      ])).planId;
      releaseOverheadMs += performance.now() - releaseStartedAt;
    }
    if (fixture.releasePosition === "early") {
      for (const [index, content] of fixture.noiseBefore.entries()) await send(`noise_before_${index}`, content);
    }
    if (releaseMode === "lifecycle") await send("release_b", fixture.releaseB);
    await send("after_release_a", "AFTER_RELEASE_A", firstReleasePlan);
    if (firstReleasePlan) releaseOverheadMs += durableCompletionWait(turns.at(-1));
    for (const [index, content] of fixture.noiseBetween.entries()) await send(`noise_between_${index}`, content);
    if (releaseMode === "lifecycle" && arm === "cleaner") {
      const releaseStartedAt = performance.now();
      const snapshot = await cleaner.inspect(sessionId);
      secondReleasePlan = (await cleaner.releaseOccurrences(sessionId, [
        releaseSelection(snapshot, 2 + fixture.noiseBefore.length),
      ])).planId;
      releaseOverheadMs += performance.now() - releaseStartedAt;
    }
    await send("after_release_b", "AFTER_RELEASE_B", secondReleasePlan);
    if (secondReleasePlan) releaseOverheadMs += durableCompletionWait(turns.at(-1));
    if (releaseMode === "lifecycle") {
      await runtime.close();
      runtime = await startCodexResponsesProxy({
        config,
        logger: createConsoleLogger(false),
        allowMockFixtureEvidence: true,
      });
      await send("after_restart", "AFTER_RESTART");
    }
    await closeCapture();
    const forwardedRequests = seed
      ? [...seed.requests, ...(upstream?.requests ?? liveCapture?.requests ?? [])]
      : upstream?.requests ?? liveCapture?.requests ?? [];
    turns.forEach((turn, index) => {
      const forwarded = forwardedRequests[index];
      if (forwarded) turn.inputBytes = forwarded.inputBytes;
    });
    const texts = forwardedRequests.map(userInputText);
    const releaseARequest = texts.findIndex((text) => text.includes("AFTER_RELEASE_A"));
    const releaseBRequest = texts.findIndex((text) => text.includes("AFTER_RELEASE_B"));
    const restartRequest = texts.findIndex((text) => text.includes("AFTER_RESTART"));
    if (releaseARequest < 0 || releaseBRequest < 0) {
      throw new Error(`forwarded request markers missing: releaseA=${releaseARequest}; releaseB=${releaseBRequest}`);
    }
    if (releaseMode === "one-release") {
      if (arm === "baseline") {
        assertMarker(texts[releaseARequest]!, fixture.releaseA, true, "baseline release A");
      } else {
        assertMarker(texts[releaseARequest]!, fixture.releaseA, false, "cleaner release A");
        assertMarker(texts[releaseARequest]!, fixture.retained, true, "cleaner retained release A");
      }
    } else if (arm === "baseline") {
      if (restartRequest < 0) throw new Error("forwarded restart marker missing");
      assertMarker(texts[releaseARequest]!, fixture.releaseA, true, "baseline release A");
      assertMarker(texts[releaseBRequest]!, fixture.releaseB, true, "baseline release B");
      assertMarker(texts[restartRequest]!, fixture.releaseA, true, "baseline restart release A");
      assertMarker(texts[restartRequest]!, fixture.releaseB, true, "baseline restart release B");
    } else {
      if (restartRequest < 0) throw new Error("forwarded restart marker missing");
      assertMarker(texts[releaseARequest]!, fixture.releaseA, false, "cleaner release A");
      assertMarker(texts[releaseARequest]!, fixture.releaseB, true, "cleaner retained release B");
      assertMarker(texts[releaseBRequest]!, fixture.releaseA, false, "cleaner release B release A");
      assertMarker(texts[releaseBRequest]!, fixture.releaseB, false, "cleaner release B");
      assertMarker(texts[restartRequest]!, fixture.releaseA, false, "cleaner restart release A");
      assertMarker(texts[restartRequest]!, fixture.releaseB, false, "cleaner restart release B");
      assertMarker(texts[restartRequest]!, fixture.retained, true, "cleaner restart retained");
    }
    return runResultFromRequests({
      fixture,
      arm,
      repetition,
      mode,
      seedRequestCount: seed?.requests.length ?? 0,
      turns,
      requests: forwardedRequests,
      releaseOverheadMs,
      passed: true,
    });
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    await closeCapture();
    const forwardedRequests = seed
      ? [...seed.requests, ...(upstream?.requests ?? liveCapture?.requests ?? [])]
      : upstream?.requests ?? liveCapture?.requests ?? [];
    return runResultFromRequests({
      fixture,
      arm,
      repetition,
      mode,
      seedRequestCount: seed?.requests.length ?? 0,
      turns,
      requests: forwardedRequests,
      releaseOverheadMs,
      passed: false,
      failure: `${failure}; cleanerTrace=${await cleanerTraceSummary(environment.stateDir)}`,
    });
  } finally {
    await closeCapture();
    await runtime?.close();
    await upstream?.close();
    environment.cleanup();
  }
}

function percentile(values: number[], rank: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * rank;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

function summarize(runs: RunResult[]) {
  const values = runs.flatMap((run) => run.turns.map((turn) => turn.timing.durationsMs.handlerToFinish ?? 0));
  const historyPreparation = runs.flatMap((run) => run.turns.map((turn) => turn.historyPreparationMs));
  const serialization = runs.flatMap((run) => run.turns.map((turn) => turn.serializationMs));
  return {
    samples: values.length,
    p50HandlerToFinishMs: percentile(values, 0.5),
    p95HandlerToFinishMs: percentile(values, 0.95),
    p50HistoryPreparationMs: percentile(historyPreparation, 0.5),
    p95HistoryPreparationMs: percentile(historyPreparation, 0.95),
    p50SerializationMs: percentile(serialization, 0.5),
    p95SerializationMs: percentile(serialization, 0.95),
    incompleteRequests: runs.flatMap((run) => run.turns).filter((turn) => !turn.timing.complete).length,
    totalInputBytes: runs.reduce((total, run) => total + run.localInputBytes.reduce((sum, bytes) => sum + bytes, 0), 0),
  };
}

function pairedDifferences(runs: RunResult[]) {
  const baselineByKey = new Map(
    runs
      .filter((run) => run.arm === "baseline")
      .map((run) => [`${run.fixture}:${run.repetition}`, run]),
  );
  return runs
    .filter((run) => run.arm === "cleaner")
    .map((run) => {
      const baseline = baselineByKey.get(`${run.fixture}:${run.repetition}`);
      if (!baseline) throw new Error(`missing paired baseline for ${run.fixture}/${run.repetition}`);
      const baselineTurns = new Map(baseline.turns.map((turn) => [turn.label, turn]));
      const baselinePostSeedTurns = baseline.turns.slice(baseline.seedRequestCount);
      const cleanerPostSeedTurns = run.turns.slice(run.seedRequestCount);
      const baselinePostSeedUsage = baseline.providerUsage?.slice(baseline.seedRequestCount) ?? null;
      const cleanerPostSeedUsage = run.providerUsage?.slice(run.seedRequestCount) ?? null;
      return {
        fixture: run.fixture,
        repetition: run.repetition,
        measurementComparable: providerShapesComparableBeforeRelease(
          baseline.turns.map((turn) => turn.label),
          baseline.providerShape,
          run.turns.map((turn) => turn.label),
          run.providerShape,
          run.releasePosition,
        ),
        turns: run.turns.map((turn) => {
          const baselineTurn = baselineTurns.get(turn.label);
          const cleanerMs = turn.timing.durationsMs.handlerToFinish;
          const baselineMs = baselineTurn?.timing.durationsMs.handlerToFinish;
          return {
            label: turn.label,
            handlerToFinishDeltaMs: cleanerMs === undefined || baselineMs === undefined
              ? null
              : cleanerMs - baselineMs,
            inputBytesDelta: baselineTurn ? turn.inputBytes - baselineTurn.inputBytes : null,
          };
        }),
        localAccounting: cumulativeBreakEvenByLabel(
          baselinePostSeedTurns.map((turn) => ({
            label: turn.label,
            cost: turn.timing.durationsMs.handlerToFinish ?? 0,
          })),
          cleanerPostSeedTurns.map((turn, index) => ({
            label: turn.label,
            cost: (turn.timing.durationsMs.handlerToFinish ?? 0)
              + (index === cleanerPostSeedTurns.findIndex((candidate) => candidate.label === "after_release_a")
                ? run.releaseOverheadMs
                : 0),
          })),
        ),
        providerUsage: cleanerPostSeedUsage
          && baselinePostSeedUsage
          && providerShapesComparableBeforeRelease(
            baseline.turns.map((turn) => turn.label),
            baseline.providerShape,
            run.turns.map((turn) => turn.label),
            run.providerShape,
            run.releasePosition,
          )
          ? {
            ...compareProviderUsage(cleanerPostSeedUsage, baselinePostSeedUsage, cleanerPostSeedTurns.map((turn) => turn.label)),
          }
          : null,
      };
    });
}

export function cumulativeBreakEvenByLabel(
  keep: Array<{ label: string; cost: number }>,
  release: Array<{ label: string; cost: number }>,
): BreakEvenSummary {
  const labels = [...new Set([...keep, ...release].map((checkpoint) => checkpoint.label))];
  const keepByLabel = new Map(keep.map((checkpoint) => [checkpoint.label, checkpoint.cost]));
  const releaseByLabel = new Map(release.map((checkpoint) => [checkpoint.label, checkpoint.cost]));
  return cumulativeBreakEven(
    labels.map((label) => keepByLabel.get(label) ?? 0),
    labels.map((label) => releaseByLabel.get(label) ?? 0),
    labels,
  );
}

const USAGE_FIELDS: UsageField[] = ["inputTokens", "outputTokens", "cachedInputTokens"];

function validTokenCount(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function summarizeUsageValues(
  usages: Array<ProviderUsage | null> | null,
  expectedRequests: number,
): UsageSummary {
  const observedByField = Object.fromEntries(USAGE_FIELDS.map((field) => [field, 0])) as Record<UsageField, number>;
  const totals = Object.fromEntries(USAGE_FIELDS.map((field) => [field, null])) as Record<UsageField, number | null>;
  if (!usages) {
    return {
      expectedRequests,
      observedRequests: 0,
      observedByField,
      status: "unavailable",
      invalidReasons: ["provider_usage_unavailable"],
      totals,
    };
  }
  const invalidReasons = new Set<string>();
  if (usages.length !== expectedRequests) invalidReasons.add("request_count_mismatch");
  let observedRequests = 0;
  for (const [index, usage] of usages.entries()) {
    if (!usage) {
      invalidReasons.add(`missing_usage:${index}`);
      continue;
    }
    observedRequests += 1;
    for (const field of USAGE_FIELDS) {
      if (validTokenCount(usage[field])) observedByField[field] += 1;
      else invalidReasons.add(`missing_${field}:${index}`);
    }
    if (validTokenCount(usage.inputTokens)
      && validTokenCount(usage.cachedInputTokens)
      && usage.cachedInputTokens > usage.inputTokens) {
      invalidReasons.add(`cached_tokens_exceed_input:${index}`);
    }
  }
  const complete = expectedRequests > 0
    && usages.length === expectedRequests
    && invalidReasons.size === 0
    && USAGE_FIELDS.every((field) => observedByField[field] === expectedRequests);
  if (complete) {
    for (const field of USAGE_FIELDS) {
      totals[field] = usages.reduce((total, usage) => total + usage![field]!, 0);
    }
  }
  return {
    expectedRequests,
    observedRequests,
    observedByField,
    status: complete ? "complete" : observedRequests === 0 ? "unavailable" : "incomplete",
    invalidReasons: [...invalidReasons],
    totals,
  };
}

function gitOutput(args: string[]): string {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function evaluateGitPreflight(params: {
  actualSha: string | null;
  expectedRuntimeSha: string;
  expectedBenchmarkSha: string;
  clean: boolean;
}): GitPreflight {
  if (!params.clean) {
    return {
      status: "dirty",
      actualSha: null,
      expectedRuntimeSha: params.expectedRuntimeSha,
      expectedBenchmarkSha: params.expectedBenchmarkSha,
      runtimeMatch: null,
      benchmarkMatch: null,
    };
  }
  assert.ok(params.actualSha, "clean git preflight requires HEAD SHA");
  const runtimeMatch = params.actualSha === params.expectedRuntimeSha || params.actualSha.startsWith(params.expectedRuntimeSha);
  const benchmarkMatch = params.actualSha === params.expectedBenchmarkSha || params.actualSha.startsWith(params.expectedBenchmarkSha);
  return {
    status: runtimeMatch && benchmarkMatch ? "clean_match" : "clean_mismatch",
    actualSha: params.actualSha,
    expectedRuntimeSha: params.expectedRuntimeSha,
    expectedBenchmarkSha: params.expectedBenchmarkSha,
    runtimeMatch,
    benchmarkMatch,
  };
}

function readGitPreflight(expectedRuntimeSha: string, expectedBenchmarkSha: string): GitPreflight {
  const clean = gitOutput(["status", "--porcelain=v1", "--untracked-files=all"]) === "";
  return evaluateGitPreflight({
    actualSha: clean ? gitOutput(["rev-parse", "HEAD"]) : null,
    expectedRuntimeSha,
    expectedBenchmarkSha,
    clean,
  });
}

export function estimateProviderCost(
  summary: Pick<UsageSummary, "status" | "totals">,
  pricing: ProviderPricing,
): number | null {
  if (summary.status !== "complete") return null;
  const inputTokens = summary.totals.inputTokens;
  const cachedInputTokens = summary.totals.cachedInputTokens;
  const outputTokens = summary.totals.outputTokens;
  if (inputTokens === null || cachedInputTokens === null || outputTokens === null) return null;
  const uncachedInputTokens = inputTokens - cachedInputTokens;
  return (
    uncachedInputTokens * pricing.inputUsdPerMillion
    + cachedInputTokens * pricing.cachedInputUsdPerMillion
    + outputTokens * pricing.outputUsdPerMillion
  ) / 1_000_000;
}

function readProviderPricing(provider: JsonObject): ProviderPricing | null {
  const value = provider.pricing;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const pricing = value as JsonObject;
  const inputUsdPerMillion = pricing.inputUsdPerMillion;
  const cachedInputUsdPerMillion = pricing.cachedInputUsdPerMillion;
  const outputUsdPerMillion = pricing.outputUsdPerMillion;
  if (typeof inputUsdPerMillion !== "number"
    || !Number.isFinite(inputUsdPerMillion)
    || typeof cachedInputUsdPerMillion !== "number"
    || !Number.isFinite(cachedInputUsdPerMillion)
    || typeof outputUsdPerMillion !== "number"
    || !Number.isFinite(outputUsdPerMillion)) return null;
  return { inputUsdPerMillion, cachedInputUsdPerMillion, outputUsdPerMillion };
}

export function usageDelta(
  cleaner: Array<ProviderUsage | null>,
  baseline: Array<ProviderUsage | null>,
  field: UsageField,
): number | null {
  if (cleaner.length !== baseline.length) return null;
  const cleanerSummary = summarizeUsageValues(cleaner, cleaner.length);
  const baselineSummary = summarizeUsageValues(baseline, baseline.length);
  if (cleanerSummary.status !== "complete" || baselineSummary.status !== "complete") return null;
  return cleanerSummary.totals[field]! - baselineSummary.totals[field]!;
}

export function compareProviderUsage(
  cleaner: Array<ProviderUsage | null>,
  baseline: Array<ProviderUsage | null>,
  labels: string[],
) {
  const cleanerSummary = summarizeUsageValues(cleaner, cleaner.length);
  const baselineSummary = summarizeUsageValues(baseline, baseline.length);
  const comparable = cleanerSummary.status === "complete"
    && baselineSummary.status === "complete";
  const checkpointCosts = (usages: Array<ProviderUsage | null>) => usages.map((usage, index) => ({
    label: labels[index] ?? `provider_attempt_${index}`,
    cost: usage?.inputTokens ?? 0,
  }));
  return {
    status: comparable ? "complete" : cleanerSummary.status === "unavailable" || baselineSummary.status === "unavailable" ? "unavailable" : "incomplete",
    baseline: baselineSummary,
    cleaner: cleanerSummary,
    invalidReasons: [...new Set([...baselineSummary.invalidReasons, ...cleanerSummary.invalidReasons])],
    inputTokensDelta: comparable ? cleanerSummary.totals.inputTokens! - baselineSummary.totals.inputTokens! : null,
    outputTokensDelta: comparable ? cleanerSummary.totals.outputTokens! - baselineSummary.totals.outputTokens! : null,
    cachedInputTokensDelta: comparable ? cleanerSummary.totals.cachedInputTokens! - baselineSummary.totals.cachedInputTokens! : null,
    cumulativeInputTokens: comparable
      ? cumulativeBreakEvenByLabel(checkpointCosts(baseline), checkpointCosts(cleaner))
      : null,
  };
}

export function cumulativeBreakEven(
  keepCosts: number[],
  releaseCosts: number[],
  labels = keepCosts.map((_, index) => `checkpoint_${index}`),
): BreakEvenSummary {
  assert.equal(keepCosts.length, releaseCosts.length, "break-even cost series length mismatch");
  assert.equal(keepCosts.length, labels.length, "break-even label series length mismatch");
  let keepTotal = 0;
  let releaseTotal = 0;
  const checkpoints = keepCosts.map((keepCost, index) => {
    keepTotal += keepCost;
    releaseTotal += releaseCosts[index]!;
    return {
      label: labels[index]!,
      keepCost: keepTotal,
      releaseCost: releaseTotal,
      netSavings: keepTotal - releaseTotal,
    };
  });
  const firstIndex = checkpoints.findIndex((checkpoint) => checkpoint.netSavings > 0);
  return {
    checkpoints,
    firstBreakEven: firstIndex < 0 ? null : checkpoints[firstIndex]!.label,
    sustainedBreakEven: firstIndex >= 0 && checkpoints.slice(firstIndex).every((checkpoint) => checkpoint.netSavings > 0),
  };
}

function summarizeProviderUsage(runs: RunResult[], excludeSeed = false) {
  const unavailable = runs.some((run) => run.providerUsage === null);
  const usages = runs.flatMap((run) => run.providerUsage?.slice(excludeSeed ? run.seedRequestCount : 0) ?? []);
  return summarizeUsageValues(
    unavailable ? null : usages,
    runs.reduce((total, run) => total + run.upstreamRequestCount - (excludeSeed ? run.seedRequestCount : 0), 0),
  );
}

function summarizeSharedSeedUsage(runs: RunResult[]) {
  const seedRuns = runs.filter((run) => run.arm === "baseline" && run.seedRequestCount > 0);
  const unavailable = seedRuns.some((run) => run.providerUsage === null);
  const usages = seedRuns.flatMap((run) => run.providerUsage?.slice(0, run.seedRequestCount) ?? []);
  return summarizeUsageValues(
    unavailable ? null : usages,
    seedRuns.reduce((total, run) => total + run.seedRequestCount, 0),
  );
}

async function main(): Promise<void> {
  const outputPath = process.env.LIGHTRSI_BENCHMARK_OUTPUT
    ?? join(tmpdir(), "lightrsi-context-cleaner-benchmark.json");
  const runs: RunResult[] = [];
  let report: JsonObject;
  let passed = false;
  let gitPreflight: GitPreflight | null = null;
  try {
    const manifestInfo = await loadStageBManifest();
    const { manifest } = manifestInfo;
    const mode = (process.env.LIGHTRSI_BENCHMARK_MODE ?? "mock") as BenchmarkMode;
    assert.ok(mode === "mock" || mode === "live", "LIGHTRSI_BENCHMARK_MODE must be mock or live");
    const releaseMode = (process.env.LIGHTRSI_BENCHMARK_RELEASE_MODE ?? manifest.releaseMode) as ReleaseMode;
    assert.ok(releaseMode === "lifecycle" || releaseMode === "one-release", "LIGHTRSI_BENCHMARK_RELEASE_MODE must be lifecycle or one-release");
    const armOrderMode = process.env.LIGHTRSI_BENCHMARK_ARM_ORDER ?? manifest.controls.armOrder;
    assert.ok(armOrderMode === "baseline-first" || armOrderMode === "alternating", "LIGHTRSI_BENCHMARK_ARM_ORDER must be baseline-first or alternating");
    const causalPairs = process.env.LIGHTRSI_BENCHMARK_CAUSAL_PAIRS === undefined
      ? manifest.controls.causalPairs
      : process.env.LIGHTRSI_BENCHMARK_CAUSAL_PAIRS === "true";
    const requestTimeoutMs = Number.parseInt(process.env.LIGHTRSI_BENCHMARK_REQUEST_TIMEOUT_MS ?? "120000", 10);
    assert.ok(Number.isInteger(requestTimeoutMs) && requestTimeoutMs > 0);
    const repetitions = Number.parseInt(process.env.LIGHTRSI_BENCHMARK_REPETITIONS ?? String(manifest.repetitions), 10);
    assert.ok(Number.isInteger(repetitions) && repetitions > 0);
    const fixtureNames = (process.env.LIGHTRSI_BENCHMARK_FIXTURES ?? manifest.fixtures.map((fixture) => fixture.id).join(","))
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean) as FixtureName[];
    assert.ok(fixtureNames.length > 0 && fixtureNames.every((name) => manifest.fixtures.some((fixture) => fixture.id === name)));
    const spendingCapUsd = Number(manifest.spendingCapUsd);
    assert.ok(Number.isFinite(spendingCapUsd) && spendingCapUsd > 0, "spendingCapUsd must be positive");
    gitPreflight = readGitPreflight(manifest.runtimeSha, manifest.benchmarkSha);
    if (gitPreflight.status === "dirty") {
      throw new Error("benchmark requires a clean git checkout");
    }
    if (mode === "live" && gitPreflight.status === "clean_mismatch") {
      throw new Error(`live benchmark SHA preflight failed: expected runtime=${manifest.runtimeSha}, benchmark=${manifest.benchmarkSha}, actual=${gitPreflight.actualSha}`);
    }
    let liveOptions: LiveOptions | undefined;
    if (mode === "live") {
      const config = await loadTokenPilotCodexConfig(defaultTokenPilotConfigPath());
      const initialCwd = process.env.INIT_CWD?.trim() || process.cwd();
      await loadProviderEnvFile(process.env.LIGHTRSI_BENCHMARK_CREDENTIALS_FILE?.trim() || join(initialCwd, ".env"));
      const configuredProvider = await resolveUpstreamProvider(config);
      const baseUrl = process.env.LIGHTRSI_BENCHMARK_BASE_URL?.trim()
        || process.env.OPENAI_BASE_URL?.trim()
        || configuredProvider.baseUrl;
      const model = process.env.LIGHTRSI_BENCHMARK_MODEL?.trim()
        || providerModelFromEnvironment()
        || "gpt-5.4-mini";
      assert.ok(process.env.OPENAI_API_KEY?.trim(), "live mode requires provider credentials");
      liveOptions = { baseUrl, model, apiKey: process.env.OPENAI_API_KEY!.trim() };
    }
    const providerIdentityStatus = mode === "mock"
      ? "mock_fixture"
      : manifest.provider.model === liveOptions!.model ? "match" : "mismatch";
    const plannedDispatches = fixtureNames.length * repetitions * (2 + (causalPairs ? 1 : 0));
    const reservedDispatchCostUsd = mode === "live" ? spendingCapUsd / plannedDispatches : 0;
    let reservedCostUsd = 0;
    let capStopReason: string | null = null;
    for (const fixtureName of fixtureNames) {
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        const arms: Arm[] = armOrderMode === "alternating" && repetition % 2 === 0
          ? ["cleaner", "baseline"]
          : ["baseline", "cleaner"];
        const fixture = createFixture(fixtureName, manifest);
        let seed: BenchmarkSeed | undefined;
        try {
          if (causalPairs) {
            if (mode === "live") {
              const observedCostUsd = estimateProviderCost(
                summarizeProviderUsage(runs),
                readProviderPricing(manifest.provider) ?? { inputUsdPerMillion: 0, cachedInputUsdPerMillion: 0, outputUsdPerMillion: 0 },
              ) ?? 0;
              if (observedCostUsd + reservedCostUsd + reservedDispatchCostUsd > spendingCapUsd) {
                capStopReason = "spending_cap_reservation_exhausted";
                break;
              }
              reservedCostUsd += reservedDispatchCostUsd;
            }
            seed = await createBenchmarkSeed(fixture, releaseMode, mode, repetition, requestTimeoutMs, liveOptions);
          }
          for (const arm of arms) {
            if (mode === "live") {
              const observedCostUsd = estimateProviderCost(
                summarizeProviderUsage(runs),
                readProviderPricing(manifest.provider) ?? { inputUsdPerMillion: 0, cachedInputUsdPerMillion: 0, outputUsdPerMillion: 0 },
              ) ?? 0;
              if (observedCostUsd + reservedCostUsd + reservedDispatchCostUsd > spendingCapUsd) {
                capStopReason = "spending_cap_reservation_exhausted";
                break;
              }
              reservedCostUsd += reservedDispatchCostUsd;
            }
            runs.push(await runArm(fixture, releaseMode, arm, repetition, mode, liveOptions, seed, requestTimeoutMs));
          }
        } finally {
          seed?.cleanup();
        }
        if (capStopReason) break;
      }
      if (capStopReason) break;
    }
    const differences = pairedDifferences(runs);
    const pricing = mode === "live" ? readProviderPricing(manifest.provider) : null;
    const providerUsage = mode === "live"
      ? {
        seed: summarizeSharedSeedUsage(runs),
        baseline: summarizeProviderUsage(runs.filter((run) => run.arm === "baseline"), true),
        cleaner: summarizeProviderUsage(runs.filter((run) => run.arm === "cleaner"), true),
      }
      : null;
    const seedCostUsd = providerUsage && pricing ? estimateProviderCost(providerUsage.seed, pricing) : null;
    const baselineCostUsd = providerUsage && pricing ? estimateProviderCost(providerUsage.baseline, pricing) : null;
    const cleanerCostUsd = providerUsage && pricing ? estimateProviderCost(providerUsage.cleaner, pricing) : null;
    const combinedCostUsd = seedCostUsd !== null && baselineCostUsd !== null && cleanerCostUsd !== null
      ? seedCostUsd + baselineCostUsd + cleanerCostUsd
      : null;
    const underSpendingCap = combinedCostUsd !== null && Number.isFinite(spendingCapUsd)
      ? combinedCostUsd <= spendingCapUsd
      : null;
    const executionStatus = runs.length > 0 && runs.every((run) => run.executionStatus === "complete") ? "complete" : runs.length > 0 ? "partial" : "failed";
    const measurementStatus: UsageCompletenessStatus = mode === "mock"
      ? "unavailable"
      : runs.every((run) => run.measurementStatus === "complete") ? "complete" : runs.some((run) => run.measurementStatus === "incomplete") ? "incomplete" : "unavailable";
    const correctnessStatus = runs.length > 0 && runs.every((run) => run.correctnessStatus === "pass") ? "pass" : "fail";
    const comparablePairCount = differences.filter((difference) => difference.measurementComparable).length;
    const economicStatus = providerIdentityStatus === "mismatch" || gitPreflight.status !== "clean_match" || measurementStatus !== "complete" || comparablePairCount === 0 || underSpendingCap === null
      ? "inconclusive"
      : underSpendingCap ? "pass" : "fail";
    passed = runs.length > 0 && runs.every((run) => run.passed) && runs.every((run) => run.turns.every((turn) => turn.timing.complete));
    report = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      benchmark: "context-cleaner-occurrence-release",
      experiment: {
        name: manifest.experiment,
        runtimeSha: manifest.runtimeSha,
        benchmarkSha: manifest.benchmarkSha,
        manifestPath: manifestInfo.path,
      },
      gitPreflight,
      comparison: { keep: "baseline", release: "cleaner" },
      mode,
      releaseMode,
      armOrder: armOrderMode,
      causalPairs,
      repetitions,
      fixtures: fixtureNames.map((name) => manifest.fixtures.find((fixture) => fixture.id === name)),
       provider: liveOptions ? { host: new URL(liveOptions.baseUrl).hostname, model: liveOptions.model, identityStatus: providerIdentityStatus } : null,
      usage: mode === "live" ? "provider_response_usage_when_present" : "provider_usage_unavailable_for_mock_upstream",
      statuses: { executionStatus, measurementStatus, correctnessStatus, economicStatus },
      economics: mode === "live"
        ? {
          status: economicStatus,
          pricingStatus: pricing ? "pinned" : "unavailable",
          calculation: "uncached_input + cached_input + output; cache creation tokens unavailable",
           baselineCostUsd,
           cleanerCostUsd,
           seedCostUsd,
           combinedCostUsd,
           marginalCostDeltaUsd: baselineCostUsd !== null && cleanerCostUsd !== null ? cleanerCostUsd - baselineCostUsd : null,
           spendingCapUsd: Number.isFinite(spendingCapUsd) ? spendingCapUsd : null,
           underSpendingCap,
           reservedCostUsd,
           capStopReason,
        }
        : null,
      runs,
      pairedDifferences: differences,
      measurementComparability: {
        pairs: differences.length,
        comparablePairs: differences.filter((difference) => difference.measurementComparable).length,
        incomparablePairs: differences.filter((difference) => !difference.measurementComparable).map((difference) => `${difference.fixture}:${difference.repetition}`),
      },
      summaryByArm: {
        baseline: summarize(runs.filter((run) => run.arm === "baseline")),
        cleaner: summarize(runs.filter((run) => run.arm === "cleaner")),
        providerUsage,
      },
      passed,
    };
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    let pairedForReport: unknown[] = [];
    try {
      pairedForReport = pairedDifferences(runs);
    } catch (pairError) {
      pairedForReport = [{ error: pairError instanceof Error ? pairError.message : String(pairError) }];
    }
    report = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      benchmark: "context-cleaner-occurrence-release",
      statuses: {
        executionStatus: runs.length > 0 ? "partial" : "failed",
        measurementStatus: "incomplete",
        correctnessStatus: "fail",
        economicStatus: "inconclusive",
      },
      gitPreflight,
      runs,
      pairedDifferences: pairedForReport,
      failure,
      passed: false,
    };
  }
  await mkdir(join(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, passed, runs: runs.length }, null, 2));
  if (!passed) process.exitCode = 1;
}

if (process.argv[1] && /(?:^|[\\/])benchmark-context-cleaner\.ts$/u.test(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
