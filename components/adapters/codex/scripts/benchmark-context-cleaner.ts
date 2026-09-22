import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
import { createTemporaryAcceptanceEnvironment, reserveUnusedPort } from "@lightrsi/host-adapter";

import {
  defaultTokenPilotConfigPath,
  loadTokenPilotCodexConfig,
  normalizeTokenPilotCodexConfig,
  resolveUpstreamProvider,
} from "../src/config.js";
import { createCodexContextCleanerBridge } from "../src/context-cleaner/index.js";
import { loadProviderEnvFile, providerModelFromEnvironment } from "./context-rebase-smoke.js";
import { createBenchmarkTiming, type BenchmarkTimingSnapshot } from "../src/benchmark-timing.js";
import { createConsoleLogger } from "../src/logger.js";
import { startCodexResponsesProxy } from "../src/proxy-runtime.js";

type JsonObject = Record<string, unknown>;
type Arm = "baseline" | "cleaner";
type FixtureName = "short/noisy" | "long/noisy";

type Fixture = {
  name: FixtureName;
  noiseBefore: string[];
  noiseBetween: string[];
  retained: string;
  releaseA: string;
  releaseB: string;
};

type UpstreamRequest = {
  body: JsonObject;
  inputBytes: number;
  startedAt: number;
  headersAt: number;
  firstChunkAt: number;
  finishedAt: number;
  providerUsage: ProviderUsage | null;
  providerLatencyMs: number | null;
  providerHeadersLatencyMs: number | null;
};

type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedInputTokens: number | null;
};

type BenchmarkMode = "mock" | "live";

type LiveOptions = {
  baseUrl: string;
  model: string;
};

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
  arm: Arm;
  repetition: number;
  passed: boolean;
  upstreamRequestCount: number;
  turns: TurnResult[];
  localInputBytes: number[];
  providerUsage: Array<ProviderUsage | null> | null;
  providerShape: ProviderShape[] | null;
  failure?: string;
};

type ProviderShape = {
  inputBytes: number;
  userItemCount: number;
  replayableItemCount: number;
  providerLatencyMs: number | null;
  providerHeadersLatencyMs: number | null;
};

function createFixture(name: FixtureName): Fixture {
  const noiseCount = name === "short/noisy" ? 2 : 20;
  const noise = (prefix: string) => Array.from(
    { length: noiseCount },
    (_, index) => `${prefix}_${String(index + 1).padStart(2, "0")}_${"noise ".repeat(name === "short/noisy" ? 8 : 80)}`,
  );
  return {
    name,
    noiseBefore: noise("NOISE_BEFORE"),
    noiseBetween: noise("NOISE_BETWEEN"),
    retained: `RETAINED_${name.replace("/", "_")}`,
    releaseA: `RELEASE_A_${name.replace("/", "_")}`,
    releaseB: `RELEASE_B_${name.replace("/", "_")}`,
  };
}

function responseEvent(event: string, payload: JsonObject): string {
  return `event: ${event}\ndata: ${JSON.stringify({ type: event, ...payload })}\n\n`;
}

async function startUpstream(): Promise<{
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
    const responseId = `benchmark-response-${requests.length + 1}`;
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
    requests.push({ body, inputBytes, startedAt, headersAt, firstChunkAt, finishedAt, providerUsage: null, providerLatencyMs: finishedAt - startedAt, providerHeadersLatencyMs: headersAt - startedAt });
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

async function consumeProviderResponse(response: Response, request: UpstreamRequest): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    request.finishedAt = performance.now();
    request.providerLatencyMs = request.finishedAt - request.startedAt;
    return;
  }
  const decoder = new TextDecoder();
  let buffer = "";
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
        if (typeof event.type === "string" && /output_text|content_part/iu.test(event.type) && !request.firstChunkAt) {
          request.firstChunkAt = performance.now();
        }
        request.providerUsage = providerUsage(event.response) ?? providerUsage(event) ?? request.providerUsage;
      } catch {
        // Provider stream diagnostics stay in memory only; malformed events remain unknown.
      }
    }
  }
  request.finishedAt = performance.now();
  request.providerLatencyMs = request.finishedAt - request.startedAt;
}

function captureLiveProvider(baseUrl: string): {
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
    const request: UpstreamRequest = {
      body,
      inputBytes: Buffer.byteLength(JSON.stringify(inputValue), "utf8"),
      startedAt: performance.now(),
      headersAt: 0,
      firstChunkAt: 0,
      finishedAt: 0,
      providerUsage: null,
      providerLatencyMs: null,
      providerHeadersLatencyMs: null,
    };
    const response = await originalFetch(input, init);
    request.headersAt = performance.now();
    request.providerHeadersLatencyMs = request.headersAt - request.startedAt;
    requests.push(request);
    const task = consumeProviderResponse(response.clone(), request);
    pending.add(task);
    void task.finally(() => pending.delete(task));
    return response;
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
    userItemCount: items.filter((item) => item.role === "user").length,
    replayableItemCount: items.filter((item) => typeof item.type === "string").length,
    providerLatencyMs: request.providerLatencyMs,
    providerHeadersLatencyMs: request.providerHeadersLatencyMs,
  };
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
    metadata: { tokenpilotSessionId: params.sessionId },
    input,
  });
  const serializationMs = performance.now() - serializationStartedAt;
  timing.mark("dispatchStart");
  const response = await fetch(`${params.runtime.baseUrl}/responses`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: requestBody,
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

async function runArm(
  fixture: Fixture,
  arm: Arm,
  repetition: number,
  mode: BenchmarkMode,
  liveOptions?: LiveOptions,
): Promise<RunResult> {
  const environment = createTemporaryAcceptanceEnvironment(`lightrsi-cleaner-benchmark-${arm}-`);
  const upstream = mode === "mock" ? await startUpstream() : undefined;
  const liveCapture = mode === "live" ? captureLiveProvider(liveOptions!.baseUrl) : undefined;
  const sessionId = `cleaner-benchmark-${fixture.name}-${arm}-${repetition}`;
  const config = normalizeTokenPilotCodexConfig({
    stateDir: environment.stateDir,
    proxyPort: await reserveUnusedPort(),
    upstreamProvider: "OpenAI",
    upstream: {
      baseUrl: upstream?.baseUrl ?? liveOptions!.baseUrl,
      wireApi: "responses",
      requiresOpenAIAuth: mode === "live",
    },
    modules: { stabilizer: false, reduction: false },
    contextRewrite: {
      enabled: true,
      providerCompatibilityProbe: mode === "live" ? "real_provider" : "mock_fixture",
    },
  } as any);
  let runtime: Awaited<ReturnType<typeof startCodexResponsesProxy>> | undefined;
  const turns: TurnResult[] = [];
  let history: JsonObject[] = [];
  let firstReleasePlan: string | undefined;
  let secondReleasePlan: string | undefined;
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
        durableCompletion: planId
          ? async () => { await waitForApplied(cleaner, planId, environment.stateDir); }
          : undefined,
      });
      history = sent.history;
      turns.push(sent.result);
    };
    await send("retained", fixture.retained);
    await send("release_a", fixture.releaseA);
    for (const [index, content] of fixture.noiseBefore.entries()) await send(`noise_before_${index}`, content);
    await send("release_b", fixture.releaseB);
    if (arm === "cleaner") {
      const snapshot = await cleaner.inspect(sessionId);
      const retained = userItems(snapshot)[0]?.stableId;
      firstReleasePlan = (await cleaner.releaseOccurrences(sessionId, [
        releaseSelection(snapshot, 1, retained ? [retained] : []),
      ])).planId;
    }
    await send("after_release_a", "AFTER_RELEASE_A", firstReleasePlan);
    for (const [index, content] of fixture.noiseBetween.entries()) await send(`noise_between_${index}`, content);
    if (arm === "cleaner") {
      const snapshot = await cleaner.inspect(sessionId);
      secondReleasePlan = (await cleaner.releaseOccurrences(sessionId, [
        releaseSelection(snapshot, 2 + fixture.noiseBefore.length),
      ])).planId;
    }
    await send("after_release_b", "AFTER_RELEASE_B", secondReleasePlan);
    await runtime.close();
    runtime = await startCodexResponsesProxy({
      config,
      logger: createConsoleLogger(false),
      allowMockFixtureEvidence: true,
    });
    await send("after_restart", "AFTER_RESTART");
    const forwardedRequests = upstream?.requests ?? liveCapture!.requests;
    turns.forEach((turn, index) => {
      const forwarded = forwardedRequests[index];
      if (forwarded) turn.inputBytes = forwarded.inputBytes;
    });
    const texts = forwardedRequests.map(userInputText);
    const releaseARequest = texts.findIndex((text) => text.includes("AFTER_RELEASE_A"));
    const releaseBRequest = texts.findIndex((text) => text.includes("AFTER_RELEASE_B"));
    const restartRequest = texts.findIndex((text) => text.includes("AFTER_RESTART"));
    if (releaseARequest < 0 || releaseBRequest < 0 || restartRequest < 0) {
      throw new Error(`forwarded request markers missing: releaseA=${releaseARequest}; releaseB=${releaseBRequest}; restart=${restartRequest}`);
    }
    if (arm === "baseline") {
      assertMarker(texts[releaseARequest]!, fixture.releaseA, true, "baseline release A");
      assertMarker(texts[releaseBRequest]!, fixture.releaseB, true, "baseline release B");
      assertMarker(texts[restartRequest]!, fixture.releaseA, true, "baseline restart release A");
      assertMarker(texts[restartRequest]!, fixture.releaseB, true, "baseline restart release B");
    } else {
      assertMarker(texts[releaseARequest]!, fixture.releaseA, false, "cleaner release A");
      assertMarker(texts[releaseARequest]!, fixture.releaseB, true, "cleaner retained release B");
      assertMarker(texts[releaseBRequest]!, fixture.releaseA, false, "cleaner release B release A");
      assertMarker(texts[releaseBRequest]!, fixture.releaseB, false, "cleaner release B");
      assertMarker(texts[restartRequest]!, fixture.releaseA, false, "cleaner restart release A");
      assertMarker(texts[restartRequest]!, fixture.releaseB, false, "cleaner restart release B");
      assertMarker(texts[restartRequest]!, fixture.retained, true, "cleaner restart retained");
    }
    return {
      fixture: fixture.name,
      arm,
      repetition,
      passed: true,
      upstreamRequestCount: forwardedRequests.length,
      turns,
      localInputBytes: forwardedRequests.map((request) => request.inputBytes),
      providerUsage: mode === "live" ? forwardedRequests.map((request) => request.providerUsage) : null,
      providerShape: mode === "live" ? forwardedRequests.map(providerShape) : null,
    };
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    return {
      fixture: fixture.name,
      arm,
      repetition,
      passed: false,
      upstreamRequestCount: (upstream?.requests ?? liveCapture?.requests ?? []).length,
      turns,
      localInputBytes: (upstream?.requests ?? liveCapture?.requests ?? []).map((request) => request.inputBytes),
      providerUsage: mode === "live"
        ? (liveCapture?.requests ?? []).map((request) => request.providerUsage)
        : null,
      providerShape: mode === "live"
        ? (liveCapture?.requests ?? []).map(providerShape)
        : null,
      failure: `${failure}; cleanerTrace=${await cleanerTraceSummary(environment.stateDir)}`,
    };
  } finally {
    await liveCapture?.close();
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
      return {
        fixture: run.fixture,
        repetition: run.repetition,
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
        providerUsage: run.providerUsage && baseline.providerUsage
          ? {
            inputTokensDelta: usageDelta(run.providerUsage, baseline.providerUsage, "inputTokens"),
            outputTokensDelta: usageDelta(run.providerUsage, baseline.providerUsage, "outputTokens"),
            totalTokensDelta: usageDelta(run.providerUsage, baseline.providerUsage, "totalTokens"),
            cachedInputTokensDelta: usageDelta(run.providerUsage, baseline.providerUsage, "cachedInputTokens"),
          }
          : null,
      };
    });
}

function usageDelta(
  cleaner: Array<ProviderUsage | null>,
  baseline: Array<ProviderUsage | null>,
  field: keyof ProviderUsage,
): number | null {
  const cleanerTotal = cleaner.reduce((sum, usage) => sum + (usage?.[field] ?? 0), 0);
  const baselineTotal = baseline.reduce((sum, usage) => sum + (usage?.[field] ?? 0), 0);
  const cleanerObserved = cleaner.some((usage) => usage?.[field] !== null && usage?.[field] !== undefined);
  const baselineObserved = baseline.some((usage) => usage?.[field] !== null && usage?.[field] !== undefined);
  return cleanerObserved && baselineObserved ? cleanerTotal - baselineTotal : null;
}

function summarizeProviderUsage(runs: RunResult[]) {
  const usages = runs.flatMap((run) => run.providerUsage ?? []);
  const sum = (field: keyof ProviderUsage): number | null => {
    const observed = usages.filter((usage): usage is ProviderUsage => Boolean(usage && usage[field] !== null && usage[field] !== undefined));
    return observed.length > 0 ? observed.reduce((total, usage) => total + (usage[field] ?? 0), 0) : null;
  };
  return {
    requests: usages.length,
    requestsWithUsage: usages.filter(Boolean).length,
    inputTokens: sum("inputTokens"),
    outputTokens: sum("outputTokens"),
    totalTokens: sum("totalTokens"),
    cachedInputTokens: sum("cachedInputTokens"),
  };
}

async function main(): Promise<void> {
  const mode = (process.env.LIGHTRSI_BENCHMARK_MODE ?? "mock") as BenchmarkMode;
  assert.ok(mode === "mock" || mode === "live", "LIGHTRSI_BENCHMARK_MODE must be mock or live");
  const armOrderMode = process.env.LIGHTRSI_BENCHMARK_ARM_ORDER ?? "baseline-first";
  assert.ok(armOrderMode === "baseline-first" || armOrderMode === "alternating", "LIGHTRSI_BENCHMARK_ARM_ORDER must be baseline-first or alternating");
  const repetitions = Number.parseInt(process.env.LIGHTRSI_BENCHMARK_REPETITIONS ?? "5", 10);
  assert.ok(Number.isInteger(repetitions) && repetitions > 0);
  const fixtureNames = (process.env.LIGHTRSI_BENCHMARK_FIXTURES ?? "short/noisy,long/noisy")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean) as FixtureName[];
  assert.ok(fixtureNames.length > 0 && fixtureNames.every((name) => name === "short/noisy" || name === "long/noisy"));
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
    liveOptions = { baseUrl, model };
  }
  const runs: RunResult[] = [];
  for (const fixtureName of fixtureNames) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      const arms: Arm[] = armOrderMode === "alternating" && repetition % 2 === 0
        ? ["cleaner", "baseline"]
        : ["baseline", "cleaner"];
      for (const arm of arms) {
        runs.push(await runArm(createFixture(fixtureName), arm, repetition, mode, liveOptions));
      }
    }
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    benchmark: "context-cleaner-occurrence-release",
    mode,
    armOrder: armOrderMode,
    repetitions,
    fixtures: fixtureNames,
    provider: liveOptions ? { host: new URL(liveOptions.baseUrl).hostname, model: liveOptions.model } : null,
    usage: mode === "live" ? "provider_response_usage_when_present" : "provider_usage_unavailable_for_mock_upstream",
    runs,
    pairedDifferences: pairedDifferences(runs),
    summaryByArm: {
      baseline: summarize(runs.filter((run) => run.arm === "baseline")),
      cleaner: summarize(runs.filter((run) => run.arm === "cleaner")),
      providerUsage: mode === "live"
        ? {
          baseline: summarizeProviderUsage(runs.filter((run) => run.arm === "baseline")),
          cleaner: summarizeProviderUsage(runs.filter((run) => run.arm === "cleaner")),
        }
        : null,
    },
    passed: runs.every((run) => run.passed)
      && runs.every((run) => run.turns.every((turn) => turn.timing.complete)),
  };
  const outputPath = process.env.LIGHTRSI_BENCHMARK_OUTPUT
    ?? join(tmpdir(), "lightrsi-context-cleaner-benchmark.json");
  await mkdir(join(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, passed: report.passed, runs: runs.length }, null, 2));
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1] && /(?:^|[\\/])benchmark-context-cleaner\.ts$/u.test(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
