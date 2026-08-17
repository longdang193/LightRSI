import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendCacheAuditRecord,
  buildCacheAuditSnapshot,
  readRecentCacheAuditRecordsForSession,
  rotateCacheAuditFileIfNeeded,
  summarizeCacheAudit,
} from "../src/cache-audit-store.js";
import type { StabilizerRequestEnvelope } from "../src/contracts.js";

function envelope(params: {
  sessionId: string;
  instructions: string;
  requestPromptCacheKey: string;
}): {
  envelope: StabilizerRequestEnvelope;
  sessionId: string;
  requestPromptCacheKey: string;
} {
  return {
    sessionId: params.sessionId,
    requestPromptCacheKey: params.requestPromptCacheKey,
    envelope: {
      session: { host: { hostId: "codex" } },
      model: "gpt-5.4",
      instructions: params.instructions,
      messages: [
        {
          role: "user",
          content: "hello",
        },
      ],
    },
  };
}

test("appendCacheAuditRecord does not invent drift for a new request key in the same session", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tokenpilot-cache-audit-store-"));
  try {
    const first = envelope({
      sessionId: "sess-drift-1",
      requestPromptCacheKey: "pk-a",
      instructions: "Project A rules.\nYour working directory is: /repo/demo",
    });
    const second = envelope({
      sessionId: "sess-drift-1",
      requestPromptCacheKey: "pk-b",
      instructions: "Project B rules.\nYour working directory is: /repo/demo",
    });

    await appendCacheAuditRecord({
      stateDir,
      snapshot: buildCacheAuditSnapshot({
        envelope: first.envelope,
        sessionId: first.sessionId,
        model: "gpt-5.4",
        stream: false,
        requestPromptCacheKey: first.requestPromptCacheKey,
      }),
      responsePromptCacheKey: first.requestPromptCacheKey,
      usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 } },
      status: 200,
    });

    await appendCacheAuditRecord({
      stateDir,
      snapshot: buildCacheAuditSnapshot({
        envelope: second.envelope,
        sessionId: second.sessionId,
        model: "gpt-5.4",
        stream: false,
        requestPromptCacheKey: second.requestPromptCacheKey,
      }),
      responsePromptCacheKey: second.requestPromptCacheKey,
      usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 } },
      status: 200,
    });

    const records = await readRecentCacheAuditRecordsForSession(stateDir, "sess-drift-1", 8);
    assert.equal(records.length, 2);
    assert.equal(records[0]?.originalRequestPromptCacheKey, null);
    assert.equal(records[0]?.requestPromptCacheKey, "pk-b");
    assert.equal(records[0]?.baselineKind, "none");
    assert.equal(records[0]?.driftReasons?.length ?? 0, 0);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("appendCacheAuditRecord keeps identity baseline across interleaved sessions", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tokenpilot-cache-audit-interleaved-"));
  try {
    const sessionA = envelope({
      sessionId: "sess-interleaved-a",
      requestPromptCacheKey: "pk-a",
      instructions: "Shared project rules.",
    });
    const sessionB = envelope({
      sessionId: "sess-interleaved-b",
      requestPromptCacheKey: "pk-b",
      instructions: "Shared project rules.",
    });
    const append = async (request: typeof sessionA) => appendCacheAuditRecord({
      stateDir,
      snapshot: buildCacheAuditSnapshot({
        envelope: request.envelope,
        sessionId: request.sessionId,
        model: "gpt-5.4",
        stream: false,
        requestPromptCacheKey: request.requestPromptCacheKey,
      }),
      responsePromptCacheKey: request.requestPromptCacheKey,
      usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 80 } },
      status: 200,
    });

    await append(sessionA);
    for (let index = 0; index < 40; index += 1) await append(sessionB);
    const secondA = await append(sessionA);

    assert.equal(secondA.baselineKind, "identity");
    assert.equal(secondA.driftReasons.length, 0);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("appendCacheAuditRecord stores per-session records and keeps same-key baseline", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tokenpilot-cache-audit-store-"));
  try {
    const first = envelope({
      sessionId: "sess-same-key-1",
      requestPromptCacheKey: "pk-z",
      instructions: "Project A rules.\nYour working directory is: /repo/demo",
    });
    const second = envelope({
      sessionId: "sess-same-key-1",
      requestPromptCacheKey: "pk-z",
      instructions: "Project B rules.\nYour working directory is: /repo/demo",
    });

    await appendCacheAuditRecord({
      stateDir,
      snapshot: buildCacheAuditSnapshot({
        envelope: first.envelope,
        sessionId: first.sessionId,
        model: "gpt-5.4",
        stream: false,
        requestPromptCacheKey: first.requestPromptCacheKey,
      }),
      responsePromptCacheKey: first.requestPromptCacheKey,
      usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 } },
      status: 200,
    });

    await appendCacheAuditRecord({
      stateDir,
      snapshot: buildCacheAuditSnapshot({
        envelope: second.envelope,
        sessionId: second.sessionId,
        model: "gpt-5.4",
        stream: false,
        requestPromptCacheKey: second.requestPromptCacheKey,
      }),
      responsePromptCacheKey: second.requestPromptCacheKey,
      usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 } },
      status: 200,
    });

    const records = await readRecentCacheAuditRecordsForSession(stateDir, "sess-same-key-1", 8);
    assert.equal(records.length, 2);
    assert.equal(records[0]?.originalRequestPromptCacheKey, null);
    assert.equal(records[0]?.baselineKind, "request_key");
    assert.equal(records[0]?.driftReasons?.[0]?.key, "instructions");
    assert.equal(records[0]?.driftReasons?.[0]?.kind, "segment_text_changed");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("audit records stay bounded and rotate oversized files", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tokenpilot-cache-audit-bounded-"));
  try {
    const first = envelope({
      sessionId: "sess-bounded",
      requestPromptCacheKey: "pk-bounded",
      instructions: "x".repeat(200_000),
    });
    await appendCacheAuditRecord({
      stateDir,
      snapshot: buildCacheAuditSnapshot({
        envelope: first.envelope,
        sessionId: first.sessionId,
        model: "gpt-5.4",
        stream: false,
        requestPromptCacheKey: first.requestPromptCacheKey,
      }),
      usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 } },
      status: 200,
    });

    const records = await readRecentCacheAuditRecordsForSession(stateDir, "sess-bounded", 1);
    const record = records[0];
    assert.ok(record);
    assert.ok(JSON.stringify(record).length < 20_000);
    assert.match(String(record.stablePrefix.stableCore[0]?.text), /^sha256:[a-f0-9]{64}$/);
    assert.equal(
      (record.stablePrefix.stableCore[0] as unknown as { textLength?: number })?.textLength,
      200_000,
    );
    assert.deepEqual(record.usage, {
      input_tokens: 100,
      cached_input_tokens: 0,
      cache_write_tokens: 0,
    });

    const auditPath = join(stateDir, "rotate.jsonl");
    await appendFile(auditPath, "old-record\n", "utf8");
    const rotatedPath = await rotateCacheAuditFileIfNeeded(auditPath, 1);
    assert.ok(rotatedPath);
    assert.equal(await readFile(rotatedPath!, "utf8"), "old-record\n");
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("summarizeCacheAudit reports family reuse and token metrics", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "tokenpilot-cache-audit-summary-"));
  try {
    const request = envelope({
      sessionId: "sess-family-summary",
      requestPromptCacheKey: "pk-family",
      instructions: "Shared project rules.",
    });
    const append = async (cachedTokens: number, cacheWriteTokens: number) => appendCacheAuditRecord({
      stateDir,
      snapshot: buildCacheAuditSnapshot({
        envelope: request.envelope,
        sessionId: request.sessionId,
        model: "gpt-5.4",
        stream: false,
        requestPromptCacheKey: request.requestPromptCacheKey,
        providerWirePrefixHash: "wire-family",
        cacheFamilyId: "family-shared",
      }),
      responsePromptCacheKey: request.requestPromptCacheKey,
      usage: {
        input_tokens: 100,
        input_tokens_details: {
          cached_tokens: cachedTokens,
          cache_write_tokens: cacheWriteTokens,
        },
      },
      status: 200,
    });

    await append(0, 100);
    await append(80, 20);
    const records = await readRecentCacheAuditRecordsForSession(stateDir, request.sessionId, 8);
    const summary = summarizeCacheAudit(records);

    assert.equal(summary.familyWarmCandidates, 1);
    assert.equal(summary.familyWarmHits, 1);
    assert.equal(summary.inputTokens, 200);
    assert.equal(summary.cachedInputTokens, 80);
    assert.equal(summary.cacheWriteTokens, 120);
    assert.equal(summary.cachedInputTokenRatioPercent, 40);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
