import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveArchiveAcrossSessionsByArtifactRef } from "@lightrsi/artifact-store";
import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import {
  applyBeforeCallReductionToPayload,
  reduceCodexRequestEnvelope,
} from "../src/reduction.js";
import { createCodexResponsesPayloadCodec } from "../src/responses-codec.js";
import {
  appendCodexRequestJournalEntry,
  findCodexAcceptedInputProjection,
  loadCodexContextHistoryJournal,
} from "../src/context-history/index.js";
import {
  codexMatchForwardedPrefix,
} from "../src/context-history/replayability.js";

function longOutput(label: string): string {
  return `${label}\n${Array.from({ length: 160 }, (_, index) => `${label} line ${index}`).join("\n")}`;
}

function config(stateDir: string) {
  return normalizeTokenPilotCodexConfig({
    stateDir,
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
}

test("stable admission survives cumulative replay, journal reload, and rejects rebase scope", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-observation-lifecycle-"));
  const sessionId = "observation-lifecycle";
  const scope = { promptCacheKey: "cache-1", endpointId: "endpoint-1", conversationBranch: "branch-1" };
  const firstPayload: any = {
    model: "tokenpilot/gpt-5.4-mini",
    input: [
      { type: "message", role: "user", content: "inspect one file" },
      { type: "function_call", call_id: "read-1", name: "Read", arguments: '{"path":"/repo/data.txt"}' },
      { type: "function_call_output", call_id: "read-1", output: longOutput("READ_BEFORE_EDIT") },
    ],
  };
  const originalInput = structuredClone(firstPayload.input);
  try {
    const first = await applyBeforeCallReductionToPayload({
      payload: firstPayload,
      sessionId,
      config: config(stateDir),
      forwardingScope: scope,
    });
    assert.ok(first.changedBlocks > 0);
    const acceptedInputItems = structuredClone(firstPayload.input);
    await appendCodexRequestJournalEntry({
      stateDir,
      sessionId,
      requestId: "turn-1",
      payload: {
        ...structuredClone(firstPayload),
        input: [
          { type: "message", role: "user", content: "inspect one file" },
          { type: "function_call", call_id: "read-1", name: "Read", arguments: '{"path":"/repo/data.txt"}' },
          { type: "function_call_output", call_id: "read-1", output: longOutput("READ_BEFORE_EDIT") },
        ],
      },
      acceptedInputItems,
      forwardingScope: scope,
      forwardingAttempts: [{
        attemptId: "attempt-1",
        payloadFingerprint: "payload-1",
        inputFingerprint: "input-1",
        outcome: "completed",
      }],
      status: "completed",
    });

    const cumulativePayload: any = structuredClone(firstPayload);
    cumulativePayload.input.push(
      { type: "function_call", call_id: "read-2", name: "Read", arguments: '{"path":"/repo/data.txt"}' },
      { type: "function_call_output", call_id: "read-2", output: longOutput("READ_AFTER_EDIT") },
    );
    const second = await applyBeforeCallReductionToPayload({
      payload: cumulativePayload,
      sessionId,
      config: config(stateDir),
      forwardingScope: scope,
    });
    assert.ok(second.changedBlocks > 0);
    assert.equal(cumulativePayload.input[2].output, acceptedInputItems[2].output);

    const reloaded = await loadCodexContextHistoryJournal(stateDir, sessionId);
    assert.equal(reloaded.length, 1);
    const projection = await findCodexAcceptedInputProjection({
      stateDir,
      sessionId,
      currentItems: originalInput,
      scope,
    });
    assert.ok(projection);
    assert.deepEqual(projection?.acceptedItems[2], acceptedInputItems[2]);
    assert.deepEqual(codexMatchForwardedPrefix({
      currentItems: originalInput,
      historicalItems: projection!.historicalItems,
      scope: { ...scope, rebaseEpoch: "epoch-rebase" },
    }), { prefixLength: 0, reason: "scope_mismatch" });
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("journal reload accepts sanitized forwarding metadata for accepted projections", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-sanitized-projection-"));
  const sessionId = "sanitized-projection";
  const scope = { promptCacheKey: "cache-sanitized", endpointId: "endpoint-1", conversationBranch: "branch-1" };
  const input = [{
    type: "function_call_output",
    call_id: "read-1",
    output: "compact output",
    headers: { authorization: "secret", "x-trace": "volatile" },
  }];
  try {
    await appendCodexRequestJournalEntry({
      stateDir,
      sessionId,
      requestId: "sanitized-request",
      payload: { model: "tokenpilot/gpt-5.4-mini", input },
      acceptedInputItems: structuredClone(input),
      forwardingScope: scope,
      status: "completed",
    });

    const projection = await findCodexAcceptedInputProjection({
      stateDir,
      sessionId,
      currentItems: input,
      scope,
    });
    const journal = await loadCodexContextHistoryJournal(stateDir, sessionId);

    assert.ok(projection);
    assert.equal((journal[0].inputItems[0] as any).headers, undefined);
    assert.equal((projection?.acceptedItems[0] as any).headers, undefined);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("journal reload accepts output-only cumulative continuations", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-output-only-projection-"));
  const sessionId = "output-only-projection";
  const scope = { promptCacheKey: "cache-output-only", endpointId: "endpoint-1" };
  const input = [
    { type: "function_call_output", call_id: "read-1", output: "compact output" },
    { type: "function_call_output", call_id: "read-2", output: "second output" },
  ];
  try {
    await appendCodexRequestJournalEntry({
      stateDir,
      sessionId,
      requestId: "output-only-request",
      payload: { model: "tokenpilot/gpt-5.4-mini", input },
      acceptedInputItems: structuredClone(input),
      forwardingScope: scope,
      status: "completed",
    });

    const projection = await findCodexAcceptedInputProjection({
      stateDir,
      sessionId,
      currentItems: [...structuredClone(input), {
        type: "function_call_output",
        call_id: "read-3",
        output: "continuation output",
      }],
      scope,
    });

    assert.ok(projection);
    assert.equal(projection?.acceptedItems.length, input.length);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("codec provider payload, journal reload, and artifact recovery stay exact", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-provider-artifact-lifecycle-"));
  const previousStateDir = process.env.LIGHTRSI_STATE_DIR;
  process.env.LIGHTRSI_STATE_DIR = stateDir;
  const sessionId = "provider-artifact-lifecycle";
  const scope = { promptCacheKey: "cache-provider-artifact", endpointId: "endpoint-1" };
  const originalOutput = longOutput("PROVIDER_BOUND");
  const originalInput = [{
    type: "function_call_output",
    call_id: "read-1",
    output: originalOutput,
  }];
  const codec = createCodexResponsesPayloadCodec();
  const envelopeFor = (input: any[]) => {
    const envelope = codec.decodeRequest({ model: "tokenpilot/gpt-5.4-mini", input });
    return { ...envelope, session: { ...envelope.session, sessionId } };
  };
  try {
    const first = await reduceCodexRequestEnvelope({
      envelope: envelopeFor(structuredClone(originalInput)),
      codec,
      config: config(stateDir),
      forwardingScope: scope,
      requestId: "provider-artifact-first",
    });
    const firstPayload = codec.encodeRequest(first.envelope) as any;
    const firstOutput = String(firstPayload.input[0].output);
    const artifactRef = firstOutput.match(/artifact:v2:[a-f0-9]{64}/)?.[0];

    assert.ok(first.summary.changedBlocks > 0);
    assert.ok(firstOutput.includes("Full content omitted to save context"));
    assert.ok(artifactRef);

    await appendCodexRequestJournalEntry({
      stateDir,
      sessionId,
      requestId: "provider-artifact-first",
      payload: { model: "tokenpilot/gpt-5.4-mini", input: structuredClone(originalInput) },
      acceptedInputItems: firstPayload.input,
      forwardingScope: scope,
      status: "completed",
    });

    const secondInput = [
      ...structuredClone(originalInput),
      { type: "function_call_output", call_id: "read-2", output: longOutput("CONTINUATION") },
    ];
    const second = await reduceCodexRequestEnvelope({
      envelope: envelopeFor(secondInput),
      codec,
      config: config(stateDir),
      forwardingScope: scope,
      requestId: "provider-artifact-second",
    });
    const secondPayload = codec.encodeRequest(second.envelope) as any;
    const recovered = await resolveArchiveAcrossSessionsByArtifactRef(artifactRef!, stateDir);

    assert.equal(second.summary.changedBlocks, 1);
    assert.equal(second.summary.projectionReusedItems, 1);
    assert.equal(secondPayload.input[0].output, firstOutput);
    assert.equal(recovered?.archive.originalText, originalOutput);
  } finally {
    if (previousStateDir === undefined) delete process.env.LIGHTRSI_STATE_DIR;
    else process.env.LIGHTRSI_STATE_DIR = previousStateDir;
    await rm(stateDir, { recursive: true, force: true });
  }
});
