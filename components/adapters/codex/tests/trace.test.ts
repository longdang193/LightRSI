import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { appendTrace } from "../src/trace.js";

test("appendTrace resolves after queued trace is durable", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-codex-trace-await-"));
  try {
    await appendTrace(stateDir, { stage: "proxy_after_call", requestId: "request-trace-a" });

    const raw = await readFile(join(stateDir, "event-trace.jsonl"), "utf8");
    assert.match(raw, /"stage":"proxy_after_call"/u);
    assert.match(raw, /"requestId":"request-trace-a"/u);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});