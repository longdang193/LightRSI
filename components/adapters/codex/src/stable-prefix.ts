import { createHash } from "node:crypto";
import {
  extractContentText,
  extractStablePrefixContract,
  findFirstUserMessageIndex,
  normalizeUserMessageText,
} from "@lightrsi/stabilizer";
import type { HostRequestEnvelope } from "@lightrsi/host-adapter";
import type { TokenPilotCodexConfig } from "./config.js";
import { canAttachPromptCacheBreakpoint } from "./responses-codec.js";

const LIGHTRSI_CACHE_CONTRACT_VERSION = 1;

export function isGpt56OrLaterModel(model: string): boolean {
  const normalized = String(model ?? "").split("/").pop() ?? "";
  const match = /^gpt-(\d+)\.(\d+)(?:-|$)/.exec(normalized);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 5 || (major === 5 && minor >= 6);
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalizeJson(entry)]),
  );
}

const CACHE_IRRELEVANT_REQUEST_KEYS = new Set([
  "client_metadata",
  "input",
  "instructions",
  "metadata",
  "model",
  "previous_response_id",
  "prompt_cache_key",
  "prompt_cache_retention",
  "stream",
  "tools",
]);

export function cacheRelevantRequestOptionNames(rawPayload: unknown): string[] {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return [];
  return Object.keys(rawPayload as Record<string, unknown>)
    .filter((key) => !CACHE_IRRELEVANT_REQUEST_KEYS.has(key))
    .sort((left, right) => left.localeCompare(right));
}

export function cacheRelevantRequestOptionFingerprints(rawPayload: unknown): Record<string, string> {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return {};
  const payload = rawPayload as Record<string, unknown>;
  return Object.fromEntries(
    cacheRelevantRequestOptionNames(rawPayload).map((key) => [
      key,
      createHash("sha256").update(JSON.stringify(canonicalizeJson(payload[key]))).digest("hex").slice(0, 16),
    ]),
  );
}

function describeJsonShape(value: unknown, path = "$", depth = 0, budget = { remaining: 64 }): string[] {
  if (budget.remaining <= 0) return [`${path}:truncated`];
  budget.remaining -= 1;
  if (value === null) return [`${path}:null`];
  if (Array.isArray(value)) {
    return [
      `${path}:array(${value.length})`,
      ...(value.length > 0 && depth < 4 ? describeJsonShape(value[0], `${path}[]`, depth + 1, budget) : []),
    ];
  }
  if (typeof value !== "object") return [`${path}:${typeof value}`];
  return [
    `${path}:object`,
    ...Object.keys(value as Record<string, unknown>)
      .sort((left, right) => left.localeCompare(right))
      .flatMap((key) => describeJsonShape(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
        depth + 1,
        budget,
      )),
  ];
}

export function cacheRelevantRequestOptionShapes(rawPayload: unknown): Record<string, string[]> {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return {};
  const payload = rawPayload as Record<string, unknown>;
  return Object.fromEntries(
    cacheRelevantRequestOptionNames(rawPayload).map((key) => [key, describeJsonShape(payload[key])]),
  );
}

function cacheRelevantRequestOptions(rawPayload: unknown): unknown {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return null;
  const options = Object.fromEntries(
    Object.entries(rawPayload as Record<string, unknown>)
      .filter(([key]) => !CACHE_IRRELEVANT_REQUEST_KEYS.has(key)),
  );
  return canonicalizeJson(options);
}

function canonicalizeCodexCacheIdentityText(text: string): string {
  return normalizeUserMessageText(text).replace(
    /(?:[A-Za-z]:[\\/]|\/)[^\r\n"'`)]*?[\\/]\.deepagents[\\/]+conversation_history[\\/]+entry-[^\s"'`)]*/gi,
    "<DEEPAGENTS_HISTORY_ENTRY>",
  );
}

function isStableDeveloperMessage(message: HostRequestEnvelope["messages"][number]): boolean {
  return message?.role === "system"
    && (message as any)?.metadata?.__codexOriginalRole === "developer"
    && (message as any)?.metadata?.__lightrsiDynamicContext !== true;
}

export function dedupeCodexStableDeveloperMessages(envelope: HostRequestEnvelope): HostRequestEnvelope {
  const seen = new Set<string>();
  let changed = false;
  const messages = envelope.messages.filter((message) => {
    if (!isStableDeveloperMessage(message)) return true;
    const text = extractContentText(message.content);
    if (!text.trim() || !seen.has(text)) {
      if (text.trim()) seen.add(text);
      return true;
    }
    changed = true;
    return false;
  });
  return changed ? { ...envelope, messages } : envelope;
}

function computeStablePromptCacheKey(params: {
  envelope: HostRequestEnvelope;
  rawPayload: unknown;
}): string {
  const identityEnvelope = dedupeCodexStableDeveloperMessages(params.envelope);
  const normalizedEnvelope = {
    ...identityEnvelope,
    instructions: typeof identityEnvelope.instructions === "string"
      ? canonicalizeCodexCacheIdentityText(identityEnvelope.instructions)
      : identityEnvelope.instructions,
    messages: identityEnvelope.messages.map((message) => {
      if (message.role !== "system") return message;
      return {
        ...message,
        content: canonicalizeCodexCacheIdentityText(extractContentText(message.content)),
      };
    }),
  };
  const contractEnvelope = normalizedEnvelope.session
    ? normalizedEnvelope
    : {
        ...normalizedEnvelope,
        session: {
          host: { hostId: "codex" },
        },
      } as HostRequestEnvelope;
  const firstUserIndex = findFirstUserMessageIndex(contractEnvelope.messages);
  const cacheableStableCore = extractStablePrefixContract(contractEnvelope).stableCore
    .filter((segment) => {
      const messageMatch = /^messages\.(\d+)$/.exec(segment.key);
      if (!messageMatch) return true;
      return Number(messageMatch[1])
        < (firstUserIndex >= 0 ? firstUserIndex : contractEnvelope.messages.length);
    })
    .map((segment) => ({
      key: segment.key,
      role: segment.role,
      source: segment.source,
      text: segment.text,
    }));
  const digest = createHash("sha256")
    .update(JSON.stringify({
      v: LIGHTRSI_CACHE_CONTRACT_VERSION,
      host: "codex",
      stableCore: cacheableStableCore,
      options: cacheRelevantRequestOptions(params.rawPayload),
    }))
    .digest("hex")
    .slice(0, 24);
  return `lightrsi-codex-${digest}`;
}

function computeProviderWirePrefixHash(
  envelope: HostRequestEnvelope,
  dynamicContextText: string,
): string {
  const firstUserIndex = findFirstUserMessageIndex(envelope.messages);
  const boundary = firstUserIndex >= 0 ? firstUserIndex : envelope.messages.length;
  const dynamicText = dynamicContextText.trim();
  const prefixMessages = envelope.messages.slice(0, boundary).filter((message) => {
    if (!dynamicText) return true;
    return extractContentText(message.content).trim() !== dynamicText;
  });
  return createHash("sha256")
    .update(JSON.stringify({
      v: 1,
      instructions: envelope.instructions ?? null,
      tools: envelope.tools ?? null,
      messages: prefixMessages,
    }))
    .digest("hex");
}

export function prepareCodexStablePrefix(
  envelope: HostRequestEnvelope,
  config: TokenPilotCodexConfig,
): HostRequestEnvelope {
  if (!config.modules.stabilizer || config.proxyMode.pureForward) return envelope;
  const rewrittenEnvelope = envelope;
  const dynamicContextText = "";
  const providerWirePrefixHash = computeProviderWirePrefixHash(
    rewrittenEnvelope,
    dynamicContextText,
  );
  const nextPromptCacheKey = computeStablePromptCacheKey({
    envelope,
    rawPayload: envelope.rawPayload,
  });
  const cacheFamilyId = `lightrsi-family-${nextPromptCacheKey.slice("lightrsi-codex-".length)}`;
  const outboundPromptCacheKey = cacheFamilyId;

  const nextMetadata: Record<string, unknown> = {
    ...(rewrittenEnvelope.metadata ?? {}),
    frameworkStablePromptCacheKey: nextPromptCacheKey,
    lightrsiCacheContractVersion: LIGHTRSI_CACHE_CONTRACT_VERSION,
    lightrsiCacheContractDigest: nextPromptCacheKey.slice("lightrsi-codex-".length),
    providerWirePrefixHash,
    cacheFamilyId,
    providerWirePrefixBoundary: "before_first_user",
    promptCacheKey: outboundPromptCacheKey,
  };
  delete nextMetadata.promptCacheOptions;
  delete nextMetadata.promptCacheBreakpoint;
  if (isGpt56OrLaterModel(rewrittenEnvelope.model) && canAttachPromptCacheBreakpoint(rewrittenEnvelope.messages)) {
    Object.assign(nextMetadata, {
      promptCacheOptions: { mode: "explicit", ttl: "30m" },
      promptCacheBreakpoint: { mode: "explicit" },
    });
  } else if (!isGpt56OrLaterModel(rewrittenEnvelope.model)) {
    Object.assign(nextMetadata, {
      ...(typeof envelope.metadata?.promptCacheRetention === "string"
        ? { promptCacheRetention: envelope.metadata.promptCacheRetention }
        : {}),
    });
  }

  const metadataChanged =
    nextMetadata.promptCacheKey !== envelope.metadata?.promptCacheKey ||
    nextMetadata.frameworkStablePromptCacheKey !== envelope.metadata?.frameworkStablePromptCacheKey ||
    nextMetadata.lightrsiCacheContractVersion !== envelope.metadata?.lightrsiCacheContractVersion ||
    nextMetadata.lightrsiCacheContractDigest !== envelope.metadata?.lightrsiCacheContractDigest ||
    nextMetadata.providerWirePrefixHash !== envelope.metadata?.providerWirePrefixHash ||
    nextMetadata.cacheFamilyId !== envelope.metadata?.cacheFamilyId ||
    nextMetadata.providerWirePrefixBoundary !== envelope.metadata?.providerWirePrefixBoundary ||
    nextMetadata.promptCacheOptions !== envelope.metadata?.promptCacheOptions ||
    nextMetadata.promptCacheBreakpoint !== envelope.metadata?.promptCacheBreakpoint ||
    nextMetadata.promptCacheRetention !== envelope.metadata?.promptCacheRetention;

  return rewrittenEnvelope !== envelope || metadataChanged
    ? {
        ...rewrittenEnvelope,
        metadata: nextMetadata,
      }
    : envelope;
}
