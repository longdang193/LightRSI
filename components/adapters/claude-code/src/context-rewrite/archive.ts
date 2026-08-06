import { createHash } from "node:crypto";
import { join } from "node:path";
import { archiveContent, readArchive } from "@lightmem2/artifact-store";

const CLAUDE_ARCHIVE_SCHEMA_VERSION = 1 as const;

export type ClaudeArchiveResult = {
  archiveRef: string;
  dataKey: string;
  archivePath: string;
  contentDigest: string;
  originalChars: number;
};

function contentDigestOf(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function archiveDirFor(stateDir: string): string {
  return join(stateDir, "claude-context", "archive");
}

/**
 * Archive a single tool_result's original content before it is replaced by a
 * pointer stub. Returns an opaque ref (archive://claude/<digest>) plus the
 * dataKey the agent uses with memory_fault_recover. Reuses the shared
 * @lightmem2/artifact-store; never invents its own file format.
 *
 * Throws on failure — callers MUST treat a throw as "do not evict this item"
 * (bypass), because a stub without a successful archive would delete context
 * with no way to recover it.
 */
export async function archiveClaudeToolResult(params: {
  stateDir: string;
  sessionId: string;
  stableItemId: string;
  toolUseId: string;
  toolName?: string;
  originalText: string;
  taskIds?: string[];
}): Promise<ClaudeArchiveResult> {
  const digest = contentDigestOf(params.originalText);
  const dataKey = `claude_tool_result:${digest}`;
  const location = await archiveContent({
    sessionId: params.sessionId,
    segmentId: params.stableItemId,
    sourcePass: "claude_request_overlay",
    toolName: params.toolName ?? "tool",
    dataKey,
    originalText: params.originalText,
    archiveDir: archiveDirFor(params.stateDir),
    metadata: {
      schemaVersion: CLAUDE_ARCHIVE_SCHEMA_VERSION,
      sessionId: params.sessionId,
      taskIds: params.taskIds ?? [],
      stableItemId: params.stableItemId,
      toolUseId: params.toolUseId,
      contentDigest: digest,
      originalChars: params.originalText.length,
      createdAt: new Date().toISOString(),
    },
  });
  return {
    archiveRef: `archive://claude/${digest}`,
    dataKey,
    archivePath: location.archivePath,
    contentDigest: digest,
    originalChars: params.originalText.length,
  };
}

/**
 * Recover an archived tool_result's original content by its dataKey. Returns
 * undefined when the archive is missing (fail-open for the caller to decide).
 */
export async function recoverClaudeToolResult(
  archivePath: string,
): Promise<string | undefined> {
  const entry = await readArchive(archivePath);
  return entry?.originalText;
}
