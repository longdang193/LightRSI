import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildArchiveLocation,
  buildArtifactRef,
  buildRecoveryHint,
} from "./index.js";
import { archiveDirWriteTargets, artifactLookupFilePath, hashText, pluginStateSubdir } from "./archive-paths.js";

function countLines(value: string): number {
  let count = 1;
  for (const character of value) if (character === "\n") count += 1;
  return count;
}

export function buildToolResultPreview(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[tool result preview truncated]`;
}

export function toolInlineLimit(toolName: string): number {
  if (toolName === "read") return 12_000;
  if (toolName === "exec" || toolName === "bash" || toolName === "web_fetch") return 4_000;
  return 8_000;
}

function updateArchiveLookupSync(
  dataKey: string,
  archivePath: string,
  archiveDir: string,
  artifactRef?: string,
): void {
  const keyDir = join(archiveDir, "keys");
  const keyPath = join(keyDir, `${hashText(dataKey)}.json`);
  mkdirSync(keyDir, { recursive: true });
  writeFileSync(
    keyPath,
    JSON.stringify({ dataKey, archivePath }, null, 2),
    "utf8",
  );

  const lookupPath = join(archiveDir, "key-lookup.json");
  let lookup: Record<string, string> = {};
  try {
    lookup = JSON.parse(readFileSync(lookupPath, "utf8")) as Record<string, string>;
  } catch {
    lookup = {};
  }
  lookup[dataKey] = archivePath;
  writeFileSync(lookupPath, JSON.stringify(lookup, null, 2), "utf8");
  if (artifactRef) {
    const digest = /^artifact:v2:([a-f0-9]{64})$/.exec(artifactRef)?.[1];
    if (!digest) return;
    const artifactLookupPath = artifactLookupFilePath(dirname(archiveDir), digest);
    let locations: string[] = [];
    try {
      const parsed = JSON.parse(readFileSync(artifactLookupPath, "utf8")) as unknown;
      if (Array.isArray(parsed)) locations = parsed.filter((entry): entry is string => typeof entry === "string");
    } catch {
      locations = [];
    }
    if (!locations.includes(archivePath)) locations.push(archivePath);
    mkdirSync(dirname(artifactLookupPath), { recursive: true });
    writeFileSync(artifactLookupPath, JSON.stringify(locations), "utf8");
  }
}

function archiveContentSync(params: {
  sessionId: string;
  segmentId: string;
  sourcePass: string;
  toolName: string;
  dataKey: string;
  originalText: string;
  archiveDir: string;
  metadata?: Record<string, unknown>;
}): { archivePath: string; archiveDir: string; artifactRef: string } {
  const artifactRef = buildArtifactRef(params.originalText);
  const entry = {
    schemaVersion: 2,
    kind: `${params.sourcePass}_archive`,
    sessionId: params.sessionId,
    segmentId: params.segmentId,
    sourcePass: params.sourcePass,
    toolName: params.toolName,
    dataKey: params.dataKey,
    originalText: params.originalText,
    originalSize: params.originalText.length,
    archivedAt: new Date().toISOString(),
    artifactRef,
    contentSha256: artifactRef.slice("artifact:v2:".length),
    metadata: {
      ...params.metadata,
      archiveStats: {
        ...(params.metadata?.archiveStats && typeof params.metadata.archiveStats === "object" ? params.metadata.archiveStats : {}),
        lineCount: countLines(params.originalText),
      },
    },
  };
  const primary = buildArchiveLocation(params);
  const writeDirs = archiveDirWriteTargets(primary.archiveDir);
  const fileName = primary.archivePath.slice(primary.archiveDir.length + 1);
  const payload = `${JSON.stringify(entry, null, 2)}\n`;
  for (const archiveDir of writeDirs) {
    const archivePath = join(archiveDir, fileName);
    mkdirSync(dirname(archivePath), { recursive: true });
    writeFileSync(archivePath, payload, "utf8");
    updateArchiveLookupSync(params.dataKey, archivePath, archiveDir, artifactRef);
  }
  return { ...primary, artifactRef };
}

export function resolveToolNameFromPersistEvent(event: any): string {
  return String(
    event?.toolName ??
      event?.tool_name ??
      event?.message?.toolName ??
      event?.message?.tool_name ??
      "",
  ).trim().toLowerCase();
}

export type ToolResultPersistOutcome = {
  toolName: string;
  inlineLimit: number;
  originalChars: number;
  dataKey?: string;
  artifactRef?: string;
  outputFile?: string;
  resultMode: "inline" | "artifact" | "inline-fallback";
  previewText?: string;
  noticeText?: string;
  recoveryHint?: string;
  sourcePass?: "tool_result_persist";
  persistedBy?: "runtime.tool_result_persist";
};

export function planToolResultPersistence(params: {
  event: any;
  text: string;
  stateDir: string;
  safeId: (value: string) => string;
  sessionId?: string;
}): ToolResultPersistOutcome {
  const toolName = resolveToolNameFromPersistEvent(params.event);
  const limit = toolInlineLimit(toolName);
  const text = String(params.text ?? "");
  if (text.length <= limit) {
    return {
      toolName,
      inlineLimit: limit,
      originalChars: text.length,
      resultMode: "inline",
    };
  }

  const digest = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const callId = String(params.event?.toolCallId ?? params.event?.tool_call_id ?? "").trim();
  const toolPart = params.safeId(toolName || "tool");
  const dataKey = `tool_result_persist:${toolPart}:${callId ? params.safeId(callId) : digest}`;

  let outputFile: string | undefined;
  let artifactRef: string | undefined;
  try {
    const sessionId = String(params.sessionId ?? params.event?.sessionId ?? params.event?.session_id ?? "proxy-session").trim() || "proxy-session";
    const archived = archiveContentSync({
      sessionId,
      segmentId: callId || `${toolPart}-${digest}`,
      sourcePass: "tool_result_persist",
      toolName: toolName || "tool",
      dataKey,
      originalText: text,
      archiveDir: pluginStateSubdir(params.stateDir, "artifacts", toolPart),
      metadata: {
        toolCallId: callId || undefined,
        persistedBy: "runtime.tool_result_persist",
      },
    });
    outputFile = archived.archivePath;
    artifactRef = archived.artifactRef;
  } catch {
    outputFile = undefined;
  }

  const previewText = buildToolResultPreview(text, limit);
  const noticeText = outputFile
    ? `[persisted tool result] full output moved to: ${outputFile}`
    : "[persisted tool result] artifact write failed, using inline preview fallback";
  const recoveryHint = outputFile
    ? buildRecoveryHint({
        dataKey,
        artifactRef,
        originalSize: text.length,
        archivePath: outputFile,
        sourceLabel: "tool_result_persist",
        enabled: true,
      })
    : "";

  return {
    toolName,
    inlineLimit: limit,
    originalChars: text.length,
    dataKey,
    artifactRef,
    outputFile,
    resultMode: outputFile ? "artifact" : "inline-fallback",
    previewText,
    noticeText,
    recoveryHint,
    sourcePass: "tool_result_persist",
    persistedBy: "runtime.tool_result_persist",
  };
}
