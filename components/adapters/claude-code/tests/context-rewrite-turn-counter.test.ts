import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { persistRawSemanticTurnRecord } from "@lightmem2/history";
import { readClaudeTurnSeq, bumpClaudeTurnSeq } from "../src/context-rewrite/turn-counter.js";

async function tempStateDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "lightmem2-turn-counter-"));
}

test("readClaudeTurnSeq returns 0 when no counter exists yet", async () => {
  const stateDir = await tempStateDir();
  assert.equal(await readClaudeTurnSeq(stateDir, "sess-1"), 0);
});

test("bumpClaudeTurnSeq increments monotonically from 0", async () => {
  const stateDir = await tempStateDir();
  assert.equal(await bumpClaudeTurnSeq(stateDir, "sess-1"), 1);
  assert.equal(await bumpClaudeTurnSeq(stateDir, "sess-1"), 2);
  assert.equal(await bumpClaudeTurnSeq(stateDir, "sess-1"), 3);
});

test("turnSeq survives a fresh read (persistence across restart)", async () => {
  const stateDir = await tempStateDir();
  await bumpClaudeTurnSeq(stateDir, "sess-1");
  await bumpClaudeTurnSeq(stateDir, "sess-1");
  // A brand-new read (simulating a restart) picks up the persisted value.
  assert.equal(await readClaudeTurnSeq(stateDir, "sess-1"), 2);
  assert.equal(await bumpClaudeTurnSeq(stateDir, "sess-1"), 3);
});

test("counters are independent per session", async () => {
  const stateDir = await tempStateDir();
  await bumpClaudeTurnSeq(stateDir, "sess-a");
  await bumpClaudeTurnSeq(stateDir, "sess-a");
  assert.equal(await bumpClaudeTurnSeq(stateDir, "sess-b"), 1);
  assert.equal(await readClaudeTurnSeq(stateDir, "sess-a"), 2);
});

test("a corrupt counter file is treated as 0 (fail-open)", async () => {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const stateDir = await tempStateDir();
  const dir = join(stateDir, "claude-context", "sessions", "sess-x");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "turn-counter.json"), "{ not valid json", "utf8");
  assert.equal(await readClaudeTurnSeq(stateDir, "sess-x"), 0);
  // and bump recovers by starting from 0 -> 1
  assert.equal(await bumpClaudeTurnSeq(stateDir, "sess-x"), 1);
});

test("a corrupt counter recovers after existing raw turn records", async () => {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const stateDir = await tempStateDir();
  const sessionId = "sess-raw-recovery";
  await persistRawSemanticTurnRecord(stateDir, {
    sessionId,
    turnSeq: 7,
    turnAbsId: `${sessionId}:t7`,
    messages: [],
    toolCalls: [],
    toolResults: [],
  });
  const dir = join(stateDir, "claude-context", "sessions", sessionId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "turn-counter.json"), "{ not valid json", "utf8");

  assert.equal(await readClaudeTurnSeq(stateDir, sessionId), 7);
  assert.equal(await bumpClaudeTurnSeq(stateDir, sessionId), 8);
});
