import assert from "node:assert/strict";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  appendCodexRebaseCapability,
  CODEX_REBASE_CAPABILITY_SCHEMA,
  codexRebaseCapabilityJournalPath,
  executeCodexRebaseWithFallback,
  readCodexRebaseCapabilityJournal,
  readCodexRebaseEpochJournal,
  readUnsupportedCodexRebaseItemTypes,
  type JsonObject,
} from "../src/context-rewrite/index.js";

async function withTempState(
  fn: (stateDir: string) => Promise<void>,
): Promise<void> {
  const stateDir = await mkdtemp(join(tmpdir(), "lightmem2-codex-rebase-capability-"));
  try {
    await fn(stateDir);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
}

test("CDR-05 Provider Capability Cache stores support status by provider, model, and item type", async () => {
  await withTempState(async (stateDir) => {
    await appendCodexRebaseCapability({
      stateDir,
      provider: "OpenAI",
      model: "gpt-5.4-mini",
      itemType: "web_search_call",
      status: "unsupported",
      reason: "schema_error",
      observedAt: "2026-07-28T10:00:00.000Z",
    });

    assert.deepEqual(await readUnsupportedCodexRebaseItemTypes({
      stateDir,
      provider: "OpenAI",
      model: "gpt-5.4-mini",
      itemTypes: ["message", "web_search_call"],
    }), ["web_search_call"]);

    assert.deepEqual(await readUnsupportedCodexRebaseItemTypes({
      stateDir,
      provider: "OpenAI",
      model: "gpt-5.4",
      itemTypes: ["web_search_call"],
    }), []);

    await appendCodexRebaseCapability({
      stateDir,
      provider: "OpenAI",
      model: "gpt-5.4-mini",
      itemType: "web_search_call",
      status: "supported",
      reason: "rebase_committed",
      observedAt: "2026-07-28T10:01:00.000Z",
    });

    assert.deepEqual(await readUnsupportedCodexRebaseItemTypes({
      stateDir,
      provider: "OpenAI",
      model: "gpt-5.4-mini",
      itemTypes: ["web_search_call"],
    }), []);

    const journal = await readCodexRebaseCapabilityJournal(stateDir);
    assert.equal(journal.capabilities.length, 1);
    assert.equal(journal.capabilities[0]?.status, "supported");
  });
});

test("CDR-05 Provider Capability Cache records only malformed rows as malformed", async () => {
  await withTempState(async (stateDir) => {
    await appendCodexRebaseCapability({
      stateDir,
      provider: "OpenAI",
      model: "gpt-5.4-mini",
      itemType: "reasoning",
      status: "unsupported",
      observedAt: "2026-07-28T10:00:00.000Z",
    });
    await appendFile(
      codexRebaseCapabilityJournalPath(stateDir),
      [
        "not-json",
        "{\"schema\":\"wrong\"}",
        JSON.stringify({
          schema: CODEX_REBASE_CAPABILITY_SCHEMA,
          provider: "OpenAI",
          model: "gpt-5.4-mini",
          itemType: "custom_tool_call",
          status: "unsupported",
          observedAt: "bad-time",
        }),
        "",
      ].join("\n"),
      "utf8",
    );

    const journal = await readCodexRebaseCapabilityJournal(stateDir);
    assert.equal(journal.entries.length, 1);
    assert.equal(journal.capabilities.length, 1);
    assert.equal(journal.malformedLineCount, 3);
  });
});

test("CDR-05 Provider Capability Cache learns 400 schema item rejection and skips later rebase attempts", async () => {
  await withTempState(async (stateDir) => {
    const originalPayload = { model: "gpt-5.4-mini", previous_response_id: "resp-old", input: [{ role: "user", content: "current" }] };
    const rebasedPayload = { model: "gpt-5.4-mini", input: [{ type: "web_search_call", query: "not replayable" }, { role: "user", content: "current" }] };
    const sentPayloads: JsonObject[] = [];

    const first = await executeCodexRebaseWithFallback({
      sessionId: "codex-session-capability",
      planId: "plan-capability",
      epochId: "epoch-capability",
      originalPayload,
      rebasedPayload,
      capabilityStore: {
        stateDir,
        provider: "OpenAI",
        model: "gpt-5.4-mini",
      },
      async sendUpstream(payload) {
        sentPayloads.push(payload);
        return sentPayloads.length === 1
          ? {
            status: 400,
            headers: { "content-type": "application/json" },
            text: JSON.stringify({ error: { code: "invalid_request_error", message: "Unsupported item type: web_search_call" } }),
          }
          : { status: 200, headers: {}, text: JSON.stringify({ id: "resp-original", output: [] }) };
      },
    });

    assert.equal(first.outcome, "bypassed");
    assert.deepEqual(first.capability?.unsupportedItemTypes, ["web_search_call"]);
    assert.equal(sentPayloads.length, 2);

    const secondPayloads: JsonObject[] = [];
    const second = await executeCodexRebaseWithFallback({
      sessionId: "codex-session-capability",
      planId: "plan-capability-next",
      epochId: "epoch-capability-next",
      originalPayload,
      rebasedPayload,
      capabilityStore: {
        stateDir,
        provider: "OpenAI",
        model: "gpt-5.4-mini",
      },
      async sendUpstream(payload) {
        secondPayloads.push(payload);
        return { status: 200, headers: {}, text: JSON.stringify({ id: "resp-original-2", output: [] }) };
      },
    });

    assert.equal(second.outcome, "bypassed");
    assert.equal(second.rebaseResponse, undefined);
    assert.deepEqual(second.capability?.skippedItemTypes, ["web_search_call"]);
    assert.deepEqual(secondPayloads, [originalPayload]);
  });
});

test("CDR-05 Provider Capability Cache falls back and remembers encrypted compaction rejection", async () => {
  await withTempState(async (stateDir) => {
    const originalPayload = {
      model: "gpt-5.6-sol",
      previous_response_id: "resp-old",
      input: [{ role: "user", content: "current" }],
    };
    const rebasedPayload = {
      model: "gpt-5.6-sol",
      input: [
        { type: "compaction", encrypted_content: "provider-bound-payload" },
        { role: "user", content: "current" },
      ],
    };
    const firstPayloads: JsonObject[] = [];
    const first = await executeCodexRebaseWithFallback({
      sessionId: "codex-session-compaction-capability",
      planId: "plan-compaction-capability",
      epochId: "epoch-compaction-capability",
      originalPayload,
      rebasedPayload,
      capabilityStore: {
        stateDir,
        provider: "OpenAI",
        model: "gpt-5.6-sol",
      },
      async sendUpstream(payload) {
        firstPayloads.push(payload);
        return firstPayloads.length === 1
          ? {
            status: 400,
            headers: { "content-type": "application/json" },
            text: JSON.stringify({
              error: {
                code: "invalid_encrypted_content",
                message: "Unsupported compaction encrypted content",
              },
            }),
          }
          : { status: 200, headers: {}, text: JSON.stringify({ id: "resp-original", output: [] }) };
      },
    });

    assert.equal(first.outcome, "bypassed");
    assert.deepEqual(first.capability?.unsupportedItemTypes, ["compaction"]);
    assert.deepEqual(firstPayloads, [rebasedPayload, originalPayload]);

    const secondPayloads: JsonObject[] = [];
    const second = await executeCodexRebaseWithFallback({
      sessionId: "codex-session-compaction-capability",
      planId: "plan-compaction-capability-next",
      epochId: "epoch-compaction-capability-next",
      originalPayload,
      rebasedPayload,
      capabilityStore: {
        stateDir,
        provider: "OpenAI",
        model: "gpt-5.6-sol",
      },
      async sendUpstream(payload) {
        secondPayloads.push(payload);
        return { status: 200, headers: {}, text: JSON.stringify({ id: "resp-original-next", output: [] }) };
      },
    });

    assert.equal(second.outcome, "bypassed");
    assert.deepEqual(second.capability?.skippedItemTypes, ["compaction"]);
    assert.deepEqual(secondPayloads, [originalPayload]);
  });
});

test("CDR-05 Provider Capability Cache skips unsupported rebases before opening an epoch", async () => {
  await withTempState(async (stateDir) => {
    await appendCodexRebaseCapability({
      stateDir,
      provider: "OpenAI",
      model: "gpt-5.4-mini",
      itemType: "web_search_call",
      status: "unsupported",
      reason: "schema_error",
      observedAt: "2026-07-28T10:00:00.000Z",
    });

    const originalPayload = { model: "gpt-5.4-mini", previous_response_id: "resp-old", input: [{ role: "user", content: "current" }] };
    const rebasedPayload = { model: "gpt-5.4-mini", input: [{ type: "web_search_call", query: "not replayable" }, { role: "user", content: "current" }] };
    const sentPayloads: JsonObject[] = [];

    const result = await executeCodexRebaseWithFallback({
      sessionId: "codex-session-capability-epoch",
      planId: "plan-capability-epoch",
      epochId: "epoch-capability-epoch",
      originalPayload,
      rebasedPayload,
      epochStore: {
        stateDir,
        oldPreviousResponseId: "resp-old",
        oldRevision: "rev-old",
      },
      capabilityStore: {
        stateDir,
        provider: "OpenAI",
        model: "gpt-5.4-mini",
      },
      async sendUpstream(payload) {
        sentPayloads.push(payload);
        return { status: 200, headers: {}, text: JSON.stringify({ id: "resp-original", output: [] }) };
      },
    });

    assert.equal(result.outcome, "bypassed");
    assert.equal(result.rebaseResponse, undefined);
    assert.deepEqual(result.capability?.skippedItemTypes, ["web_search_call"]);
    assert.deepEqual(sentPayloads, [originalPayload]);

    const epochJournal = await readCodexRebaseEpochJournal(stateDir, "codex-session-capability-epoch");
    assert.equal(epochJournal.entries.length, 0);
  });
});

test("CDR-05 Provider Capability Cache does not persist auth, rate limit, or 5xx failures as unsupported", async () => {
  await withTempState(async (stateDir) => {
    for (const status of [401, 429, 500]) {
      let calls = 0;
      await executeCodexRebaseWithFallback({
        sessionId: `codex-session-${status}`,
        planId: `plan-${status}`,
        epochId: `epoch-${status}`,
        originalPayload: { model: "gpt-5.4-mini", previous_response_id: "resp-old", input: [] },
        rebasedPayload: { model: "gpt-5.4-mini", input: [{ type: "web_search_call", query: "not replayable" }] },
        capabilityStore: {
          stateDir,
          provider: "OpenAI",
          model: "gpt-5.4-mini",
        },
        async sendUpstream() {
          calls += 1;
          return calls === 1
            ? { status, headers: {}, text: JSON.stringify({ error: { message: "temporary failure" } }) }
            : { status: 200, headers: {}, text: JSON.stringify({ id: `resp-original-${status}`, output: [] }) };
        },
      });
    }

    assert.deepEqual(await readUnsupportedCodexRebaseItemTypes({
      stateDir,
      provider: "OpenAI",
      model: "gpt-5.4-mini",
      itemTypes: ["web_search_call"],
    }), []);
  });
});

test("CDR-05 Provider Capability Cache records supported item types after committed rebase", async () => {
  await withTempState(async (stateDir) => {
    const result = await executeCodexRebaseWithFallback({
      sessionId: "codex-session-supported",
      planId: "plan-supported",
      epochId: "epoch-supported",
      originalPayload: { model: "gpt-5.4-mini", previous_response_id: "resp-old", input: [] },
      rebasedPayload: { model: "gpt-5.4-mini", input: [{ role: "user", content: "current" }] },
      capabilityStore: {
        stateDir,
        provider: "OpenAI",
        model: "gpt-5.4-mini",
      },
      async sendUpstream() {
        return { status: 200, headers: {}, text: JSON.stringify({ id: "resp-rebased", output: [] }) };
      },
    });

    assert.equal(result.outcome, "committed");

    const journal = await readCodexRebaseCapabilityJournal(stateDir);
    assert.equal(journal.capabilities.length, 1);
    assert.equal(journal.capabilities[0]?.itemType, "message");
    assert.equal(journal.capabilities[0]?.status, "supported");
  });
});
