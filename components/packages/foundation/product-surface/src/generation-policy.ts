import { createHash } from "node:crypto";
import type { HostRequestEnvelope } from "@lightrsi/host-adapter";

export const GENERATION_POLICY_LEVELS = ["lite", "full", "ultra"] as const;

export type GenerationPolicyLevel = typeof GENERATION_POLICY_LEVELS[number];

export type GenerationPolicyFeatureConfig = {
  enabled: boolean;
  level: GenerationPolicyLevel;
};

export type GenerationPolicyConfig = {
  caveman: GenerationPolicyFeatureConfig;
  ponytail: GenerationPolicyFeatureConfig;
};

export const CAVEMAN_POLICY_VERSION = "v1";
export const PONYTAIL_POLICY_VERSION = "v1";

export const DEFAULT_GENERATION_POLICY_CONFIG: GenerationPolicyConfig = {
  caveman: { enabled: false, level: "full" },
  ponytail: { enabled: false, level: "full" },
};

const CAVEMAN_POLICY_TEXT: Record<GenerationPolicyLevel, string> = {
  lite: "Remove filler, pleasantries, repetition, excessive hedging, and tool narration. Use normal grammar and full sentences.",
  full: "Answer first. Compress conversation overhead. Fragments are acceptable when unambiguous. Preserve all technical substance.",
  ultra: "Use telegraphic brevity and minimal connective prose where safe. Never sacrifice correctness or required detail.",
};

const PONYTAIL_POLICY_TEXT: Record<GenerationPolicyLevel, string> = {
  lite: "Complete requested work normally. Prefer reuse and choose simpler existing solutions when clear.",
  full: "Enforce YAGNI: inspect existing flow, reuse existing code, use stdlib, native features, installed dependencies, then minimum new implementation.",
  ultra: "Use deletion-first extreme YAGNI. Challenge unnecessary machinery. Minimize files, abstractions, and code while completing required behavior.",
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function rawRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nestedRecord(value: unknown, key: string): Record<string, unknown> {
  return rawRecord(rawRecord(value)[key]);
}

export function isProtectedGenerationPolicyRequest(rawPayload: unknown): boolean {
  const payload = rawRecord(rawPayload);
  const textFormat = nestedRecord(payload.text, "format");
  const responseFormat = rawRecord(payload.response_format);
  return textFormat.type === "json_schema"
    || textFormat.type === "json_object"
    || textFormat.strict === true
    || responseFormat.type === "json_schema"
    || responseFormat.type === "json_object";
}

function policyBlock(config: GenerationPolicyConfig): string {
  const blocks: string[] = [];
  if (config.caveman.enabled) blocks.push(`[LightRSI Caveman ${CAVEMAN_POLICY_VERSION} / ${config.caveman.level}]\n${CAVEMAN_POLICY_TEXT[config.caveman.level]}`);
  if (config.ponytail.enabled) blocks.push(`[LightRSI Ponytail ${PONYTAIL_POLICY_VERSION} / ${config.ponytail.level}]\n${PONYTAIL_POLICY_TEXT[config.ponytail.level]}`);
  return blocks.join("\n\n");
}

export function resolveCavemanPolicy(level: GenerationPolicyLevel): string {
  return CAVEMAN_POLICY_TEXT[level];
}

export function resolvePonytailPolicy(level: GenerationPolicyLevel): string {
  return PONYTAIL_POLICY_TEXT[level];
}

export function applyGenerationPolicy(
  envelope: HostRequestEnvelope,
  rawConfig: GenerationPolicyConfig,
): HostRequestEnvelope {
  const config = normalizeGenerationPolicyConfig(rawConfig);
  if ((!config.caveman.enabled && !config.ponytail.enabled)
    || isProtectedGenerationPolicyRequest(envelope.rawPayload)
    || envelope.metadata?.generationPolicyApplied === true) return envelope;
  const block = policyBlock(config);
  if (!block) return envelope;
  const instructions = envelope.instructions ? `${envelope.instructions}\n\n${block}` : block;
  const digest = sha256(JSON.stringify({ instructions, tools: envelope.tools ?? null, metadata: envelope.metadata ?? null }));
  return {
    ...envelope,
    instructions,
    metadata: {
      ...envelope.metadata,
      generationPolicyApplied: true,
      generationPolicyDigest: `sha256:${digest}`,
      generationPolicyVersion: `${CAVEMAN_POLICY_VERSION}/${PONYTAIL_POLICY_VERSION}`,
    },
  };
}

function featureConfig(value: unknown): GenerationPolicyFeatureConfig {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const level = GENERATION_POLICY_LEVELS.includes(input.level as GenerationPolicyLevel)
    ? input.level as GenerationPolicyLevel
    : "full";
  return {
    enabled: input.enabled === true,
    level,
  };
}

export function normalizeGenerationPolicyConfig(raw: unknown): GenerationPolicyConfig {
  const input = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    caveman: featureConfig(input.caveman),
    ponytail: featureConfig(input.ponytail),
  };
}
