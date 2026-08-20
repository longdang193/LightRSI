import { createHash } from "node:crypto";
import {
  applyStablePrefixToInstructions,
  applyStablePrefixToMessage,
  extractContentText,
  extractStablePrefixContract,
  findFirstUserMessageIndex,
  rewriteTextForStablePrefix,
} from "@lightrsi/stabilizer";
import type { HostRequestEnvelope } from "@lightrsi/host-adapter";
import type { TokenPilotCodexConfig } from "./config.js";

const LIGHTMEM2_CACHE_CONTRACT_VERSION = 1;

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

function computeStablePromptCacheKey(params: {
  envelope: HostRequestEnvelope;
  rawPayload: unknown;
}): string {
  const contractEnvelope = params.envelope.session
    ? params.envelope
    : {
        ...params.envelope,
        session: {
          host: { hostId: "codex" },
        },
      } as HostRequestEnvelope;
  const stableCore = extractStablePrefixContract(contractEnvelope).stableCore.map((segment) => ({
    key: segment.key,
    role: segment.role,
    source: segment.source,
    text: segment.text,
  }));
  const digest = createHash("sha256")
    .update(JSON.stringify({
      v: LIGHTMEM2_CACHE_CONTRACT_VERSION,
      host: "codex",
      stableCore,
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

type CodexPromptRewrite = ReturnType<typeof rewriteTextForStablePrefix>;

function normalizeCodexAgentSeparator(text: string): string {
  return String(text ?? "").replace(/agent=<AGENT_ID>\s+\|/g, "agent=<AGENT_ID>|");
}

function rewriteCodexPromptForStablePrefix(promptText: string): CodexPromptRewrite {
  const rewrite = rewriteTextForStablePrefix(promptText);
  return {
    ...rewrite,
    canonicalText: normalizeCodexAgentSeparator(rewrite.canonicalText),
    forwardedText: normalizeCodexAgentSeparator(rewrite.forwardedText),
  };
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

  const candidate = findRootPromptCandidate(envelope.messages);
  const instructionText = typeof envelope.instructions === "string" ? envelope.instructions : "";
  const instructionRewrite = instructionText.trim()
    ? rewriteCodexPromptForStablePrefix(instructionText)
    : null;
  const rootRewrite = candidate ? rewriteCodexPromptForStablePrefix(candidate.text) : null;
  const dynamicContextText = mergeDynamicContextTexts(
    instructionRewrite?.dynamicContextText,
    rootRewrite?.dynamicContextText,
  );
  const target = config.hooks.dynamicContextTarget;

  let rewrittenEnvelope = envelope;
  if (instructionRewrite?.changed) {
    rewrittenEnvelope = applyStablePrefixToInstructions({
      envelope: rewrittenEnvelope,
      dynamicContextTarget: target,
      mergeDynamicContextIntoInstructions: false,
    });
  }
  if (candidate && rootRewrite?.changed) {
    const nextCandidate = findRootPromptCandidate(rewrittenEnvelope.messages);
    if (nextCandidate) {
      rewrittenEnvelope = applyStablePrefixToMessage({
        envelope: rewrittenEnvelope,
        messageIndex: nextCandidate.index,
        dynamicContextTarget: target,
        mergeDynamicContextIntoMessage: false,
      });
      if (target === "developer" && dynamicContextText) {
        rewrittenEnvelope = insertDeveloperDynamicContextMessage({
          envelope: rewrittenEnvelope,
          dynamicContextText,
          afterMessageIndex: nextCandidate.index,
        });
      }
    }
  } else if (target === "developer" && dynamicContextText) {
    rewrittenEnvelope = insertDeveloperDynamicContextMessage({
      envelope: rewrittenEnvelope,
      dynamicContextText,
    });
  }

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

  const nextMetadata = {
    ...(rewrittenEnvelope.metadata ?? {}),
    originalPromptCacheKey,
    frameworkStablePromptCacheKey: nextPromptCacheKey,
    lightmem2CacheContractVersion: LIGHTMEM2_CACHE_CONTRACT_VERSION,
    lightmem2CacheContractDigest: nextPromptCacheKey.slice("lightmem2-codex-".length),
    providerWirePrefixHash,
    cacheFamilyId,
    providerWirePrefixBoundary: "before_first_user",
    promptCacheKey: outboundPromptCacheKey,
    promptCacheRetention: "24h",
  };

  const metadataChanged =
    nextMetadata.promptCacheKey !== envelope.metadata?.promptCacheKey ||
    nextMetadata.frameworkStablePromptCacheKey !== envelope.metadata?.frameworkStablePromptCacheKey ||
    nextMetadata.lightmem2CacheContractVersion !== envelope.metadata?.lightmem2CacheContractVersion ||
    nextMetadata.lightmem2CacheContractDigest !== envelope.metadata?.lightmem2CacheContractDigest ||
    nextMetadata.providerWirePrefixHash !== envelope.metadata?.providerWirePrefixHash ||
    nextMetadata.cacheFamilyId !== envelope.metadata?.cacheFamilyId ||
    nextMetadata.providerWirePrefixBoundary !== envelope.metadata?.providerWirePrefixBoundary ||
    nextMetadata.promptCacheRetention !== envelope.metadata?.promptCacheRetention ||
    nextMetadata.originalPromptCacheKey !== envelope.metadata?.originalPromptCacheKey;

  return rewrittenEnvelope !== envelope || metadataChanged
    ? {
        ...rewrittenEnvelope,
        metadata: nextMetadata,
      }
    : envelope;
}
