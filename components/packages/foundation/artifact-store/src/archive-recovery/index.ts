import { randomUUID, createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  archiveDirWriteTargets,
  defaultArchiveDir,
  defaultArchiveLookupDirs,
  defaultPluginStateDir,
  pluginStateSubdirCandidates,
  hashText,
  sanitizePathPart,
} from "./archive-paths.js";

export type GenericArchiveEntry = {
  schemaVersion: number;
  kind: string;
  sessionId: string;
  segmentId: string;
  sourcePass: string;
  toolName: string;
  dataKey: string;
  originalText: string;
  originalSize: number;
  archivedAt: string;
  artifactRef?: string;
  contentSha256?: string;
  metadata?: Record<string, unknown>;
};

export type RecoveredArchiveRenderResult = {
  text: string;
  details: {
    originalSize: number;
    sourcePass: string;
    toolName: string;
    recovered: true;
    recoveredStartLine?: number;
    recoveredEndLine?: number;
    recoveredLineCount?: number;
  };
};

export type ArchiveContentParams = {
  sessionId: string;
  segmentId: string;
  sourcePass: string;
  toolName: string;
  dataKey: string;
  originalText: string;
  workspaceDir?: string;
  archiveDir?: string;
  metadata?: Record<string, unknown>;
};

export type ArchiveLocationParams = {
  sessionId: string;
  segmentId: string;
  workspaceDir?: string;
  archiveDir?: string;
};

export type ArchiveLocation = {
  archivePath: string;
  archiveDir: string;
  artifactRef?: string;
};

const ARTIFACT_REF_PREFIX = "artifact:v2:";
const ARTIFACT_REF_PATTERN = /^artifact:v2:[a-f0-9]{64}$/;

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildArtifactRef(originalText: string): string {
  return `${ARTIFACT_REF_PREFIX}${sha256Bytes(Buffer.from(originalText, "utf8"))}`;
}

function artifactDigest(artifactRef: string): string | null {
  return ARTIFACT_REF_PATTERN.test(artifactRef) ? artifactRef.slice(ARTIFACT_REF_PREFIX.length) : null;
}

async function atomicWriteFile(path: string, payload: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, payload, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

export function isMemoryFaultRecoveryEnabled(): boolean {
  const raw = process.env.TOKENPILOT_MEMORY_FAULT_RECOVERY_ENABLED;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return true;
  }
  return TRUE_ENV_VALUES.has(raw.trim().toLowerCase());
}

export function buildRecoveryHint(params: {
  dataKey: string;
  originalSize: number;
  archivePath: string;
  sourceLabel: string;
  enabled?: boolean;
}): string {
  const { dataKey, originalSize, archivePath, sourceLabel, enabled } = params;
  const effectiveEnabled = (enabled ?? true) && isMemoryFaultRecoveryEnabled();
  if (!effectiveEnabled) return "";
  return (
    `\n\n[${sourceLabel}] Full content omitted to save context (${originalSize.toLocaleString()} chars).\n` +
    `To recover it, call the tool memory_fault_recover with {\"dataKey\":\"${dataKey}\"}.\n` +
    `For a focused code window, you may instead call memory_fault_recover with {\"dataKey\":\"${dataKey}\",\"startLine\":20,\"endLine\":80}.\n` +
    `This is an internal recovery read; do not call the original tool again for this content.`
  );
}

export function renderRecoveredArchive(params: {
  dataKey: string;
  archive: GenericArchiveEntry;
  startLine?: number;
  endLine?: number;
}): RecoveredArchiveRenderResult {
  const startLine = typeof params.startLine === "number" && Number.isFinite(params.startLine)
    ? Math.max(1, Math.trunc(params.startLine))
    : undefined;
  const endLine = typeof params.endLine === "number" && Number.isFinite(params.endLine)
    ? Math.max(1, Math.trunc(params.endLine))
    : undefined;
  const lines = params.archive.originalText.split("\n");
  const hasLineWindow = startLine != null || endLine != null;
  const boundedStart = startLine ?? 1;
  const boundedEnd = Math.min(endLine ?? lines.length, lines.length);
  const recoveredText = hasLineWindow
    ? lines.slice(Math.max(0, boundedStart - 1), Math.max(0, boundedEnd)).join("\n")
    : params.archive.originalText;

  return {
    text:
      `[Memory Fault Recovery] Recovered content for: ${params.dataKey}\n`
      + `Original size: ${params.archive.originalSize.toLocaleString()} chars\n`
      + (hasLineWindow ? `Recovered lines: ${boundedStart}-${boundedEnd}\n` : "")
      + `Archived by: ${params.archive.sourcePass}\n`
      + `--- Recovered Content ---\n`
      + `${recoveredText}\n`
      + "--- End Recovered Content ---",
    details: {
      originalSize: params.archive.originalSize,
      sourcePass: params.archive.sourcePass,
      toolName: params.archive.toolName,
      recovered: true,
      ...(hasLineWindow
        ? {
            recoveredStartLine: boundedStart,
            recoveredEndLine: boundedEnd,
            recoveredLineCount: Math.max(0, boundedEnd - boundedStart + 1),
          }
        : {}),
    },
  };
}

export async function archiveContent(params: ArchiveContentParams): Promise<ArchiveLocation> {
  const artifactRef = buildArtifactRef(params.originalText);
  const entry: GenericArchiveEntry = {
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
    contentSha256: artifactRef.slice(ARTIFACT_REF_PREFIX.length),
    metadata: params.metadata,
  };
  const primary = buildArchiveLocation(params);
  const writeDirs = archiveDirWriteTargets(primary.archiveDir);
  const fileName = primary.archivePath.slice(primary.archiveDir.length + 1);
  const payload = `${JSON.stringify(entry, null, 2)}\n`;

  for (const archiveDir of writeDirs) {
    const archivePath = join(archiveDir, fileName);
    await mkdir(dirname(archivePath), { recursive: true });
    await atomicWriteFile(archivePath, payload);
    await updateArchiveLookup(params.dataKey, archivePath, archiveDir);
  }

  return { ...primary, artifactRef };
}

export function buildArchiveLocation(params: ArchiveLocationParams): ArchiveLocation {
  const archiveDir = params.archiveDir ?? defaultArchiveDir(params.sessionId, params.workspaceDir);
  const timestamp = Date.now();
  const fileName = `${timestamp}-${sanitizePathPart(params.segmentId)}.json`;
  const archivePath = join(archiveDir, fileName);
  return { archiveDir, archivePath };
}

export async function updateArchiveLookup(
  dataKey: string,
  archivePath: string,
  archiveDir: string,
): Promise<void> {
  const keyDir = join(archiveDir, "keys");
  const keyPath = join(keyDir, `${hashText(dataKey)}.json`);
  await mkdir(keyDir, { recursive: true });
  await atomicWriteFile(
    keyPath,
    JSON.stringify({ dataKey, archivePath }, null, 2),
  );

  const lookupPath = join(archiveDir, "key-lookup.json");
  let lookup: Record<string, string> = {};
  try {
    const raw = await readFile(lookupPath, "utf8");
    lookup = JSON.parse(raw) as Record<string, string>;
  } catch {
    lookup = {};
  }
  lookup[dataKey] = archivePath;
  await atomicWriteFile(lookupPath, JSON.stringify(lookup, null, 2));
}

export async function readArchive(archivePath: string): Promise<GenericArchiveEntry | null> {
  try {
    const content = await readFile(archivePath);
    const parsed = JSON.parse(content.toString("utf8"));
    if (typeof parsed?.originalText !== "string") return null;
    if (typeof parsed?.dataKey !== "string") return null;
    if (typeof parsed?.toolName !== "string") return null;
    if (parsed.schemaVersion >= 2 || parsed.artifactRef !== undefined || parsed.contentSha256 !== undefined) {
      const artifactRef = typeof parsed.artifactRef === "string" ? parsed.artifactRef : "";
      const digest = artifactDigest(artifactRef);
      const contentSha256 = typeof parsed.contentSha256 === "string" ? parsed.contentSha256 : "";
      if (!digest || contentSha256 !== digest || sha256Bytes(Buffer.from(parsed.originalText, "utf8")) !== digest) {
        return null;
      }
    }
    return parsed as GenericArchiveEntry;
  } catch {
    return null;
  }
}

async function readArchiveForArtifactRef(
  archivePath: string,
  artifactRef: string,
): Promise<GenericArchiveEntry | null> {
  const digest = artifactDigest(artifactRef);
  if (!digest) return null;
  const archive = await readArchive(archivePath);
  if (!archive || archive.artifactRef !== artifactRef) return null;
  return sha256Bytes(Buffer.from(archive.originalText, "utf8")) === digest ? archive : null;
}

export async function resolveArchivePathAcrossSessionsByArtifactRef(
  artifactRef: string,
  stateDir: string,
): Promise<string | null> {
  if (!artifactDigest(artifactRef)) return null;
  const sessionRootCandidates = pluginStateSubdirCandidates(stateDir, "tool-result-archives");
  for (const sessionRoot of sessionRootCandidates) {
    try {
      const sessions = await readdir(sessionRoot, { withFileTypes: true });
      for (const session of sessions) {
        if (!session.isDirectory()) continue;
        const archiveDir = join(sessionRoot, session.name);
        const entries = await readdir(archiveDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === "key-lookup.json") continue;
          const archivePath = join(archiveDir, entry.name);
          if (await readArchiveForArtifactRef(archivePath, artifactRef)) return archivePath;
        }
      }
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

export async function resolveArchivePathFromLookup(
  dataKey: string,
  stateDir: string,
  sessionId: string,
): Promise<string | null> {
  const candidates = defaultArchiveLookupDirs(sessionId, stateDir);
  if (sessionId !== "proxy-session") {
    candidates.push(...defaultArchiveLookupDirs("proxy-session", stateDir));
  }
  for (const archiveDir of candidates) {
    const keyPath = join(archiveDir, "keys", `${hashText(dataKey)}.json`);
    try {
      const raw = await readFile(keyPath, "utf8");
      const parsed = JSON.parse(raw) as { dataKey?: string; archivePath?: string };
      if (parsed?.dataKey === dataKey && typeof parsed.archivePath === "string" && parsed.archivePath) {
        return parsed.archivePath;
      }
    } catch {
      // Try next lookup strategy.
    }

    const lookupPath = join(archiveDir, "key-lookup.json");
    try {
      const raw = await readFile(lookupPath, "utf8");
      const lookup = JSON.parse(raw) as Record<string, string>;
      const found = lookup[dataKey];
      if (found) return found;
    } catch {
      // Try next lookup strategy.
    }

    try {
      const entries = await readdir(archiveDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === "key-lookup.json") {
          continue;
        }
        const archivePath = join(archiveDir, entry.name);
        const archive = await readArchive(archivePath);
        if (archive?.dataKey === dataKey) {
          await updateArchiveLookup(dataKey, archivePath, archiveDir);
          return archivePath;
        }
      }
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

export async function resolveArchivePathAcrossSessions(
  dataKey: string,
  stateDir: string,
): Promise<string | null> {
  const sessionRootCandidates = pluginStateSubdirCandidates(stateDir, "tool-result-archives");
  for (const sessionRoot of sessionRootCandidates) {
    try {
      const entries = await readdir(sessionRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const found = await resolveArchivePathFromLookup(dataKey, stateDir, entry.name);
        if (found) return found;
      }
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

export function resolveRecoveryStateDir(stateDir?: string): string {
  return stateDir ?? defaultPluginStateDir();
}

export * from "./tool-result-persist.js";
