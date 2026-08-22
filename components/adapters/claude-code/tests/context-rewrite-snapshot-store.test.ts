import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildClaudeContextSnapshot } from "../src/context-rewrite/snapshot.js";
import {
  saveLatestClaudeSnapshot,
  readLatestClaudeSnapshot,
  readLatestClaudeSnapshotRecord,
  readClaudeItemFingerprints,
} from "../src/context-rewrite/snapshot-store.js";

const SESSION = "sess-snap";

async function tempStateDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "lightrsi-snap-store-"));
}

function sampleSnapshot(revision: string, sessionId = SESSION) {
  return buildClaudeContextSnapshot({
    sessionId,
    revision,
    messages: [
      { role: "user", content: "read the file" },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "call-1", content: "body" }],
      },
    ] as any,
  });
}

async function hashedSessionDirectory(stateDir: string): Promise<string> {
  const sessionsRoot = join(stateDir, "claude-context", "sessions");
  const entries = (await readdir(sessionsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^session-[a-f0-9]{64}$/.test(entry.name));
  assert.equal(entries.length, 1);
  assert.match(entries[0]!.name, /^session-[a-f0-9]{64}$/);
  return join(sessionsRoot, entries[0]!.name);
}

test("readLatestClaudeSnapshot returns undefined when nothing is stored", async () => {
  const stateDir = await tempStateDir();
  assert.equal(await readLatestClaudeSnapshot(stateDir, SESSION), undefined);
});

test("saveLatestClaudeSnapshot persists a snapshot that reads back identically", async () => {
  const stateDir = await tempStateDir();
  const snap = sampleSnapshot("rev-1");
  assert.deepEqual(
    await saveLatestClaudeSnapshot(stateDir, SESSION, snap, { model: "claude-sonnet-4-6" }),
    { saved: true },
  );
  const readBack = await readLatestClaudeSnapshot(stateDir, SESSION);
  assert.ok(readBack);
  assert.equal(readBack!.revision, "rev-1");
  assert.equal(readBack!.items.length, snap.items.length);
  const record = await readLatestClaudeSnapshotRecord(stateDir, SESSION);
  assert.equal(record?.model, "claude-sonnet-4-6");
  assert.match(record?.storedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
});

test("snapshot survives a fresh read (persistence across restart)", async () => {
  const stateDir = await tempStateDir();
  await saveLatestClaudeSnapshot(stateDir, SESSION, sampleSnapshot("rev-restart"));
  // a brand-new read call simulates a restarted process
  const readBack = await readLatestClaudeSnapshot(stateDir, SESSION);
  assert.equal(readBack!.revision, "rev-restart");
});

test("only the latest snapshot is kept, not accumulated", async () => {
  const stateDir = await tempStateDir();
  await saveLatestClaudeSnapshot(stateDir, SESSION, sampleSnapshot("rev-1"));
  await saveLatestClaudeSnapshot(stateDir, SESSION, sampleSnapshot("rev-2"));
  const readBack = await readLatestClaudeSnapshot(stateDir, SESSION);
  assert.equal(readBack!.revision, "rev-2");
});

test("item fingerprints are persisted alongside the snapshot", async () => {
  const stateDir = await tempStateDir();
  const snap = sampleSnapshot("rev-1");
  await saveLatestClaudeSnapshot(stateDir, SESSION, snap);
  const fingerprints = await readClaudeItemFingerprints(stateDir, SESSION);
  for (const item of snap.items) {
    assert.equal(fingerprints[item.stableId], item.fingerprint);
  }
});

test("snapshot session paths use stable hashes and cannot escape stateDir", async () => {
  const root = await tempStateDir();
  const hostileIds = [
    "../../escape",
    "..\\..\\escape",
    "..",
    join(root, "absolute-target"),
  ];

  for (const [index, sessionId] of hostileIds.entries()) {
    const stateDir = join(root, `state-${index}`);
    const result = await saveLatestClaudeSnapshot(
      stateDir,
      sessionId,
      sampleSnapshot(`rev-hostile-${index}`, sessionId),
    );
    assert.deepEqual(result, { saved: true });
    assert.equal(
      (await readLatestClaudeSnapshot(stateDir, sessionId))?.revision,
      `rev-hostile-${index}`,
    );
    await hashedSessionDirectory(stateDir);
  }

  assert.equal(await readLatestClaudeSnapshot(root, "../../escape"), undefined);
  assert.deepEqual(await readClaudeItemFingerprints(root, "../../escape"), {});
  assert.deepEqual(
    (await readdir(root)).sort(),
    hostileIds.map((_, index) => `state-${index}`),
  );
});

test("safe legacy snapshot directories remain read-only compatible", async () => {
  const stateDir = await tempStateDir();
  const snapshot = sampleSnapshot("rev-legacy");
  const legacyDirectory = join(stateDir, "claude-context", "sessions", SESSION);
  const storedAt = "2026-08-20T00:00:00.000Z";
  await mkdir(legacyDirectory, { recursive: true });
  await writeFile(join(legacyDirectory, "latest-snapshot.json"), JSON.stringify({
    schemaVersion: 1,
    storedAt,
    snapshot,
  }), "utf8");
  await writeFile(join(legacyDirectory, "item-fingerprints.json"), JSON.stringify({
    schemaVersion: 1,
    storedAt,
    revision: snapshot.revision,
    fingerprints: Object.fromEntries(snapshot.items.map((item) => [item.stableId, item.fingerprint])),
  }), "utf8");

  assert.equal((await readLatestClaudeSnapshot(stateDir, SESSION))?.revision, "rev-legacy");
  assert.equal(
    (await readClaudeItemFingerprints(stateDir, SESSION))[snapshot.items[0]!.stableId],
    snapshot.items[0]!.fingerprint,
  );
  assert.equal(await readLatestClaudeSnapshot(stateDir, `alias/../${SESSION}`), undefined);

  assert.deepEqual(
    await saveLatestClaudeSnapshot(stateDir, SESSION, sampleSnapshot("rev-new")),
    { saved: true },
  );
  assert.equal((await readLatestClaudeSnapshot(stateDir, SESSION))?.revision, "rev-new");
  assert.deepEqual(
    (await readdir(join(stateDir, "claude-context", "sessions"))).sort(),
    [SESSION, (await hashedSessionDirectory(stateDir)).split(/[\\/]/).at(-1)!].sort(),
  );
  assert.equal(
    JSON.parse(await readFile(join(legacyDirectory, "latest-snapshot.json"), "utf8")).snapshot.revision,
    "rev-legacy",
  );
});

test("invalid snapshots are rejected on save with an explicit result", async () => {
  const stateDir = await tempStateDir();
  const cases: Array<[string, (candidate: any) => void]> = [
    ["schema", (candidate) => { candidate.schemaVersion = 999; }],
    ["host", (candidate) => { candidate.hostId = "codex"; }],
    ["session", (candidate) => { candidate.sessionId = "other-session"; }],
    ["revision", (candidate) => { candidate.revision = " "; }],
    ["duplicate stable id", (candidate) => { candidate.items[1].stableId = candidate.items[0].stableId; }],
    ["stable id", (candidate) => { candidate.items[0].stableId = ""; }],
    ["fingerprint", (candidate) => { candidate.items[0].fingerprint = 42; }],
    ["chars", (candidate) => { candidate.items[0].chars = -1; }],
    ["kind", (candidate) => { candidate.items[0].kind = "host-payload"; }],
    ["role", (candidate) => { candidate.items[0].role = 42; }],
    ["call id", (candidate) => { candidate.items[0].callId = {}; }],
    ["response id", (candidate) => { candidate.items[0].responseId = []; }],
    ["task ids", (candidate) => { candidate.items[0].taskIds = ["task-1", 42]; }],
    ["adapter metadata", (candidate) => { candidate.adapterMetadata = { raw: "secret" }; }],
  ];

  for (const [label, mutate] of cases) {
    const candidate = structuredClone(sampleSnapshot(`rev-${label}`)) as any;
    mutate(candidate);
    assert.deepEqual(
      await saveLatestClaudeSnapshot(stateDir, SESSION, candidate),
      { saved: false, reason: "invalid_snapshot" },
      label,
    );
  }
  assert.equal(await readLatestClaudeSnapshot(stateDir, SESSION), undefined);
});

test("invalid persisted snapshot structures fail open", async () => {
  const stateDir = await tempStateDir();
  await saveLatestClaudeSnapshot(stateDir, SESSION, sampleSnapshot("rev-structure"));
  const directory = await hashedSessionDirectory(stateDir);
  const path = join(directory, "latest-snapshot.json");
  const baseline = JSON.parse(await readFile(path, "utf8")) as Record<string, any>;
  const cases: Array<[string, (candidate: Record<string, any>) => void]> = [
    ["wrong schema", (candidate) => { candidate.schemaVersion = 999; }],
    ["invalid timestamp", (candidate) => { candidate.storedAt = "not-a-date"; }],
    ["wrong host", (candidate) => { candidate.snapshot.hostId = "codex"; }],
    ["wrong session", (candidate) => { candidate.snapshot.sessionId = "other-session"; }],
    ["duplicate stable id", (candidate) => {
      candidate.snapshot.items[1].stableId = candidate.snapshot.items[0].stableId;
    }],
    ["adapter metadata", (candidate) => { candidate.snapshot.adapterMetadata = { raw: "secret" }; }],
    ["blank model", (candidate) => { candidate.model = " "; }],
  ];

  for (const [label, mutate] of cases) {
    const candidate = structuredClone(baseline);
    mutate(candidate);
    await writeFile(path, JSON.stringify(candidate), "utf8");
    assert.equal(await readLatestClaudeSnapshotRecord(stateDir, SESSION), undefined, label);
  }
});

test("fingerprint sidecar must match the complete stored snapshot", async () => {
  const stateDir = await tempStateDir();
  const snapshot = sampleSnapshot("rev-fingerprints");
  await saveLatestClaudeSnapshot(stateDir, SESSION, snapshot);
  const directory = await hashedSessionDirectory(stateDir);
  const path = join(directory, "item-fingerprints.json");
  const baseline = JSON.parse(await readFile(path, "utf8")) as Record<string, any>;
  const firstId = snapshot.items[0]!.stableId;
  const cases: Array<[string, (candidate: Record<string, any>) => void]> = [
    ["schema", (candidate) => { candidate.schemaVersion = 999; }],
    ["timestamp", (candidate) => { candidate.storedAt = "not-a-date"; }],
    ["revision", (candidate) => { candidate.revision = "different"; }],
    ["missing item", (candidate) => { delete candidate.fingerprints[firstId]; }],
    ["extra item", (candidate) => { candidate.fingerprints.extra = "digest"; }],
    ["wrong digest", (candidate) => { candidate.fingerprints[firstId] = "different"; }],
    ["invalid digest", (candidate) => { candidate.fingerprints[firstId] = 42; }],
  ];

  for (const [label, mutate] of cases) {
    const candidate = structuredClone(baseline);
    mutate(candidate);
    await writeFile(path, JSON.stringify(candidate), "utf8");
    assert.deepEqual(await readClaudeItemFingerprints(stateDir, SESSION), {}, label);
  }
});

test("snapshot write failures return an explicit fail-open result", async () => {
  const root = await tempStateDir();
  const stateDir = join(root, "not-a-directory");
  await writeFile(stateDir, "occupied", "utf8");
  assert.deepEqual(
    await saveLatestClaudeSnapshot(stateDir, SESSION, sampleSnapshot("rev-write-fail")),
    { saved: false, reason: "write_failed" },
  );
  assert.equal(await readLatestClaudeSnapshot(stateDir, SESSION), undefined);
});

test("corrupted snapshot file is treated as absent (fail-open)", async () => {
  const stateDir = await tempStateDir();
  await saveLatestClaudeSnapshot(stateDir, SESSION, sampleSnapshot("rev-before-corruption"));
  const directory = await hashedSessionDirectory(stateDir);
  await writeFile(
    join(directory, "latest-snapshot.json"),
    "{ not json",
    "utf8",
  );
  assert.equal(await readLatestClaudeSnapshot(stateDir, SESSION), undefined);
  // and a save after corruption still works
  assert.deepEqual(
    await saveLatestClaudeSnapshot(stateDir, SESSION, sampleSnapshot("rev-ok")),
    { saved: true },
  );
  assert.equal((await readLatestClaudeSnapshot(stateDir, SESSION))!.revision, "rev-ok");
});
