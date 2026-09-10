/* eslint-disable @typescript-eslint/no-explicit-any */
import { readJsonFile, withFileLock, writeJsonFileAtomic } from "@lightrsi/host-adapter";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { Readable } from "node:stream";
import type { CodexProviderConfig } from "./config.js";
import { codexRebaseEndpointIdentity } from "./context-rewrite/rebase-capability.js";
import { appendTrace } from "./trace.js";

export type UpstreamHttpResponse = {
  status: number;
  headers: Record<string, string>;
  text: string;
  transportFetches: number;
};

export type UpstreamStreamResponse = {
  status: number;
  headers: Record<string, string>;
  stream: Readable;
  transportFetches: number;
};

type OptionalResponsesField =
  | "prompt_cache_options"
  | "prompt_cache_retention"
  | "prompt_cache_key"
  | "prompt_cache_breakpoint";

type UpstreamResponsesCapabilityRecord = {
  schemaVersion?: 1 | 2;
  endpoint: string;
  wireApi?: string;
  model?: string;
  unsupportedOptionalFields: OptionalResponsesField[];
  updatedAt: string;
  entries?: Array<{
    key: string;
    endpoint: string;
    wireApi: string;
    model: string;
    unsupportedOptionalFields: OptionalResponsesField[];
    updatedAt: string;
  }>;
};

const CAPABILITY_TTL_MS = 24 * 60 * 60 * 1000;

const MODEL_CATALOG_TTL_MS = 60_000;
const modelCatalogCache = new Map<string, { expiresAt: number; models: string[] }>();
const modelCatalogInflight = new Map<string, Promise<string[]>>();
const capabilityCache = new Map<string, { expiresAt: number; fields: Set<OptionalResponsesField> }>();
const capabilityInflight = new Map<string, Promise<Set<OptionalResponsesField>>>();
const MAX_CAPABILITY_CACHE_ENTRIES = 64;

export function resolveModelFromCatalog(model: string, availableModels: string[]): string {
  const normalizedModel = model.trim();
  if (!normalizedModel) throw new Error("Model name is empty");
  if (normalizedModel.includes("/")) return normalizedModel;

  const models = [...new Set(availableModels.filter((entry) => typeof entry === "string" && entry.trim()))];
  if (models.includes(normalizedModel)) return normalizedModel;

  const candidates = models.filter((entry) => entry.endsWith(`/${normalizedModel}`));
  if (candidates.length === 1) return candidates[0];
  if (candidates.length === 0) {
    throw new Error(`9Router model catalog has no model matching "${normalizedModel}"`);
  }
  throw new Error(`9Router model catalog has ambiguous matches for "${normalizedModel}": ${candidates.join(", ")}`);
}

function isNineRouter(upstream: CodexProviderConfig): boolean {
  return /9router/i.test(upstream.name ?? "");
}

function v1EndpointFor(upstream: CodexProviderConfig): string {
  const base = upstream.baseUrl.replace(/\/+$/, "");
  if (base.endsWith("/v1/responses")) return base.slice(0, -"/responses".length);
  if (base.endsWith("/v1")) return base;
  return `${base}/v1`;
}

async function loadNineRouterModels(
  upstream: CodexProviderConfig,
  inboundAuthorization?: string,
): Promise<string[]> {
  const endpoint = `${v1EndpointFor(upstream)}/models`;
  const cached = modelCatalogCache.get(endpoint);
  if (cached && cached.expiresAt > Date.now()) return cached.models;
  const existing = modelCatalogInflight.get(endpoint);
  if (existing) return existing;
  const refresh = (async () => {
    const response = await fetch(endpoint, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${upstreamApiKey(upstream, inboundAuthorization)}`,
      },
    });
    if (!response.ok) {
      throw new Error(`9Router model catalog unavailable (${response.status})`);
    }
    const body = await response.json() as { data?: Array<{ id?: unknown }> };
    const models = Array.isArray(body.data)
      ? body.data.flatMap((entry) => typeof entry?.id === "string" ? [entry.id] : [])
      : [];
    if (models.length === 0) throw new Error("9Router model catalog returned no models");
    modelCatalogCache.set(endpoint, { expiresAt: Date.now() + MODEL_CATALOG_TTL_MS, models });
    return models;
  })();
  modelCatalogInflight.set(endpoint, refresh);
  try {
    return await refresh;
  } finally {
    if (modelCatalogInflight.get(endpoint) === refresh) modelCatalogInflight.delete(endpoint);
  }
}

async function resolveNineRouterPayloadModel(
  payload: any,
  upstream: CodexProviderConfig,
  inboundAuthorization?: string,
): Promise<any> {
  if (!isNineRouter(upstream) || typeof payload?.model !== "string" || payload.model.includes("/")) {
    return payload;
  }
  const resolvedModel = resolveModelFromCatalog(
    payload.model,
    await loadNineRouterModels(upstream, inboundAuthorization),
  );
  return resolvedModel === payload.model ? payload : { ...payload, model: resolvedModel };
}

function endpointFor(upstream: CodexProviderConfig): string {
  const base = upstream.baseUrl.replace(/\/+$/, "");
  if (base.endsWith("/v1")) return `${base}/responses`;
  if (base.endsWith("/v1/responses")) return base;
  return `${base}/v1/responses`;
}

function responseText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const value = part as Record<string, unknown>;
      return typeof value.text === "string" ? value.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function responsesUsage(usage: unknown): Record<string, unknown> | undefined {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return undefined;
  const source = usage as Record<string, unknown>;
  const result: Record<string, unknown> = {
    input_tokens: source.input_tokens ?? source.prompt_tokens,
    output_tokens: source.output_tokens ?? source.completion_tokens,
    total_tokens: source.total_tokens,
  };
  if (source.prompt_tokens_details && typeof source.prompt_tokens_details === "object") {
    result.input_tokens_details = source.prompt_tokens_details;
  }
  if (source.completion_tokens_details && typeof source.completion_tokens_details === "object") {
    result.output_tokens_details = source.completion_tokens_details;
  }
  return result;
}

function normalizeChatCompletionResponse(text: string): string {
  let source: Record<string, unknown>;
  try {
    source = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return text;
  }
  if (!Array.isArray(source.choices) || Array.isArray(source.output)) return text;

  const output: Array<Record<string, unknown>> = [];
  for (const [choiceIndex, choice] of source.choices.entries()) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as Record<string, unknown>).message;
    if (!message || typeof message !== "object") continue;
    const messageRecord = message as Record<string, unknown>;
    const messageId = typeof source.id === "string" ? `msg_${source.id}_${choiceIndex}` : `msg_${choiceIndex}`;
    const textContent = responseText(messageRecord.content);
    const content = textContent ? [{ type: "output_text", text: textContent, annotations: [] }] : [];
    if (content.length > 0 || !Array.isArray(messageRecord.tool_calls)) {
      output.push({
        id: messageId,
        type: "message",
        status: "completed",
        role: "assistant",
        content,
      });
    }
    if (Array.isArray(messageRecord.tool_calls)) {
      for (const [toolIndex, toolCall] of messageRecord.tool_calls.entries()) {
        if (!toolCall || typeof toolCall !== "object") continue;
        const toolRecord = toolCall as Record<string, unknown>;
        const functionRecord = toolRecord.function && typeof toolRecord.function === "object"
          ? toolRecord.function as Record<string, unknown>
          : {};
        const callId = typeof toolRecord.id === "string" ? toolRecord.id : `call_${choiceIndex}_${toolIndex}`;
        output.push({
          id: `fc_${callId}`,
          type: "function_call",
          status: "completed",
          call_id: callId,
          name: typeof functionRecord.name === "string" ? functionRecord.name : "",
          arguments: typeof functionRecord.arguments === "string" ? functionRecord.arguments : "{}",
        });
      }
    }
  }

  return JSON.stringify({
    id: typeof source.id === "string" ? `resp_${source.id}` : `resp_${Date.now()}`,
    object: "response",
    created_at: typeof source.created === "number" ? source.created : Math.floor(Date.now() / 1000),
    status: "completed",
    model: typeof source.model === "string" ? source.model : undefined,
    output,
    usage: responsesUsage(source.usage),
  });
}

function sanitizeUpstreamErrorMessage(error: unknown, upstream: CodexProviderConfig): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(endpointFor(upstream), "[upstream]")
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .slice(0, 240);
}

async function appendUpstreamTrace(
  params: {
    stateDir?: string;
    requestId?: string;
    upstream: CodexProviderConfig;
    payload: any;
  },
  details: Record<string, unknown>,
): Promise<void> {
  if (!params.stateDir || !params.requestId) return;
  try {
    await appendTrace(params.stateDir, {
      requestId: params.requestId,
      model: typeof params.payload?.model === "string" ? params.payload.model : null,
      upstreamEndpointId: codexRebaseEndpointIdentity(endpointFor(params.upstream)),
      ...details,
    });
  } catch {
  }
}

async function sendUpstreamRequest(
  params: {
    upstream: CodexProviderConfig;
    inboundAuthorization?: string;
    lightmem2CacheContractDigest?: string;
    stateDir?: string;
    requestId?: string;
    signal?: AbortSignal;
  },
  payload: any,
  attempt: number,
  stream: boolean,
): Promise<Response> {
  const startedAt = performance.now();
  try {
    const response = await fetch(endpointFor(params.upstream), {
      method: "POST",
      headers: requestHeaders(params),
      body: JSON.stringify(payload),
      signal: params.signal,
    });
    await appendUpstreamTrace({ ...params, payload }, {
      stage: "upstream_response",
      stream,
      status: response.status,
      ok: response.ok,
      transportAttempt: attempt,
      elapsedMs: performance.now() - startedAt,
      responseBodyAvailable: Boolean(response.body),
      responseContentLength: Number(response.headers.get("content-length")) || null,
    });
    return response;
  } catch (error) {
    await appendUpstreamTrace({ ...params, payload }, {
      stage: "upstream_transport_error",
      stream,
      status: null,
      transportAttempt: attempt,
      elapsedMs: performance.now() - startedAt,
      errorClass: error instanceof Error ? error.name : "unknown",
      errorMessage: sanitizeUpstreamErrorMessage(error, params.upstream),
      errorCode: error && typeof error === "object" && "code" in error
        ? (typeof error.code === "string" ? error.code : null)
        : null,
    });
    throw error;
  }
}

function upstreamApiKey(upstream: CodexProviderConfig, inboundAuthorization?: string): string {
  if (upstream.apiKey) return upstream.apiKey;
  if (inboundAuthorization?.toLowerCase().startsWith("bearer ")) {
    return inboundAuthorization.slice("bearer ".length).trim();
  }
  return process.env.OPENAI_API_KEY ?? "";
}

function headersFrom(resp: Response): Record<string, string> {
  return Object.fromEntries(resp.headers.entries());
}

function requestHeaders(params: {
  upstream: CodexProviderConfig;
  inboundAuthorization?: string;
  lightmem2CacheContractDigest?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${upstreamApiKey(params.upstream, params.inboundAuthorization)}`,
  };
  if (params.lightmem2CacheContractDigest) {
    headers["x-lightrsi-cache-contract"] = `v1:${params.lightmem2CacheContractDigest}`;
  }
  return headers;
}
function clonePayloadWithoutOptionalField(payload: any, field: OptionalResponsesField): any {
  if (!payload || typeof payload !== "object") return payload;
  if (field === "prompt_cache_breakpoint") {
    if (!Array.isArray(payload.input)) return payload;
    let inputChanged = false;
    const input = payload.input.map((item: any) => {
      if (!item || typeof item !== "object" || !Array.isArray(item.content)) return item;
      let contentChanged = false;
      const content = item.content.map((block: any) => {
        if (!block || typeof block !== "object" || !("prompt_cache_breakpoint" in block)) return block;
        contentChanged = true;
        const nextBlock = { ...block };
        delete nextBlock.prompt_cache_breakpoint;
        return nextBlock;
      });
      if (!contentChanged) return item;
      inputChanged = true;
      return { ...item, content };
    });
    return inputChanged ? { ...payload, input } : payload;
  }
  if (!(field in payload)) return payload;
  const next = { ...(payload as Record<string, unknown>) };
  delete next[field];
  return next;
}

function clonePayloadWithoutUnsupportedFields(
  payload: any,
  unsupportedFields: Iterable<OptionalResponsesField>,
): any {
  let next = payload;
  for (const field of unsupportedFields) {
    next = clonePayloadWithoutOptionalField(next, field);
  }
  return next;
}

function unsupportedOptionalFieldFromText(text: string): OptionalResponsesField | undefined {
  if (!text) return undefined;
  if (!/\b(?:unsupported|not supported|unknown|unrecognized|unexpected|not allowed|not permitted|extra inputs?|additional propert(?:y|ies))\b/i.test(text)) {
    return undefined;
  }
  return ([
    "prompt_cache_options",
    "prompt_cache_retention",
    "prompt_cache_key",
    "prompt_cache_breakpoint",
  ] as OptionalResponsesField[]).find((field) => new RegExp(`\\b${field}\\b`, "i").test(text));
}

function unsupportedRetryDelayMs(text: string): number {
  const match = /\(reset after (\d+)s\)/i.exec(text);
  if (!match) return 0;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? Math.min(seconds * 1000 + 250, 60_000) : 0;
}

async function waitForRetryDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return;
  if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
  await new Promise<void>((resolve, reject) => {
    let timer: NodeJS.Timeout;
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("The operation was aborted", "AbortError"));
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function upstreamCapabilityPath(stateDir: string, upstream: CodexProviderConfig): string {
  return join(
    stateDir,
    "upstream-capabilities",
    "responses",
    `${encodeURIComponent(endpointFor(upstream))}.json`,
  );
}

function capabilityKey(upstream: CodexProviderConfig, model: string): string {
  return `${endpointFor(upstream)}::${upstream.wireApi ?? "responses"}::${model}`;
}

async function loadUnsupportedOptionalFields(
  stateDir: string | undefined,
  upstream: CodexProviderConfig,
  model: string,
): Promise<Set<OptionalResponsesField>> {
  if (!stateDir) return new Set();
  const key = capabilityKey(upstream, model);
  const cached = capabilityCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return new Set(cached.fields);
  const inflight = capabilityInflight.get(key);
  if (inflight) return new Set(await inflight);
  const load = (async () => {
    const record = await readJsonFile<UpstreamResponsesCapabilityRecord>(
      upstreamCapabilityPath(stateDir, upstream),
    );
    const entry = record?.schemaVersion === 2
      ? record.entries?.find((candidate) => candidate.key === key)
      : undefined;
    const updatedAt = Date.parse(String(entry?.updatedAt ?? ""));
    const fields = Number.isFinite(updatedAt)
      && updatedAt <= Date.now()
      && Date.now() - updatedAt < CAPABILITY_TTL_MS
      && Array.isArray(entry?.unsupportedOptionalFields)
      ? entry.unsupportedOptionalFields.filter(
        (value): value is OptionalResponsesField =>
          value === "prompt_cache_options"
            || value === "prompt_cache_retention"
            || value === "prompt_cache_key"
            || value === "prompt_cache_breakpoint",
      )
      : [];
    const result = new Set(fields);
    capabilityCache.set(key, { expiresAt: Date.now() + CAPABILITY_TTL_MS, fields: result });
    while (capabilityCache.size > MAX_CAPABILITY_CACHE_ENTRIES) {
      const oldest = capabilityCache.keys().next().value;
      if (typeof oldest !== "string") break;
      capabilityCache.delete(oldest);
    }
    return result;
  })().finally(() => capabilityInflight.delete(key));
  capabilityInflight.set(key, load);
  return new Set(await load);
}

async function persistUnsupportedOptionalField(
  stateDir: string | undefined,
  upstream: CodexProviderConfig,
  model: string,
  field: OptionalResponsesField,
): Promise<void> {
  if (!stateDir) return;
  const key = capabilityKey(upstream, model);
  const capabilityPath = upstreamCapabilityPath(stateDir, upstream);
  let unsupportedFields = new Set<OptionalResponsesField>();
  const optimisticFields = new Set(capabilityCache.get(key)?.fields ?? []);
  optimisticFields.add(field);
  capabilityCache.set(key, { expiresAt: Date.now() + CAPABILITY_TTL_MS, fields: optimisticFields });
  await withFileLock(`${capabilityPath}.lock`, async () => {
    const record = await readJsonFile<UpstreamResponsesCapabilityRecord>(capabilityPath);
    const now = new Date().toISOString();
    const entries = (record?.schemaVersion === 2 && Array.isArray(record.entries) ? record.entries : [])
      .filter((entry) => {
        const updatedAt = Date.parse(entry.updatedAt);
        return Number.isFinite(updatedAt) && Date.now() - updatedAt < CAPABILITY_TTL_MS;
      });
    const current = entries.find((entry) => entry.key === key);
    unsupportedFields = new Set(current?.unsupportedOptionalFields ?? []);
    unsupportedFields.add(field);
    const nextEntries = entries.filter((entry) => entry.key !== key);
    nextEntries.push({
      key,
      endpoint: endpointFor(upstream),
      wireApi: upstream.wireApi ?? "responses",
      model,
      unsupportedOptionalFields: Array.from(unsupportedFields),
      updatedAt: now,
    });
    await writeJsonFileAtomic(capabilityPath, {
      schemaVersion: 2,
      endpoint: endpointFor(upstream),
      wireApi: upstream.wireApi ?? "responses",
      model,
      unsupportedOptionalFields: Array.from(unsupportedFields),
      updatedAt: now,
      entries: nextEntries,
    } satisfies UpstreamResponsesCapabilityRecord);
  });
  capabilityCache.set(key, { expiresAt: Date.now() + CAPABILITY_TTL_MS, fields: unsupportedFields });
}

export async function requestUpstreamResponses(params: {
  upstream: CodexProviderConfig;
  payload: any;
  inboundAuthorization?: string;
  lightmem2CacheContractDigest?: string;
  stateDir?: string;
  requestId?: string;
  signal?: AbortSignal;
}): Promise<UpstreamHttpResponse> {
  let transportFetches = 0;
  const send = (payload: any) => {
    transportFetches += 1;
    return sendUpstreamRequest(params, payload, transportFetches, false);
  };
  let payload = await resolveNineRouterPayloadModel(
    clonePayloadWithoutUnsupportedFields(params.payload, new Set()),
    params.upstream,
    params.inboundAuthorization,
  );
  const resolvedModel = typeof payload?.model === "string" ? payload.model : "";
  const unsupportedFields = await loadUnsupportedOptionalFields(params.stateDir, params.upstream, resolvedModel);
  payload = clonePayloadWithoutUnsupportedFields(payload, unsupportedFields);
  let resp = await send(payload);
  let text = await resp.text();
  if (!resp.ok) {
    const unsupportedField = unsupportedOptionalFieldFromText(text);
    if (resp.status !== 401 && resp.status !== 403 && unsupportedField && !unsupportedFields.has(unsupportedField)) {
      await persistUnsupportedOptionalField(params.stateDir, params.upstream, resolvedModel, unsupportedField).catch(() => undefined);
      const downgraded = clonePayloadWithoutOptionalField(payload, unsupportedField);
      if (downgraded !== payload) {
        const retryDelayMs = unsupportedRetryDelayMs(text);
        await waitForRetryDelay(retryDelayMs, params.signal);
        payload = downgraded;
        resp = await send(payload);
        text = await resp.text();
      }
    }
  }
  if (resp.ok) text = normalizeChatCompletionResponse(text);
  return {
    status: resp.status,
    headers: headersFrom(resp),
    text,
    transportFetches,
  };
}

export async function requestUpstreamResponsesStream(params: {
  upstream: CodexProviderConfig;
  payload: any;
  inboundAuthorization?: string;
  lightmem2CacheContractDigest?: string;
  stateDir?: string;
  requestId?: string;
  signal?: AbortSignal;
}): Promise<UpstreamStreamResponse> {
  let transportFetches = 0;
  const send = (payload: any) => {
    transportFetches += 1;
    return sendUpstreamRequest(params, payload, transportFetches, true);
  };
  let payload = await resolveNineRouterPayloadModel(
    clonePayloadWithoutUnsupportedFields(params.payload, new Set()),
    params.upstream,
    params.inboundAuthorization,
  );
  const resolvedModel = typeof payload?.model === "string" ? payload.model : "";
  const unsupportedFields = await loadUnsupportedOptionalFields(params.stateDir, params.upstream, resolvedModel);
  payload = clonePayloadWithoutUnsupportedFields(payload, unsupportedFields);
  let resp = await send(payload);
  if (!resp.ok) {
    const text = await resp.text();
    const unsupportedField = unsupportedOptionalFieldFromText(text);
    if (resp.status !== 401 && resp.status !== 403 && unsupportedField && !unsupportedFields.has(unsupportedField)) {
      await persistUnsupportedOptionalField(params.stateDir, params.upstream, resolvedModel, unsupportedField).catch(() => undefined);
      const downgraded = clonePayloadWithoutOptionalField(payload, unsupportedField);
      if (downgraded !== payload) {
        const retryDelayMs = unsupportedRetryDelayMs(text);
        await waitForRetryDelay(retryDelayMs, params.signal);
        payload = downgraded;
        resp = await send(payload);
      } else {
        return {
          status: resp.status,
          headers: headersFrom(resp),
          stream: Readable.from([text]),
          transportFetches,
        };
      }
    } else {
      return {
        status: resp.status,
        headers: headersFrom(resp),
        stream: Readable.from([text]),
        transportFetches,
      };
    }
  }
  return {
    status: resp.status,
    headers: headersFrom(resp),
    stream: resp.body ? Readable.fromWeb(resp.body as any) : Readable.from([""]),
    transportFetches,
  };
}
