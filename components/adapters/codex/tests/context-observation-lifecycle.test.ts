import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import { applyBeforeCallReductionToPayload } from "../src/reduction.js";
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
