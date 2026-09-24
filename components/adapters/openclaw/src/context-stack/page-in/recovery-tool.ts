/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  buildRecoveryContextSafePatch,
  MEMORY_FAULT_RECOVER_TOOL_NAME,
  readArchive,
  renderRecoveredArchive,
  resolveArchiveAcrossSessionsByArtifactRef,
  resolveArchivePathFromLookup,
  resolveRecoveryStateDir,
} from "@lightrsi/artifact-store";

export function registerMemoryFaultRecoverTool(
  api: any,
  cfg: { stateDir: string },
  logger: { warn: (message: string) => void },
  resolveWorkspaceHintForSessionId?: (sessionId: string) => string | undefined,
): void {
  if (typeof api.registerTool !== "function") {
    logger.warn("[plugin-runtime] registerTool unavailable in this OpenClaw version.");
    return;
  }

  api.registerTool((toolCtx: any) => ({
    label: "Memory Fault Recover",
    name: MEMORY_FAULT_RECOVER_TOOL_NAME,
    description:
      "Recover archived content that was trimmed from a prior tool result. Use exactly one artifactRef or dataKey instead of re-running the original tool.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        artifactRef: {
          type: "string",
          description: "Opaque archive artifact reference from a prior recovery notice.",
        },
        dataKey: {
          type: "string",
          description: "Archive dataKey from a prior [Tool payload trimmed] notice.",
        },
        mode: {
          type: "string",
          enum: ["range", "stats", "search"],
          description: "Optional recovery rendering mode.",
        },
        startLine: {
          type: "integer",
          minimum: 1,
          description: "Optional 1-based start line for partial recovery.",
        },
        endLine: {
          type: "integer",
          minimum: 1,
          description: "Optional 1-based end line for partial recovery.",
        },
        query: {
          type: "string",
          description: "Literal search query when mode is search.",
        },
        contextLines: {
          type: "integer",
          minimum: 0,
          description: "Optional number of surrounding lines for search matches.",
        },
        maxMatches: {
          type: "integer",
          minimum: 1,
          description: "Optional maximum number of search matches to return.",
        },
        maxOutputChars: {
          type: "integer",
          minimum: 1,
          description: "Optional maximum rendered output size.",
        },
        maxScanLines: {
          type: "integer",
          minimum: 1,
          description: "Optional maximum number of archive lines to scan in search mode.",
        },
      },
      oneOf: [{ required: ["artifactRef"] }, { required: ["dataKey"] }],
    },
    execute: async (_toolCallId: string, args: Record<string, unknown>) => {
      const artifactRef = typeof args?.artifactRef === "string" ? args.artifactRef.trim() : "";
      const dataKey = typeof args?.dataKey === "string" ? args.dataKey.trim() : "";
      if ((artifactRef.length > 0) === (dataKey.length > 0)) {
        return {
          content: [{ type: "text", text: "Provide exactly one of artifactRef or dataKey" }],
          details: { error: "invalid_recovery_reference" },
        };
      }
      const stateDir = resolveRecoveryStateDir(cfg.stateDir);
      const sessionId =
        typeof toolCtx?.sessionId === "string" && toolCtx.sessionId.trim().length > 0
          ? toolCtx.sessionId.trim()
          : "proxy-session";
      const resolvedByArtifact = artifactRef
        ? await resolveArchiveAcrossSessionsByArtifactRef(
            artifactRef,
            stateDir,
            resolveWorkspaceHintForSessionId?.(sessionId),
          )
        : null;
      const archivePath = resolvedByArtifact?.archivePath ?? (dataKey
        ? (await resolveArchivePathFromLookup(dataKey, stateDir, sessionId))
          ?? (await resolveArchivePathFromLookup(dataKey, stateDir, "proxy-session"))
        : null);
      const archive = resolvedByArtifact?.archive ?? (archivePath ? await readArchive(archivePath) : null);
      if (!archive) {
        return {
          content: [{ type: "text", text: "No archived content found" }],
          details: {
            error: "archive_not_found",
            ...(artifactRef ? { artifactRef } : { dataKey }),
            archivePath: archivePath ?? "",
          },
        };
      }
      const rendered = renderRecoveredArchive({
        ...(dataKey ? { dataKey } : {}),
        ...(artifactRef ? { artifactRef } : {}),
        archive,
        mode: args?.mode === "range" || args?.mode === "stats" || args?.mode === "search"
          ? args.mode
          : undefined,
        startLine: typeof args?.startLine === "number" ? args.startLine : undefined,
        endLine: typeof args?.endLine === "number" ? args.endLine : undefined,
        query: typeof args?.query === "string" ? args.query : undefined,
        contextLines: typeof args?.contextLines === "number" ? args.contextLines : undefined,
        maxMatches: typeof args?.maxMatches === "number" ? args.maxMatches : undefined,
        maxOutputChars: typeof args?.maxOutputChars === "number" ? args.maxOutputChars : undefined,
        maxScanLines: typeof args?.maxScanLines === "number" ? args.maxScanLines : undefined,
      });

      return {
        content: [{ type: "text", text: rendered.text }],
        details: {
          ...(artifactRef ? { artifactRef } : { dataKey }),
          archivePath,
          ...rendered.details,
          contextSafe: {
            ...buildRecoveryContextSafePatch(MEMORY_FAULT_RECOVER_TOOL_NAME),
          },
        },
      };
    },
  }), { name: MEMORY_FAULT_RECOVER_TOOL_NAME });
}
