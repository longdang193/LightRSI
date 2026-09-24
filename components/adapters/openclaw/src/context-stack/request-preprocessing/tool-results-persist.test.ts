import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { applyToolResultPersistPolicy } from "./tool-results-persist.js";

test("OpenClaw archives oversized output before router reduction", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-openclaw-persist-"));
  try {
    const raw = [
      "command completed with exit code 1",
      "Error: failed to compile",
      ...Array.from({ length: 500 }, (_, index) => `noise-${index}`),
      "    at compile (src/build.ts:10:2)",
    ].join("\n");
    const result = applyToolResultPersistPolicy(
      {
        toolName: "exec",
        toolCallId: "call-1",
        sessionId: "session-1",
        exitCode: 1,
        message: { content: [{ type: "text", text: raw }] },
      },
      { stateDir, reduction: { passOptions: { toolPayloadTrim: { maxChars: 220 } } } },
      { warn: () => undefined },
      {
        appendTaskStateTrace: async () => undefined,
        ensureContextSafeDetails: (details, patch) => ({
          ...(details && typeof details === "object" ? details : {}),
          ...patch,
        }),
        extractOpenClawSessionId: () => "session-1",
        extractToolMessageText: (message) => String((message.content as Array<{ text?: unknown }>)[0]?.text ?? ""),
        isToolResultLikeMessage: () => true,
        safeId: (value) => value.replace(/[^a-z0-9_-]/gi, "_") || "value",
      },
    );

    assert.ok(result);
    const text = String((result.message.content as Array<{ text: string }>)[0]?.text ?? "");
    assert.ok(Number((result.message.details as Record<string, unknown>).previewChars) < raw.length);
    assert.match(text, /failed to compile/i);
    assert.match(text, /memory_fault_recover/);
    assert.equal((result.message.details as Record<string, unknown>).resultMode, "artifact");
    assert.ok(Number((result.message.details as Record<string, unknown>).previewChars) < raw.length);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("OpenClaw preserves oversized output when archive write fails", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-openclaw-persist-failure-"));
  const invalidStatePath = join(stateDir, "state-file");
  const raw = Array.from({ length: 500 }, (_, index) => `line-${index}`).join("\n");
  try {
    await writeFile(invalidStatePath, "not a directory", "utf8");
    const result = applyToolResultPersistPolicy(
      {
        toolName: "exec",
        toolCallId: "call-failure",
        sessionId: "session-failure",
        message: { content: [{ type: "text", text: raw }] },
      },
      { stateDir: invalidStatePath, reduction: { passOptions: { toolPayloadTrim: { maxChars: 220 } } } },
      { warn: () => undefined },
      {
        appendTaskStateTrace: async () => undefined,
        ensureContextSafeDetails: (details, patch) => ({
          ...(details && typeof details === "object" ? details : {}),
          ...patch,
        }),
        extractOpenClawSessionId: () => "session-failure",
        extractToolMessageText: (message) => String((message.content as Array<{ text?: unknown }>)[0]?.text ?? ""),
        isToolResultLikeMessage: () => true,
        safeId: (value) => value.replace(/[^a-z0-9_-]/gi, "_") || "value",
      },
    );

    assert.ok(result);
    assert.equal((result.message.content as Array<{ text: string }>)[0]?.text, raw);
    assert.equal((result.message.details as Record<string, unknown>).resultMode, "inline-fallback");
    assert.equal((result.message.details as Record<string, unknown>).persisted, false);
    assert.doesNotMatch(String((result.message.content as Array<{ text: string }>)[0]?.text), /memory_fault_recover/);
    assert.doesNotMatch(String((result.message.content as Array<{ text: string }>)[0]?.text), /preview truncated/);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
