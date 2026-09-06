function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  const num = finiteNumber(value);
  return typeof num === "number" && num >= 0 ? num : undefined;
}

function firstField(record: Record<string, unknown>, names: string[]): number | undefined {
  for (const name of names) {
    const value = nonNegativeNumber(record[name]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function nestedField(record: Record<string, unknown>, names: string[]): number | undefined {
  const inputDetails = asRecord(record.input_tokens_details);
  const promptDetails = asRecord(record.prompt_tokens_details);
  return firstField(inputDetails ?? {}, names) ?? firstField(promptDetails ?? {}, names);
}

export type CacheEvidence = "hit" | "miss" | "unknown";

export type CacheUsageEvidence = {
  inputTotal?: number;
  inputUncached?: number;
  cacheRead?: number;
  cacheWrite?: number;
  evidence: CacheEvidence;
};

export function normalizeCacheUsageEvidence(
  usage: unknown,
  providerHint?: string,
): CacheUsageEvidence {
  const record = asRecord(usage);
  if (!record) return { evidence: "unknown" };

  const cacheRead = firstField(record, ["cache_read_input_tokens", "cached_tokens"])
    ?? nestedField(record, ["cached_tokens"]);
  const cacheWrite = firstField(record, ["cache_write_tokens", "cache_creation_input_tokens"])
    ?? nestedField(record, ["cache_write_tokens"]);
  const input = firstField(record, ["input_tokens", "prompt_tokens"]);
  const anthropic = /anthropic|claude/i.test(String(providerHint ?? ""))
    || Object.prototype.hasOwnProperty.call(record, "cache_creation_input_tokens");
  const inputTotal = input === undefined
    ? [cacheRead, cacheWrite].every((value) => value !== undefined)
      ? (cacheRead as number) + (cacheWrite as number)
      : undefined
    : anthropic
      ? input + (cacheRead ?? 0) + (cacheWrite ?? 0)
      : input;
  const inputUncached = input === undefined
    ? undefined
    : anthropic
      ? input
      : cacheRead === undefined && cacheWrite === undefined
        ? input
        : Math.max(0, input - (cacheRead ?? 0) - (cacheWrite ?? 0));
  const evidence: CacheEvidence = cacheRead !== undefined
    ? cacheRead > 0 ? "hit" : "miss"
    : cacheWrite !== undefined ? "miss" : "unknown";

  return {
    ...(inputTotal === undefined ? {} : { inputTotal }),
    ...(inputUncached === undefined ? {} : { inputUncached }),
    ...(cacheRead === undefined ? {} : { cacheRead }),
    ...(cacheWrite === undefined ? {} : { cacheWrite }),
    evidence,
  };
}

export function readCachedInputTokens(usage: unknown): number {
  const record = asRecord(usage);
  if (!record) return 0;

  const direct = finiteNumber(record.cache_read_input_tokens);
  if (typeof direct === "number" && direct >= 0) return direct;

  const topLevel = finiteNumber(record.cached_tokens);
  if (typeof topLevel === "number" && topLevel >= 0) return topLevel;

  const inputDetails = asRecord(record.input_tokens_details);
  const promptDetails = asRecord(record.prompt_tokens_details);
  const nested =
    finiteNumber(inputDetails?.cached_tokens)
    ?? finiteNumber(promptDetails?.cached_tokens);
  if (typeof nested === "number" && nested >= 0) return nested;

  return 0;
}

export function readInputTokens(usage: unknown): number {
  const record = asRecord(usage);
  if (!record) return 0;
  const direct = finiteNumber(record.input_tokens);
  if (typeof direct === "number" && direct >= 0) return direct;
  const promptTokens = finiteNumber(record.prompt_tokens);
  return typeof promptTokens === "number" && promptTokens >= 0 ? promptTokens : 0;
}

export function readCacheWriteTokens(usage: unknown): number {
  const record = asRecord(usage);
  if (!record) return 0;

  const direct = finiteNumber(record.cache_write_tokens);
  if (typeof direct === "number" && direct >= 0) return direct;

  const anthropic = finiteNumber(record.cache_creation_input_tokens);
  if (typeof anthropic === "number" && anthropic >= 0) return anthropic;

  const inputDetails = asRecord(record.input_tokens_details);
  const promptDetails = asRecord(record.prompt_tokens_details);
  const nested =
    finiteNumber(inputDetails?.cache_write_tokens)
    ?? finiteNumber(promptDetails?.cache_write_tokens);
  return typeof nested === "number" && nested >= 0 ? nested : 0;
}

export function hasCachedInputTokens(usage: unknown): boolean {
  return readCachedInputTokens(usage) > 0;
}

