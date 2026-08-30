/* eslint-disable @typescript-eslint/no-explicit-any */
import { readJsonFile, writeJsonFileAtomic } from "@lightrsi/host-adapter";
import { join } from "node:path";
import { Readable } from "node:stream";
import { collectCodexResponseItemsFromStream } from "./context-history/sse-item-collector.js";
import type { CodexProviderConfig } from "./config.js";

export type UpstreamHttpResponse = {
  status: number;
  headers: Record<string, string>;
  text: string;
};

export type UpstreamStreamResponse = {
  status: number;
  headers: Record<string, string>;
  stream: Readable;
};

type OptionalResponsesField =
  | "prompt_cache_options"
  | "prompt_cache_retention"
  | "prompt_cache_key"
  | "prompt_cache_breakpoint";

type UpstreamResponsesCapabilityRecord = {
  endpoint: string;
  unsupportedOptionalFields: OptionalResponsesField[];
  updatedAt: string;
};

const CAPABILITY_TTL_MS = 24 * 60 * 60 * 1000;

const MODEL_CATALOG_TTL_MS = 60_000;
const modelCatalogCache = new Map<string, { expiresAt: number; models: string[] }>();

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

function encryptedReasoningRequested(payload: any): boolean {
  return Array.isArray(payload?.include) && payload.include.includes("reasoning.encrypted_content");
}

function outputItemsFromResponse(text: string, contentType: string | null): any[] {
  if (contentType?.toLowerCase().includes("text/event-stream") || /^event:\s*response\./mu.test(text)) {
    return collectCodexResponseItemsFromStream(text).outputItems;
  }
  try {
    const parsed = JSON.parse(text) as any;
    return Array.isArray(parsed?.output) ? parsed.output : [];
  } catch {
    return [];
  }
}

function requestedEncryptedReasoningMissing(payload: any, resp: Response, text: string): boolean {
  if (!encryptedReasoningRequested(payload)) return false;
  return outputItemsFromResponse(text, resp.headers.get("content-type")).some((item) => {
    const type = String(item?.type ?? "").toLowerCase();
    return (type === "reasoning" || type === "compaction")
      && (typeof item?.encrypted_content !== "string" || !item.encrypted_content.trim());
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

async function loadUnsupportedOptionalFields(
  stateDir: string | undefined,
  upstream: CodexProviderConfig,
): Promise<Set<OptionalResponsesField>> {
  if (!stateDir) return new Set();
  const record = await readJsonFile<UpstreamResponsesCapabilityRecord>(
    upstreamCapabilityPath(stateDir, upstream),
  );
  const updatedAt = Date.parse(String(record?.updatedAt ?? ""));
  const endpoint = endpointFor(upstream);
  const fresh = record?.endpoint === endpoint
    && Number.isFinite(updatedAt)
    && updatedAt <= Date.now()
    && Date.now() - updatedAt < CAPABILITY_TTL_MS;
  const fields = fresh && Array.isArray(record?.unsupportedOptionalFields)
    ? record.unsupportedOptionalFields.filter(
      (value): value is OptionalResponsesField =>
        value === "prompt_cache_options"
          || value === "prompt_cache_retention"
          || value === "prompt_cache_key"
          || value === "prompt_cache_breakpoint",
    )
    : [];
  return new Set(fields);
}

async function persistUnsupportedOptionalField(
  stateDir: string | undefined,
  upstream: CodexProviderConfig,
  field: OptionalResponsesField,
): Promise<void> {
  if (!stateDir) return;
  const unsupportedFields = await loadUnsupportedOptionalFields(stateDir, upstream);
  unsupportedFields.add(field);
  await writeJsonFileAtomic(upstreamCapabilityPath(stateDir, upstream), {
    endpoint: endpointFor(upstream),
    unsupportedOptionalFields: Array.from(unsupportedFields),
    updatedAt: new Date().toISOString(),
  } satisfies UpstreamResponsesCapabilityRecord);
}

export async function requestUpstreamResponses(params: {
  upstream: CodexProviderConfig;
  payload: any;
  inboundAuthorization?: string;
  lightmem2CacheContractDigest?: string;
  stateDir?: string;
}): Promise<UpstreamHttpResponse> {
  const send = (payload: any) => fetch(endpointFor(params.upstream), {
    method: "POST",
    headers: requestHeaders(params),
    body: JSON.stringify(payload),
  });
  const unsupportedFields = await loadUnsupportedOptionalFields(params.stateDir, params.upstream);
  let payload = clonePayloadWithoutUnsupportedFields(params.payload, unsupportedFields);
  payload = await resolveNineRouterPayloadModel(payload, params.upstream, params.inboundAuthorization);
  let resp = await send(payload);
  let text = await resp.text();
  if (!resp.ok) {
    const unsupportedField = unsupportedOptionalFieldFromText(text);
    if (unsupportedField && !unsupportedFields.has(unsupportedField)) {
      await persistUnsupportedOptionalField(params.stateDir, params.upstream, unsupportedField);
      const downgraded = clonePayloadWithoutOptionalField(payload, unsupportedField);
      if (downgraded !== payload) {
        const retryDelayMs = unsupportedRetryDelayMs(text);
        if (retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        payload = downgraded;
        resp = await send(payload);
        text = await resp.text();
      }
    }
  }
  let encryptedRepairAttempts = 0;
  while (resp.ok
    && requestedEncryptedReasoningMissing(payload, resp, text)
    && encryptedRepairAttempts < 2) {
    encryptedRepairAttempts += 1;
    resp = await send(payload);
    text = await resp.text();
  }
  return {
    status: resp.status,
    headers: headersFrom(resp),
    text,
  };
}

export async function requestUpstreamResponsesStream(params: {
  upstream: CodexProviderConfig;
  payload: any;
  inboundAuthorization?: string;
  lightmem2CacheContractDigest?: string;
  stateDir?: string;
}): Promise<UpstreamStreamResponse> {
  const send = (payload: any) => fetch(endpointFor(params.upstream), {
    method: "POST",
    headers: requestHeaders(params),
    body: JSON.stringify(payload),
  });
  const unsupportedFields = await loadUnsupportedOptionalFields(params.stateDir, params.upstream);
  let payload = clonePayloadWithoutUnsupportedFields(params.payload, unsupportedFields);
  payload = await resolveNineRouterPayloadModel(payload, params.upstream, params.inboundAuthorization);
  let resp = await send(payload);
  if (!resp.ok) {
    const text = await resp.text();
    const unsupportedField = unsupportedOptionalFieldFromText(text);
    if (unsupportedField && !unsupportedFields.has(unsupportedField)) {
      await persistUnsupportedOptionalField(params.stateDir, params.upstream, unsupportedField);
      const downgraded = clonePayloadWithoutOptionalField(payload, unsupportedField);
      if (downgraded !== payload) {
        const retryDelayMs = unsupportedRetryDelayMs(text);
        if (retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        payload = downgraded;
        resp = await send(payload);
      } else {
        return {
          status: resp.status,
          headers: headersFrom(resp),
          stream: Readable.from([text]),
        };
      }
    } else {
      return {
        status: resp.status,
        headers: headersFrom(resp),
        stream: Readable.from([text]),
      };
    }
  }
  return {
    status: resp.status,
    headers: headersFrom(resp),
    stream: resp.body ? Readable.fromWeb(resp.body as any) : Readable.from([""]),
  };
}
