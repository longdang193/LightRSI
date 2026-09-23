import test from "node:test";
import assert from "node:assert/strict";

import { mkdtemp, rm } from "node:fs/promises";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_HOST_NEUTRAL_STATE_ROOT,
  PLUGIN_NAMESPACE_DIR,
  PLUGIN_STATE_DIRNAME,
  WORKSPACE_ARCHIVE_DIRNAME,
  buildRecoveryHint,
  createFileSystemArtifactStore,
  resolveArchiveAcrossSessionsByArtifactRef,
  archiveContent,
  pluginStateSubdir,
  planToolResultPersistence,
  renderRecoveredArchive,
  workspaceArchiveDir,
} from "../src/index.js";

test("artifact store preserves canonical state path names", () => {
  assert.equal(DEFAULT_HOST_NEUTRAL_STATE_ROOT, ".tokenpilot");
  assert.equal(PLUGIN_STATE_DIRNAME, "tokenpilot-plugin-state");
  assert.equal(PLUGIN_NAMESPACE_DIR, "tokenpilot");
  assert.equal(WORKSPACE_ARCHIVE_DIRNAME, ".tokenpilot-archives");
  assert.equal(
    pluginStateSubdir("/tmp/tokenpilot-state", "module-observability", "events"),
    join("/tmp/tokenpilot-state", "tokenpilot", "module-observability", "events"),
  );
  assert.equal(
    workspaceArchiveDir("/tmp/workspace"),
    join("/tmp/workspace", ".tokenpilot-archives"),
  );
});

test("buildRecoveryHint advertises focused line-window recovery", () => {
  const hint = buildRecoveryHint({
    dataKey: "repo:file.ts",
    originalSize: 4096,
    archivePath: "/tmp/archive.json",
    sourceLabel: "tool_payload_trim",
    enabled: true,
  });

  assert.match(hint, /memory_fault_recover/);
  assert.match(hint, /"startLine":20,"endLine":80/);
  assert.match(hint, /internal recovery read; do not call the original tool again/i);
});

test("buildRecoveryHint prefers exact artifact references when available", () => {
  const hint = buildRecoveryHint({
    dataKey: "legacy:key",
    artifactRef: `artifact:v2:${"a".repeat(64)}`,
    originalSize: 4096,
    archivePath: "/tmp/archive.json",
    sourceLabel: "tool_payload_trim",
    enabled: true,
  });

  assert.match(hint, /"artifactRef":"artifact:v2:/);
  assert.doesNotMatch(hint, /"dataKey":"legacy:key"/);
});

test("renderRecoveredArchive returns focused line-window content with recovery metadata", () => {
  const archive = {
    schemaVersion: 1,
    kind: "tool_payload_trim_archive",
    sessionId: "sess-1",
    segmentId: "seg-1",
    sourcePass: "tool_payload_trim",
    toolName: "read",
    dataKey: "repo:file.ts",
    originalText: [
      "1: line one",
      "2: line two",
      "3: line three",
      "4: line four",
      "5: line five",
    ].join("\n"),
    originalSize: 55,
    archivedAt: "2026-07-03T00:00:00.000Z",
  };

  const result = renderRecoveredArchive({
    dataKey: "repo:file.ts",
    archive,
    startLine: 2,
    endLine: 4,
  });

  assert.match(result.text, /^\[Memory Fault Recovery\]/);
  assert.match(result.text, /Recovered lines: 2-4/);
  assert.doesNotMatch(result.text, /1: line one/);
  assert.match(result.text, /2: line two/);
  assert.match(result.text, /4: line four/);
  assert.equal(result.details.recovered, true);
  assert.equal(result.details.recoveredStartLine, 2);
  assert.equal(result.details.recoveredEndLine, 4);
  assert.equal(result.details.recoveredLineCount, 3);
});

test("renderRecoveredArchive supports bounded stats and literal search", () => {
  const archive = {
    schemaVersion: 2,
    kind: "tool_payload_trim_archive",
    sessionId: "sess-1",
    segmentId: "seg-1",
    sourcePass: "tool_payload_trim",
    toolName: "read",
    dataKey: "repo:file.ts",
    artifactRef: `artifact:v2:${"b".repeat(64)}`,
    originalText: "alpha\nneedle one\ngamma\nneedle two\nomega",
    originalSize: 42,
    archivedAt: "2026-07-03T00:00:00.000Z",
    metadata: { readWindow: { offset: 10, limit: 5 } },
  };

  const stats = renderRecoveredArchive({ artifactRef: archive.artifactRef, archive, mode: "stats" });
  assert.match(stats.text, /Line count: 5/);
  assert.doesNotMatch(stats.text, /needle one/);
  assert.equal(stats.details.lineBasis, "archive-relative");

  const range = renderRecoveredArchive({
    artifactRef: archive.artifactRef,
    archive,
    startLine: 2,
    endLine: 2,
  });
  assert.equal(range.details.recoveredStartLine, 2);
  assert.equal(range.details.recoveredEndLine, 2);
  assert.equal(range.details.sourceStartLine, 12);
  assert.equal(range.details.sourceEndLine, 12);

  const search = renderRecoveredArchive({
    artifactRef: archive.artifactRef,
    archive,
    mode: "search",
    query: "needle",
    contextLines: 0,
    maxMatches: 1,
  });
  assert.match(search.text, /Matches: 2; returned: 1; omitted: 1/);
  assert.match(search.text, /2: needle one/);
  assert.equal(search.details.omittedMatches, 1);
  assert.equal(search.details.scanComplete, true);
  assert.equal(search.details.resultsComplete, false);
  assert.equal(search.details.nextStartLine, 4);
});

test("search resumes from archive-relative startLine without skipping matches", () => {
  const archive = {
    schemaVersion: 2,
    kind: "tool_payload_trim_archive",
    sessionId: "sess-1",
    segmentId: "seg-1",
    sourcePass: "tool_payload_trim",
    toolName: "read",
    dataKey: "repo:file.ts",
    originalText: "needle one\nnoise\nneedle two\nneedle three",
    originalSize: 40,
    archivedAt: "2026-07-03T00:00:00.000Z",
  };
  const first = renderRecoveredArchive({ archive, mode: "search", query: "needle", contextLines: 0, maxMatches: 1 });
  assert.deepEqual(first.details.matches?.map((match) => match.line), [1]);
  assert.equal(first.details.scanComplete, true);
  assert.equal(first.details.resultsComplete, false);
  assert.equal(first.details.nextStartLine, 3);
  const second = renderRecoveredArchive({ archive, mode: "search", query: "needle", contextLines: 0, maxMatches: 1, startLine: first.details.nextStartLine });
  assert.deepEqual(second.details.matches?.map((match) => match.line), [3]);
  assert.equal(second.details.nextStartLine, 4);
  assert.equal(second.details.scanComplete, true);
  assert.equal(second.details.resultsComplete, false);
  const last = renderRecoveredArchive({ archive, mode: "search", query: "needle", contextLines: 0, maxMatches: 1, startLine: second.details.nextStartLine });
  assert.deepEqual(last.details.matches?.map((match) => match.line), [4]);
  assert.equal(last.details.scanComplete, true);
  assert.equal(last.details.resultsComplete, true);
});

test("exact artifact recovery repairs only artifact lookup and preserves latest dataKey lookup", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tokenpilot-artifact-ref-"));
  const archiveDir = join(stateDir, "tokenpilot", "tool-result-archives", "session-1");

  try {
    const first = await archiveContent({
      sessionId: "session-1",
      segmentId: "first",
      sourcePass: "test",
      toolName: "read",
      dataKey: "same-key",
      originalText: "first version",
      archiveDir,
    });
    const second = await archiveContent({
      sessionId: "session-1",
      segmentId: "second",
      sourcePass: "test",
      toolName: "read",
      dataKey: "same-key",
      originalText: "second version",
      archiveDir,
    });

    const digest = first.artifactRef!.slice("artifact:v2:".length);
    await rm(join(stateDir, "tokenpilot", "tool-result-archives", "artifact-lookups", digest.slice(0, 2), `${digest}.json`), { force: true });
    await writeFile(join(archiveDir, "artifact-lookup.json"), "{}", "utf8");
    const resolved = await resolveArchiveAcrossSessionsByArtifactRef(first.artifactRef!, stateDir);
    assert.equal(resolved?.archivePath, first.archivePath);
    assert.ok(await readFile(join(stateDir, "tokenpilot", "tool-result-archives", "artifact-lookups", digest.slice(0, 2), `${digest}.json`), "utf8"));
    assert.equal((await createFileSystemArtifactStore().resolve({
      dataKey: "same-key",
      stateDir,
      sessionId: "session-1",
    })), second.archivePath);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("artifact recovery writes a digest-scoped lookup that resolves without the legacy index", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tokenpilot-artifact-shard-"));
  const archiveDir = join(stateDir, "tokenpilot", "tool-result-archives", "session-1");

  try {
    const archive = await archiveContent({
      sessionId: "session-1",
      segmentId: "segment-1",
      sourcePass: "test",
      toolName: "read",
      dataKey: "repo:file.ts",
      originalText: "exact recovery content",
      archiveDir,
    });
    const digest = archive.artifactRef!.slice("artifact:v2:".length);
    const lookupPath = join(stateDir, "tokenpilot", "tool-result-archives", "artifact-lookups", digest.slice(0, 2), `${digest}.json`);
    const lookup = JSON.parse(await readFile(lookupPath, "utf8")) as string[];

    assert.deepEqual(lookup, [archive.archivePath]);
    await writeFile(join(archiveDir, "artifact-lookup.json"), "{}", "utf8");
    const resolved = await resolveArchiveAcrossSessionsByArtifactRef(archive.artifactRef!, stateDir);
    assert.equal(resolved?.archivePath, archive.archivePath);
    assert.equal(resolved?.archive.originalText, "exact recovery content");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("workspace archive exact recovery uses caller-supplied trusted workspace root", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tokenpilot-workspace-artifact-"));
  const workspaceDir = join(stateDir, "workspace");
  try {
    const archive = await archiveContent({
      sessionId: "session-1",
      segmentId: "segment-1",
      sourcePass: "test",
      toolName: "read",
      dataKey: "repo:file.ts",
      originalText: "workspace exact recovery",
      workspaceDir,
    });
    assert.equal(await resolveArchiveAcrossSessionsByArtifactRef(archive.artifactRef!, stateDir), null);
    const resolved = await resolveArchiveAcrossSessionsByArtifactRef(archive.artifactRef!, stateDir, workspaceDir);
    assert.equal(resolved?.archivePath, archive.archivePath);
    assert.equal(resolved?.archive.originalText, "workspace exact recovery");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("workspace archive exact recovery scans and repairs missing or stale indexes", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tokenpilot-workspace-fallback-"));
  const workspaceDir = join(stateDir, "workspace");
  try {
    const archive = await archiveContent({
      sessionId: "session-1",
      segmentId: "segment-1",
      sourcePass: "test",
      toolName: "read",
      dataKey: "repo:file.ts",
      originalText: "workspace fallback content",
      workspaceDir,
    });
    const digest = archive.artifactRef!.slice("artifact:v2:".length);
    const lookupPath = join(workspaceDir, "artifact-lookups", digest.slice(0, 2), `${digest}.json`);
    await writeFile(lookupPath, JSON.stringify([join(workspaceDir, ".tokenpilot-archives", "missing.json")]), "utf8");
    const resolved = await resolveArchiveAcrossSessionsByArtifactRef(archive.artifactRef!, stateDir, workspaceDir);
    assert.equal(resolved?.archivePath, archive.archivePath);
    assert.deepEqual(JSON.parse(await readFile(lookupPath, "utf8")), [archive.archivePath]);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("workspace archive exact recovery rejects a corrupted fallback candidate", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tokenpilot-workspace-corrupt-"));
  const workspaceDir = join(stateDir, "workspace");
  try {
    const archive = await archiveContent({
      sessionId: "session-1",
      segmentId: "segment-1",
      sourcePass: "test",
      toolName: "read",
      dataKey: "repo:file.ts",
      originalText: "workspace corrupted content",
      workspaceDir,
    });
    const digest = archive.artifactRef!.slice("artifact:v2:".length);
    await rm(join(workspaceDir, "artifact-lookups", digest.slice(0, 2), `${digest}.json`), { force: true });
    const raw = await readFile(archive.archivePath, "utf8");
    await writeFile(archive.archivePath, raw.replace("workspace corrupted content", "tampered"), "utf8");
    assert.equal(await resolveArchiveAcrossSessionsByArtifactRef(archive.artifactRef!, stateDir, workspaceDir), null);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("search stays bounded for repeated matches and oversized lines", () => {
  const oversizedLine = `needle ${"x".repeat(400)}`;
  const archive = {
    schemaVersion: 2,
    kind: "tool_payload_trim_archive",
    sessionId: "sess-1",
    segmentId: "seg-1",
    sourcePass: "tool_payload_trim",
    toolName: "read",
    dataKey: "repo:file.ts",
    originalText: `${oversizedLine}\nneedle two\nneedle three`,
    originalSize: 430,
    archivedAt: "2026-07-03T00:00:00.000Z",
  };
  const result = renderRecoveredArchive({
    archive,
    mode: "search",
    query: "needle",
    contextLines: 1,
    maxMatches: 3,
    maxOutputChars: 320,
  });
  assert.ok(result.text.length <= 320);
  assert.equal(result.details.scanComplete, true);
  assert.equal(result.details.resultsComplete, true);
  assert.equal(result.details.truncated, true);
  assert.match(result.text, /line 1 omitted|archive-relative line recovery/i);
});

test("synchronous tool-result persistence writes digest-scoped artifact lookups", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tokenpilot-artifact-sync-shard-"));

  try {
    const persisted = planToolResultPersistence({
      event: { toolName: "read", toolCallId: "call-1", sessionId: "session-1" },
      text: "x".repeat(12_001),
      stateDir,
      safeId: (value) => value,
    });
    assert.equal(persisted.resultMode, "artifact");
    const digest = persisted.artifactRef!.slice("artifact:v2:".length);
    const lookupPath = join(
      stateDir,
      "tokenpilot",
      "artifacts",
      "artifact-lookups",
      digest.slice(0, 2),
      `${digest}.json`,
    );
    const lookup = JSON.parse(await readFile(lookupPath, "utf8")) as string[];
    assert.deepEqual(lookup, [persisted.outputFile]);
    const recovered = await resolveArchiveAcrossSessionsByArtifactRef(persisted.artifactRef!, stateDir);
    assert.equal(recovered?.archivePath, persisted.outputFile);
    assert.equal(recovered?.archive.originalText, "x".repeat(12_001));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("file system artifact store preserves archive and lookup behavior", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tokenpilot-artifact-store-"));
  const archiveDir = join(stateDir, "tokenpilot", "tool-result-archives", "session-1");
  const store = createFileSystemArtifactStore();

  try {
    const location = await store.archive({
      sessionId: "session-1",
      segmentId: "segment-1",
      sourcePass: "test",
      toolName: "read",
      dataKey: "repo:file.ts",
      originalText: "const value = 1;",
      archiveDir,
    });

    assert.match(location.artifactRef ?? "", /^artifact:v2:[a-f0-9]{64}$/);
    assert.equal(await store.resolve({ dataKey: "repo:file.ts", stateDir, sessionId: "session-1" }), location.archivePath);
    assert.equal((await store.read(location.archivePath))?.originalText, "const value = 1;");

    const artifactRef = location.artifactRef;
    assert.ok(artifactRef);
    const raw = await readFile(location.archivePath, "utf8");
    await writeFile(location.archivePath, raw.replace("const value = 1;", "const value = 2;"), "utf8");
    assert.equal((await store.read(location.archivePath)), null);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
