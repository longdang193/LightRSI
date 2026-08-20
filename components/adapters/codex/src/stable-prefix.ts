import { createHash } from "node:crypto";
import {
  extractContentText,
  extractStablePrefixContract,
  findFirstUserMessageIndex,
} from "@lightrsi/stabilizer";
import type { HostRequestEnvelope } from "@lightrsi/host-adapter";
import type { TokenPilotCodexConfig } from "./config.js";
import { canAttachPromptCacheBreakpoint } from "./responses-codec.js";

const LIGHTMEM2_CACHE_CONTRACT_VERSION = 1;

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

function isStableDeveloperMessage(message: HostRequestEnvelope["messages"][number]): boolean {
  return message?.role === "system"
    && (message as any)?.metadata?.__codexOriginalRole === "developer"
    && (message as any)?.metadata?.__lightmem2DynamicContext !== true;
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
  const contractEnvelope = identityEnvelope.session
    ? identityEnvelope
    : {
        ...identityEnvelope,
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
      v: LIGHTMEM2_CACHE_CONTRACT_VERSION,
      host: "codex",
      stableCore: cacheableStableCore,
      options: cacheRelevantRequestOptions(params.rawPayload),
    }))
    .digest("hex")
    .slice(0, 24);
  return `lightmem2-codex-${digest}`;
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

function scoreRootPromptCandidate(message: HostRequestEnvelope["messages"][number]): number {
  const originalRole = (message as any)?.metadata?.__codexOriginalRole;
  const text = extractContentText((message as any)?.content);
  let score = 0;
  if (originalRole === "developer") score += 4;
  else if (originalRole === "system") score += 2;
  if (/Your working directory is:/i.test(text)) score += 2;
  if (/Runtime:\s*agent=/i.test(text)) score += 2;
  return score;
}

function findRootPromptCandidate(messages: HostRequestEnvelope["messages"]): {
  index: number;
  text: string;
} | null {
  let best: { index: number; text: string; score: number } | null = null;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index] as any;
    if (!message || typeof message !== "object") continue;
    if (message.role !== "system") continue;
    const originalRole = message.metadata?.__codexOriginalRole;
    if (originalRole !== "developer" && originalRole !== "system") continue;
    const text = extractContentText(message.content);
    if (!text.trim()) continue;
    const score = scoreRootPromptCandidate(message);
    if (!best || score > best.score) {
      best = { index, text, score };
    }
  }
  return best ? { index: best.index, text: best.text } : null;
}

function mergeDynamicContextTexts(...texts: Array<string | undefined>): string {
  const merged: string[] = [];
  for (const text of texts) {
    for (const line of String(text ?? "").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || merged.includes(trimmed)) continue;
      merged.push(trimmed);
    }
  }
  return merged.join("\n");
}

function hasDeveloperDynamicContextMessage(
  messages: HostRequestEnvelope["messages"],
  dynamicContextText: string,
): boolean {
  const target = dynamicContextText.trim();
  if (!target) return true;
  return messages.some((message: any) => {
    if (!message || typeof message !== "object") return false;
    if (message.role !== "system") return false;
    const originalRole = message.metadata?.__codexOriginalRole;
    if (originalRole !== "developer" && originalRole !== "system") return false;
    return extractContentText(message.content).trim() === target;
  });
}

function insertDeveloperDynamicContextMessage(params: {
  envelope: HostRequestEnvelope;
  dynamicContextText: string;
  afterMessageIndex?: number;
}): HostRequestEnvelope {
  const dynamicContextText = params.dynamicContextText.trim();
  if (!dynamicContextText) return params.envelope;
  if (hasDeveloperDynamicContextMessage(params.envelope.messages, dynamicContextText)) {
    return params.envelope;
  }

  const insertAt =
    typeof params.afterMessageIndex === "number"
      ? Math.max(0, Math.min(params.envelope.messages.length, params.afterMessageIndex + 1))
      : (() => {
          const userIndex = findFirstUserMessageIndex(params.envelope.messages);
          return userIndex >= 0 ? userIndex : params.envelope.messages.length;
        })();
  const nextMessages = params.envelope.messages.slice();
  nextMessages.splice(insertAt, 0, {
    role: "system",
    content: dynamicContextText,
    metadata: {
      __codexOriginalRole: "developer",
      __lightmem2DynamicContext: true,
    },
  } as HostRequestEnvelope["messages"][number]);
  return {
    ...params.envelope,
    messages: nextMessages,
  };
}

export function prepareCodexStablePrefix(
  envelope: HostRequestEnvelope,
  config: TokenPilotCodexConfig,
): HostRequestEnvelope {
  if (!config.modules.stabilizer || config.proxyMode.pureForward) return envelope;
  const originalPromptCacheKey =
    typeof envelope.metadata?.promptCacheKey === "string" && envelope.metadata.promptCacheKey.trim().length > 0
      ? envelope.metadata.promptCacheKey
      : undefined;

  const rewrittenEnvelope = envelope;
  const dynamicContextText = "";
  const providerWirePrefixHash = computeProviderWirePrefixHash(
    rewrittenEnvelope,
    dynamicContextText,
  );
  const nextPromptCacheKey = computeStablePromptCacheKey({
    envelope: rewrittenEnvelope,
    rawPayload: envelope.rawPayload,
  });
  const cacheFamilyId = `lightmem2-family-${nextPromptCacheKey.slice("lightmem2-codex-".length)}`;
  const outboundPromptCacheKey = cacheFamilyId;

  const nextMetadata: Record<string, unknown> = {
    ...(rewrittenEnvelope.metadata ?? {}),
    originalPromptCacheKey,
    frameworkStablePromptCacheKey: nextPromptCacheKey,
    lightmem2CacheContractVersion: LIGHTMEM2_CACHE_CONTRACT_VERSION,
    lightmem2CacheContractDigest: nextPromptCacheKey.slice("lightmem2-codex-".length),
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
    nextMetadata.lightmem2CacheContractVersion !== envelope.metadata?.lightmem2CacheContractVersion ||
    nextMetadata.lightmem2CacheContractDigest !== envelope.metadata?.lightmem2CacheContractDigest ||
    nextMetadata.providerWirePrefixHash !== envelope.metadata?.providerWirePrefixHash ||
    nextMetadata.cacheFamilyId !== envelope.metadata?.cacheFamilyId ||
    nextMetadata.providerWirePrefixBoundary !== envelope.metadata?.providerWirePrefixBoundary ||
    nextMetadata.promptCacheOptions !== envelope.metadata?.promptCacheOptions ||
    nextMetadata.promptCacheBreakpoint !== envelope.metadata?.promptCacheBreakpoint ||
    nextMetadata.promptCacheRetention !== envelope.metadata?.promptCacheRetention ||
    nextMetadata.originalPromptCacheKey !== envelope.metadata?.originalPromptCacheKey;

  return rewrittenEnvelope !== envelope || metadataChanged
    ? {
        ...rewrittenEnvelope,
        metadata: nextMetadata,
      }
    : envelope;
}
