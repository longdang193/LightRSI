import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { appendJsonl } from "@lightmem2/host-adapter";
import {
  CODEX_REBASE_CAPABILITY_SCHEMA,
  type CodexRebaseCapability,
  type CodexRebaseCapabilityStatus,
  type CodexUpstreamResponse,
  type JsonObject,
} from "./types.js";

export type CodexRebaseCapabilityJournalReadResult = {
  entries: CodexRebaseCapability[];
  capabilities: CodexRebaseCapability[];
  malformedLineCount: number;
  readError?: string;
};

function cleanDimension(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed || fallback;
}

export function codexRebaseCapabilityJournalPath(stateDir: string): string {
  return join(stateDir, "context-rewrite", "codex", "provider-capabilities.jsonl");
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

function timestampMs(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isStatus(value: unknown): value is CodexRebaseCapabilityStatus {
  return value === "supported" || value === "unsupported";
}

function isCodexRebaseCapability(value: unknown): value is CodexRebaseCapability {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return entry.schema === CODEX_REBASE_CAPABILITY_SCHEMA
    && typeof entry.provider === "string"
    && typeof entry.model === "string"
    && typeof entry.itemType === "string"
    && isStatus(entry.status)
    && timestampMs(entry.observedAt) !== undefined
    && (entry.reason === undefined || typeof entry.reason === "string")
    && (entry.responseStatus === undefined || typeof entry.responseStatus === "number")
    && (entry.errorCode === undefined || typeof entry.errorCode === "string");
}

function capabilityKey(entry: Pick<CodexRebaseCapability, "provider" | "model" | "itemType">): string {
  return `${entry.provider}\u0000${entry.model}\u0000${entry.itemType}`;
}

function collapseLatestCapabilities(entries: CodexRebaseCapability[]): CodexRebaseCapability[] {
  const latest = new Map<string, CodexRebaseCapability>();
  for (const entry of entries) {
    const key = capabilityKey(entry);
    latest.delete(key);
    latest.set(key, entry);
  }
  return Array.from(latest.values());
}

export async function readCodexRebaseCapabilityJournal(
  stateDir: string,
): Promise<CodexRebaseCapabilityJournalReadResult> {
  let raw: string;
  try {
    raw = await readFile(codexRebaseCapabilityJournalPath(stateDir), "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return { entries: [], capabilities: [], malformedLineCount: 0 };
    }
    return {
      entries: [],
      capabilities: [],
      malformedLineCount: 0,
      readError: error instanceof Error ? error.message : String(error),
    };
  }

  const entries: CodexRebaseCapability[] = [];
  let malformedLineCount = 0;
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    try {
      const parsed = JSON.parse(line) as unknown;
      if (isCodexRebaseCapability(parsed)) entries.push(parsed);
      else malformedLineCount += 1;
    } catch {
      malformedLineCount += 1;
    }
  }
  return {
    entries,
    capabilities: collapseLatestCapabilities(entries),
    malformedLineCount,
  };
}

export async function appendCodexRebaseCapability(params: {
  stateDir: string;
  provider: string;
  model: string;
  itemType: string;
  status: CodexRebaseCapabilityStatus;
  reason?: string;
  responseStatus?: number;
  errorCode?: string;
  observedAt?: string;
}): Promise<CodexRebaseCapability> {
  const observedAt = params.observedAt ?? new Date().toISOString();
  if (timestampMs(observedAt) === undefined) {
    throw new Error("Codex rebase capability requires a valid observation time");
  }
  const entry: CodexRebaseCapability = {
    schema: CODEX_REBASE_CAPABILITY_SCHEMA,
    provider: cleanDimension(params.provider, "unknown-provider"),
    model: cleanDimension(params.model, "unknown-model"),
    itemType: cleanDimension(params.itemType, "unknown"),
    status: params.status,
    reason: params.reason,
    responseStatus: params.responseStatus,
    errorCode: params.errorCode,
    observedAt,
  };
  await appendJsonl(codexRebaseCapabilityJournalPath(params.stateDir), entry);
  return entry;
}

export async function readUnsupportedCodexRebaseItemTypes(params: {
  stateDir: string;
  provider: string;
  model: string;
  itemTypes: string[];
}): Promise<string[]> {
  const journal = await readCodexRebaseCapabilityJournal(params.stateDir);
  if (journal.readError) return [];
  const latest = new Map(journal.capabilities.map((entry) => [capabilityKey(entry), entry]));
  const provider = cleanDimension(params.provider, "unknown-provider");
  const model = cleanDimension(params.model, "unknown-model");
  return Array.from(new Set(params.itemTypes))
    .filter((itemType) => latest.get(capabilityKey({
      provider,
      model,
      itemType: cleanDimension(itemType, "unknown"),
    }))?.status === "unsupported");
}

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

export function codexRebasePayloadItemTypes(payload: JsonObject): string[] {
  const input = Array.isArray(payload.input) ? payload.input : [];
  const itemTypes: string[] = [];
  for (const item of input) {
    const entry = asObject(item);
    if (!entry) continue;
    if (typeof entry.type === "string" && entry.type.trim()) itemTypes.push(entry.type.trim());
    else if (typeof entry.role === "string" && entry.role.trim()) itemTypes.push("message");
    else itemTypes.push("unknown");
  }
  return Array.from(new Set(itemTypes));
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
    return output;
  }
  const object = asObject(value);
  if (!object) return output;
  for (const item of Object.values(object)) collectStrings(item, output);
  return output;
}

function parsedResponseText(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function schemaErrorText(response: CodexUpstreamResponse): string {
  const parsed = parsedResponseText(response.text);
  return (parsed === undefined ? [response.text] : collectStrings(parsed)).join(" ").toLowerCase();
}

export function unsupportedCodexRebaseItemTypesFromResponse(params: {
  response: CodexUpstreamResponse;
  itemTypes: string[];
}): string[] {
  if (params.response.status !== 400) return [];
  const text = schemaErrorText(params.response);
  if (!/(schema|unsupported|not supported|invalid_request_error|unknown item)/i.test(text)) return [];
  return params.itemTypes.filter((itemType) => text.includes(itemType.toLowerCase()));
}

export function formatCodexRebaseCapabilityStatus(entry: CodexRebaseCapability): string {
  return `${entry.provider}/${entry.model} ${entry.itemType} ${entry.status}`;
}
