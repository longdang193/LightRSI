import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendRecentTurnBinding,
  appendJsonl,
  loadRecentTurnBindings,
  loadSessionSnapshot,
  readRecentJsonlEntries,
  resolveLatestSessionId,
  sessionSnapshotPath,
  writeJsonFileAtomic,
  writeSessionSnapshot,
} from "../src/index.js";

test("shared session store persists snapshots and latest bindings", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-host-session-store-"));
  try {
    await writeSessionSnapshot(stateDir, "shared-session-a", {
      sessionId: "shared-session-a",
      latestModel: "test-model",
      updatedAt: "2026-06-28T12:00:00.000Z",
    });
    await appendRecentTurnBinding(stateDir, {
      sessionId: "shared-session-a",
      responseId: "resp-1",
      updatedAt: "2026-06-28T12:01:00.000Z",
    });
    await appendRecentTurnBinding(stateDir, {
      sessionId: "shared-session-a",
      responseId: "resp-2",
      updatedAt: "2026-06-28T12:02:00.000Z",
    });

    const snapshot = await loadSessionSnapshot<{ sessionId: string; latestModel: string }>(stateDir, "shared-session-a");
    const bindings = await loadRecentTurnBindings<{ sessionId: string; responseId: string }>(
      stateDir,
      "shared-session-a",
      8,
      (entry): entry is { sessionId: string; responseId: string } =>
        Boolean(
          entry
            && typeof entry === "object"
            && typeof (entry as { sessionId?: unknown }).sessionId === "string"
            && typeof (entry as { responseId?: unknown }).responseId === "string",
        ),
    );
    const latestSessionId = await resolveLatestSessionId(stateDir);

    assert.equal(snapshot?.sessionId, "shared-session-a");
    assert.equal(snapshot?.latestModel, "test-model");
    assert.equal(bindings.length, 2);
    assert.equal(bindings[0]?.responseId, "resp-2");
    assert.equal(bindings[1]?.responseId, "resp-1");
    assert.equal(latestSessionId, "shared-session-a");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("shared atomic writer overwrites files cleanly", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-host-atomic-store-"));
  try {
    const target = sessionSnapshotPath(stateDir, "shared-session-b");
    await writeJsonFileAtomic(target, { value: 1 });
    await writeJsonFileAtomic(target, { value: 2 });

    const snapshot = await loadSessionSnapshot<{ value: number }>(stateDir, "shared-session-b");
    assert.equal(snapshot?.value, 2);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});


test("shared atomic writer serializes concurrent writes", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightmem2-host-atomic-concurrent-"));
  try {
    const target = sessionSnapshotPath(stateDir, "shared-session-c");
    await Promise.all(Array.from({ length: 32 }, (_, value) => writeJsonFileAtomic(target, { value })));
    const snapshot = await loadSessionSnapshot<{ value: number }>(stateDir, "shared-session-c");
    assert.ok(snapshot);
    assert.ok(Number.isInteger(snapshot.value));
    assert.ok(snapshot.value >= 0 && snapshot.value < 32);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("recent JSONL reads preserve UTF-8, oversized records, ordering, and short histories", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-host-jsonl-tail-"));
  const path = join(stateDir, "records.jsonl");
  const oversized = "😀".repeat(40_000);
  try {
    await writeFile(path, [
      JSON.stringify({ id: 1, text: "é" }),
      JSON.stringify({ id: 2, text: oversized }),
      JSON.stringify({ id: 3, text: "latest" }),
    ].join("\n"), "utf8");

    const records = await readRecentJsonlEntries<{ id: number; text: string }>(path, 8);

    assert.deepEqual(records.map((record) => record.id), [3, 2, 1]);
    assert.equal(records[1]?.text, oversized);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("recent JSONL reads fail closed on malformed final records and tolerate fewer records than requested", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-host-jsonl-malformed-"));
  const path = join(stateDir, "records.jsonl");
  try {
    await writeFile(path, `${JSON.stringify({ id: 1 })}\n${JSON.stringify({ id: 2 })}`, "utf8");
    const short = await readRecentJsonlEntries<{ id: number }>(path, 8);
    assert.deepEqual(short.map((record) => record.id), [2, 1]);

    await appendFile(path, "{partial", "utf8");
    assert.deepEqual(await readRecentJsonlEntries(path, 8), []);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("concurrent JSONL appends remain readable as complete records", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-host-jsonl-concurrent-"));
  const path = join(stateDir, "records.jsonl");
  try {
    await Promise.all(Array.from({ length: 32 }, (_, id) => appendJsonl(path, { id })));
    const records = await readRecentJsonlEntries<{ id: number }>(path, 32);
    assert.equal(records.length, 32);
    assert.equal(new Set(records.map((record) => record.id)).size, 32);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
