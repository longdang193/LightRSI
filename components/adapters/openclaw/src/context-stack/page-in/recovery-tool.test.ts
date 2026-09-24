import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  archiveContent,
} from "@lightrsi/artifact-store";
import { registerMemoryFaultRecoverTool } from "./recovery-tool.js";

test("OpenClaw recovery accepts exact and legacy references", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-openclaw-recovery-"));
  try {
    const location = await archiveContent({
      sessionId: "openclaw-session",
      segmentId: "segment-1",
      sourcePass: "test",
      toolName: "read",
      dataKey: "legacy-key",
      originalText: "line one\nline two",
      archiveDir: join(stateDir, "tokenpilot", "tool-result-archives", "openclaw-session"),
    });

    let tool: any;
    registerMemoryFaultRecoverTool({
      registerTool(factory: (ctx: any) => any) {
        tool = factory({ sessionId: "openclaw-session" });
      },
    }, { stateDir }, { warn() {} });

    const exact = await tool.execute("call-1", { artifactRef: location.artifactRef });
    assert.match(exact.content[0].text, /line two/);
    assert.equal(exact.details.artifactRef, location.artifactRef);

    const legacy = await tool.execute("call-2", { dataKey: "legacy-key" });
    assert.match(legacy.content[0].text, /line one/);
    assert.equal(legacy.details.dataKey, "legacy-key");

    const invalid = await tool.execute("call-3", {
      artifactRef: location.artifactRef,
      dataKey: "legacy-key",
    });
    assert.equal(invalid.details.error, "invalid_recovery_reference");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("OpenClaw exact recovery resolves workspace archives from trusted session hints", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-openclaw-workspace-recovery-"));
  const workspaceDir = join(stateDir, "workspace");
  try {
    const location = await archiveContent({
      sessionId: "openclaw-session",
      segmentId: "segment-1",
      sourcePass: "test",
      toolName: "read",
      dataKey: "workspace-key",
      originalText: "workspace archive body",
      workspaceDir,
    });
    let tool: any;
    registerMemoryFaultRecoverTool({
      registerTool(factory: (ctx: any) => any) {
        tool = factory({ sessionId: "openclaw-session" });
      },
    }, { stateDir }, { warn() {} }, (sessionId) => sessionId === "openclaw-session" ? workspaceDir : undefined);
    const recovered = await tool.execute("call-1", { artifactRef: location.artifactRef });
    assert.match(recovered.content[0].text, /workspace archive body/);
    assert.equal(recovered.details.archivePath, location.archivePath);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("OpenClaw registered recovery forwards bounded search continuation", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-openclaw-search-recovery-"));
  try {
    const location = await archiveContent({
      sessionId: "openclaw-search-session",
      segmentId: "segment-1",
      sourcePass: "test",
      toolName: "read",
      dataKey: "search-key",
      originalText: "needle one\nneedle two\nnoise\nneedle three",
      archiveDir: join(stateDir, "tokenpilot", "tool-result-archives", "openclaw-search-session"),
    });

    let tool: any;
    registerMemoryFaultRecoverTool({
      registerTool(factory: (ctx: any) => any) {
        tool = factory({ sessionId: "openclaw-search-session" });
      },
    }, { stateDir }, { warn() {} });

    const first = await tool.execute("call-1", {
      artifactRef: location.artifactRef,
      mode: "search",
      query: "needle",
      contextLines: 0,
      maxMatches: 1,
      maxScanLines: 3,
      maxOutputChars: 1_000,
    });
    assert.deepEqual(first.details.matches?.map((match: { line: number }) => match.line), [1]);
    assert.equal(first.details.nextStartLine, 2);
    assert.equal(first.details.scanComplete, false);

    const second = await tool.execute("call-2", {
      artifactRef: location.artifactRef,
      mode: "search",
      query: "needle",
      contextLines: 0,
      maxMatches: 2,
      startLine: first.details.nextStartLine,
      maxOutputChars: 1_000,
    });
    assert.deepEqual(second.details.matches?.map((match: { line: number }) => match.line), [2, 4]);
    assert.equal(second.details.resultsComplete, true);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
