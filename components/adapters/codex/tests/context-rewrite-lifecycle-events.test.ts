import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCodexContextRewriteLifecycle } from "../src/context-rewrite/index.js";

test("Codex lifecycle events use the shared sanitized schema", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-codex-rewrite-lifecycle-"));
  const secret = "sk-proj-abcdefghijklmnopqrstuvwxyz012345";
  try {
    const lifecycle = createCodexContextRewriteLifecycle({
      stateDir,
      sessionId: `session:${secret}`,
    });
    await lifecycle.append({
      stage: "context_rewrite_applied",
      planId: `plan:${secret}`,
      operationIds: [`operation:${secret}`],
      itemIds: [`item:${secret}`],
      reasonCodes: [`reason:${secret}`],
      errorCategory: `error:${secret}`,
      savedChars: 42,
    });

    const raw = await readFile(join(stateDir, "event-trace.jsonl"), "utf8");
    assert.doesNotMatch(raw, new RegExp(secret));
    const event = JSON.parse(raw.trim()) as Record<string, unknown>;
    assert.equal(event.stage, "context_rewrite_applied");
    assert.equal(event.hostId, "codex");
    assert.equal(event.mode, "response_chain_rebase");
    assert.equal(event.savedChars, 42);
    assert.match(String(event.sessionId), /^redacted:sha256:/);
    assert.match(String(event.planId), /^redacted:sha256:/);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("Codex lifecycle event persistence is best effort", async () => {
  let appendCalls = 0;
  const lifecycle = createCodexContextRewriteLifecycle({
    stateDir: "unused",
    sessionId: "session-best-effort",
    async appendEvent() {
      appendCalls += 1;
      throw new Error("simulated trace-store failure");
    },
  });

  await assert.doesNotReject(lifecycle.append({
    stage: "context_rewrite_failed",
    errorCategory: "trace_store_failure",
  }));
  assert.equal(appendCalls, 1);
});
