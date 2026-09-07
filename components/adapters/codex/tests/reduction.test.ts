import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";

import { createCodexResponsesPayloadCodec } from "../src/responses-codec.js";
import {
  applyBeforeCallReductionToPayload,
  normalizeResponsesInputForUpstream,
  reduceCodexRequestEnvelope,
} from "../src/reduction.js";
import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import { loadCodexSessionSnapshot, upsertCodexSessionSnapshot } from "../src/session-state.js";

const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalLightRsiStateDir = process.env.LIGHTRSI_STATE_DIR;
let reductionSuiteHome = "";

before(async () => {
  reductionSuiteHome = await mkdtemp(join(tmpdir(), "lightrsi-codex-reduction-suite-"));
  process.env.HOME = reductionSuiteHome;
  process.env.USERPROFILE = reductionSuiteHome;
  process.env.LIGHTRSI_STATE_DIR = join(reductionSuiteHome, ".lightrsi", "state");
});

after(async () => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  if (originalLightRsiStateDir === undefined) delete process.env.LIGHTRSI_STATE_DIR;
  else process.env.LIGHTRSI_STATE_DIR = originalLightRsiStateDir;
  if (reductionSuiteHome) {
    await rm(reductionSuiteHome, { recursive: true, force: true });
  }
});

test("normalizeResponsesInputForUpstream preserves structured output blocks", () => {
  const outputBlocks = [{ type: "input_text", text: "ok" }];
  const input: any[] = [
    {
      type: "function_call",
      arguments: { command: "git status" },
    },
    {
      type: "function_call_output",
      output: outputBlocks,
    },
    {
      type: "function_call_output",
      output: { stdout: "ok" },
    },
  ];

  normalizeResponsesInputForUpstream(input);

  assert.equal(input[0].arguments, "{\"command\":\"git status\"}");
  assert.equal(input[1].output, outputBlocks);
  assert.equal(input[2].output, "{\"stdout\":\"ok\"}");
});

test("applyBeforeCallReductionToPayload skips below-threshold payloads", async () => {
  const config = normalizeTokenPilotCodexConfig({
    reduction: {
      triggerMinChars: 5000,
      maxToolChars: 1200,
      passes: {
        readStateCompaction: true,
        toolPayloadTrim: true,
        htmlSlimming: true,
        execOutputTruncation: true,
        agentsStartupOptimization: true,
      },
    },
  });

  const payload: any = {
    model: "tokenpilot/gpt-5.4-mini",
    input: [
      { role: "tool", type: "function_call_output", output: "short tool output" },
    ],
  };

  const result = await applyBeforeCallReductionToPayload({
    payload,
    sessionId: "session-small",
    config,
  });

  assert.equal(result.changedItems, 0);
  assert.equal(result.savedChars, 0);
  assert.equal(result.skippedReason, "below_trigger_min_chars");
});

test("reduceCodexRequestEnvelope trims large tool output and preserves developer role", async () => {
  const config = normalizeTokenPilotCodexConfig({
    reduction: {
      triggerMinChars: 256,
      maxToolChars: 400,
      passes: {
        readStateCompaction: false,
        toolPayloadTrim: true,
        htmlSlimming: false,
        execOutputTruncation: true,
        agentsStartupOptimization: false,
      },
      passOptions: {
        execOutputTruncation: {
          toolThresholds: {
            bash: 400,
          },
        },
      },
    },
  });
  const codec = createCodexResponsesPayloadCodec();
  const longOutput = `HEAD\n${"line\n".repeat(600)}`;
  const envelope = codec.decodeRequest({
    model: "tokenpilot/gpt-5.4-mini",
    stream: false,
    prompt_cache_options: { mode: "explicit", ttl: "30m" },
    input: [
      {
        role: "developer",
        content: [{ type: "input_text", text: "root prompt", prompt_cache_breakpoint: "one" }],
      },
      { role: "user", content: "check status" },
      { role: "tool", type: "function_call_output", name: "bash", output: longOutput },
      {
        role: "assistant",
        content: [{ type: "output_text", text: "done", prompt_cache_breakpoint: "two" }],
      },
    ],
  });

  const reduced = await reduceCodexRequestEnvelope({
    envelope: {
      ...envelope,
      session: {
        ...envelope.session,
        sessionId: "session-preserve",
      },
      metadata: {
        ...envelope.metadata,
        localMarker: "keep",
        inputText: "stale",
      },
    },
    codec,
    config,
  });

  assert.ok(reduced.summary.savedChars > 0);
  assert.ok(reduced.summary.changedBlocks > 0);
  const encoded = codec.encodeRequest(reduced.envelope) as any;
  assert.equal(encoded.input[0].role, "developer");
  assert.ok(String(encoded.input[2].output).length < longOutput.length);
  assert.deepEqual(encoded.prompt_cache_options, { mode: "explicit", ttl: "30m" });
  assert.deepEqual(
    encoded.input.flatMap((item: any) => Array.isArray(item.content) ? item.content : [])
      .filter((block: any) => block && "prompt_cache_breakpoint" in block)
      .map((block: any) => block.prompt_cache_breakpoint),
    ["one", "two"],
  );
  assert.equal(reduced.envelope.session.sessionId, "session-preserve");
  assert.equal(reduced.envelope.metadata?.localMarker, "keep");
  assert.notEqual(reduced.envelope.metadata?.inputText, "stale");
  assert.deepEqual((reduced.envelope.rawPayload as any).input, encoded.input);
});

test("reduction preserves serialized history items and trims only new tool output", async () => {
  const config = normalizeTokenPilotCodexConfig({
    reduction: {
      triggerMinChars: 256,
      maxToolChars: 400,
      passes: {
        readStateCompaction: false,
        toolPayloadTrim: true,
        htmlSlimming: false,
        execOutputTruncation: true,
        agentsStartupOptimization: false,
      },
      passOptions: {
        execOutputTruncation: {
          toolThresholds: { bash: 400 },
        },
      },
    },
  });
  const oldOutput = `OLD\n${"line\n".repeat(600)}`;
  const newOutput = `NEW\n${"line\n".repeat(600)}`;
  const payload: any = {
    model: "tokenpilot/gpt-5.4-mini",
    input: [
      { role: "user", content: "previous turn" },
      { type: "function_call", call_id: "old-call", name: "bash", arguments: "{}" },
      { type: "function_call_output", call_id: "old-call", output: oldOutput },
      { role: "user", content: "current turn" },
      { type: "function_call", call_id: "new-call", name: "bash", arguments: "{}" },
      { type: "function_call_output", id: "accepted-output", call_id: "old-call-2", output: oldOutput },
      { type: "function_call_output", call_id: "new-call", output: newOutput },
    ],
  };

  const summary = await applyBeforeCallReductionToPayload({
    payload,
    sessionId: "history-prefix-stability",
    config,
  });

  assert.ok(summary.changedBlocks > 0);
  assert.equal(payload.input[2].output, oldOutput);
  assert.equal(payload.input[5].output, oldOutput);
  assert.notEqual(payload.input[6].output, newOutput);
});

test("applyBeforeCallReductionToPayload reuses disclosed read paths from session snapshot", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightrsi-codex-reduction-"));
  try {
    const config = normalizeTokenPilotCodexConfig({
      stateDir: join(dir, "state"),
      reduction: {
        triggerMinChars: 256,
        maxToolChars: 400,
        passes: {
          readStateCompaction: false,
          toolPayloadTrim: true,
          htmlSlimming: false,
          execOutputTruncation: false,
          agentsStartupOptimization: false,
        },
      },
    });
    const codePayload = `
export function loadConfig(file: string) {
  return file.trim();
}

export function saveConfig(file: string, text: string) {
  return text + file;
}
`.repeat(30);

    const firstPayload: any = {
      model: "tokenpilot/gpt-5.4-mini",
      input: [
        {
          type: "function_call",
          call_id: "call_read_1",
          name: "Read",
          arguments: JSON.stringify({ path: "/repo/src/config.ts" }),
        },
        {
          role: "tool",
          type: "function_call_output",
          call_id: "call_read_1",
          output: codePayload,
        },
      ],
    };

    const first = await applyBeforeCallReductionToPayload({
      payload: firstPayload,
      sessionId: "sess-read-1",
      config,
    });
    assert.ok((first.disclosedReadPaths?.length ?? 0) > 0);
    assert.match(String(firstPayload.input[1]?.output ?? ""), /\[code outlined lines=/);

    await upsertCodexSessionSnapshot(config.stateDir, "sess-read-1", {
      disclosedReadPaths: first.disclosedReadPaths,
    });

    const secondPayload: any = {
      model: "tokenpilot/gpt-5.4-mini",
      input: [
        {
          type: "function_call",
          call_id: "call_read_2",
          name: "Read",
          arguments: JSON.stringify({ path: "/repo/src/config.ts" }),
        },
        {
          role: "tool",
          type: "function_call_output",
          call_id: "call_read_2",
          output: codePayload,
        },
      ],
    };

    const second = await applyBeforeCallReductionToPayload({
      payload: secondPayload,
      sessionId: "sess-read-1",
      config,
    });

    assert.ok((second.disclosedReadPaths?.length ?? 0) > 0);
    assert.doesNotMatch(String(secondPayload.input[1]?.output ?? ""), /\[code outlined lines=/);
    assert.match(String(secondPayload.input[1]?.output ?? ""), /export function loadConfig/);

    const snapshot = await loadCodexSessionSnapshot(config.stateDir, "sess-read-1");
    assert.deepEqual(snapshot?.disclosedReadPaths, first.disclosedReadPaths);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("applyBeforeCallReductionToPayload keeps case-sensitive read resources distinct", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightrsi-codex-case-sensitive-read-"));
  try {
    const config = normalizeTokenPilotCodexConfig({
      stateDir: join(dir, "state"),
      reduction: {
        triggerMinChars: 256,
        maxToolChars: 400,
        passes: {
          readStateCompaction: false,
          toolPayloadTrim: true,
          htmlSlimming: false,
          execOutputTruncation: false,
          agentsStartupOptimization: false,
        },
      },
    });
    const codePayload = "export const value = 1;\n".repeat(80);
    await upsertCodexSessionSnapshot(config.stateDir, "case-session", {
      disclosedReadPaths: ["/repo/FILE.ts"],
    });
    const payload: any = {
      model: "tokenpilot/gpt-5.4-mini",
      input: [
        {
          type: "function_call",
          call_id: "case-read",
          name: "Read",
          arguments: JSON.stringify({ path: "/repo/file.ts" }),
        },
        {
          type: "function_call_output",
          call_id: "case-read",
          output: codePayload,
        },
      ],
    };

    await applyBeforeCallReductionToPayload({
      payload,
      sessionId: "case-session",
      config,
    });

    assert.notEqual(payload.input[1]?.output, codePayload);
    assert.match(String(payload.input[1]?.output ?? ""), /\[code reduced lines=/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
