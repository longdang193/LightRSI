import { createHash } from "node:crypto";

const ROUTER_CACHE_TELEMETRY_HEADERS = [
  "x-9router-cache-namespace",
  "x-9router-cache-family-id",
  "x-9router-cache-capabilities",
  "x-9router-cache-read-input-tokens",
  "x-9router-cache-write-input-tokens",
  "x-9router-prompt-cache-key",
  "x-9router-provider",
  "x-9router-resolved-model",
  "x-9router-route-id",
] as const;

export type RouterCacheTelemetry = {
  schemaVersion: 1;
  status: "observed" | "configured_only" | "unavailable";
  routeIdentitySource: "router_headers" | "configured_endpoint" | "unavailable";
  receivedLightmem2CacheContractDigest: string | null;
  lightmem2CacheFamilyId: string | null;
  configuredGateway: string | null;
  configuredEndpointDigest: string | null;
  resolvedModel: string | null;
  routeId: string | null;
  provider: string | null;
  routerCacheFamilyId: string | null;
  routerPromptCacheKey: string | null;
  providerCacheReadInputTokens: number | null;
  providerCacheWriteInputTokens: number | null;
  boundary: Record<string, string>;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function usageValue(usage: unknown, keys: string[]): number | null {
  if (!usage || typeof usage !== "object") return null;
  const record = usage as Record<string, unknown>;
  for (const key of keys) {
    const direct = nonNegativeNumber(record[key]);
    if (direct !== null) return direct;
  }
  return null;
}

function nestedUsageValue(usage: unknown, key: string): number | null {
  if (!usage || typeof usage !== "object") return null;
  const record = usage as Record<string, unknown>;
  for (const name of ["input_tokens_details", "prompt_tokens_details"]) {
    const details = record[name];
    if (!details || typeof details !== "object") continue;
    const value = nonNegativeNumber((details as Record<string, unknown>)[key]);
    if (value !== null) return value;
  }
  return null;
}

function safeBoundary(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    ROUTER_CACHE_TELEMETRY_HEADERS.flatMap((name) => {
      const value = nonEmptyString(headers[name]);
      return value === null ? [] : [[name, value]];
    }),
  );
}

function normalizeGatewayEndpoint(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    const pathname = url.pathname
      .replace(/\/+$/g, "")
      .replace(/\/v1(?:\/responses)?$/i, "") || "/";
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${pathname}`;
  } catch {
    return baseUrl.replace(/[?#].*$/, "").replace(/\/+$/g, "").toLowerCase();
  }
}

export function computeSafeGatewayEndpointDigest(baseUrl: unknown): string | null {
  const endpoint = nonEmptyString(baseUrl);
  if (!endpoint) return null;
  return `sha256:${createHash("sha256").update(normalizeGatewayEndpoint(endpoint)).digest("hex")}`;
}

export function collectRouterCacheTelemetry(params: {
  headers: Record<string, string>;
  responseModel?: unknown;
  usage?: unknown;
  upstreamName?: unknown;
  upstreamBaseUrl?: unknown;
  receivedLightmem2CacheContractDigest?: unknown;
  lightmem2CacheFamilyId?: unknown;
}): RouterCacheTelemetry {
  const boundary = safeBoundary(params.headers);
  const providerCacheReadInputTokens =
    usageValue(params.usage, ["cache_read_input_tokens", "cached_input_tokens", "cached_tokens"]) ??
    nestedUsageValue(params.usage, "cached_tokens") ??
    nonNegativeNumber(boundary["x-9router-cache-read-input-tokens"]);
  const providerCacheWriteInputTokens =
    usageValue(params.usage, ["cache_creation_input_tokens", "cache_write_input_tokens"]) ??
    nonNegativeNumber(boundary["x-9router-cache-write-input-tokens"]);
  const configuredGateway = nonEmptyString(params.upstreamName);
  const configuredEndpointDigest = computeSafeGatewayEndpointDigest(params.upstreamBaseUrl);
  const routeId = nonEmptyString(boundary["x-9router-route-id"]);
  const provider = nonEmptyString(boundary["x-9router-provider"]);
  const routerCacheFamilyId =
    nonEmptyString(boundary["x-9router-cache-family-id"]) ??
    nonEmptyString(boundary["x-9router-cache-namespace"]);
  const routerPromptCacheKey = nonEmptyString(boundary["x-9router-prompt-cache-key"]);
  const hasRouterHeaders = routeId !== null
    || provider !== null
    || routerCacheFamilyId !== null
    || routerPromptCacheKey !== null
    || nonEmptyString(boundary["x-9router-resolved-model"]) !== null;
  const providerCacheObserved = providerCacheReadInputTokens !== null || providerCacheWriteInputTokens !== null;
  const status = Object.keys(boundary).length > 0 || providerCacheObserved
    ? "observed"
    : configuredEndpointDigest !== null
      ? "configured_only"
      : "unavailable";
  const responseModel = nonEmptyString(params.responseModel);

  return {
    schemaVersion: 1,
    status,
    routeIdentitySource: hasRouterHeaders ? "router_headers" : configuredEndpointDigest !== null ? "configured_endpoint" : "unavailable",
    receivedLightmem2CacheContractDigest: nonEmptyString(params.receivedLightmem2CacheContractDigest),
    lightmem2CacheFamilyId: nonEmptyString(params.lightmem2CacheFamilyId),
    configuredGateway,
    configuredEndpointDigest,
    resolvedModel: nonEmptyString(boundary["x-9router-resolved-model"]) ?? responseModel,
    routeId,
    provider,
    routerCacheFamilyId,
    routerPromptCacheKey,
    providerCacheReadInputTokens,
    providerCacheWriteInputTokens,
    boundary,
  };
}