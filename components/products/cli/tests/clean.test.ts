import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { handleCleanCommand } from "../src/clean.js";

const plan = {
  planId: "plan-1",
  hostId: "codex",
  sessionId: "session-1",
  usedTokens: 10,
  usedChars: 40,
  protectedTokens: 0,
  protectedChars: 0,
  unassignedTokens: 0,
  unassignedChars: 0,
  tokenCountMode: "estimated",
  attributionStatus: "waiting",
  tasks: [{ taskId: "task-1", label: "done", description: "", lifecycleState: "completed", tokenCount: 10, charCount: 40, tokenPercent: 100, recommendation: "clean", reasonCodes: [], selectable: true }],
};

const receipt = {
  planId: "plan-1",
  status: "scheduled",
  selectedTaskIds: ["task-1"],
  estimatedSavedTokens: 10,
  estimatedSavedChars: 40,
  fallbackUsed: false,
  deferredTaskIds: [],
  reasons: [],
};

test("clean CLI rejects retired task-first workflows", async () => {
  const backend = {
    async analyze() { return plan; },
    async readPlan() { return plan; },
    async approve() { return receipt; },
    async readReceipt() { return receipt; },
    async cancel() { return { ...receipt, status: "cancelled" }; },
    async submitAttribution() { return { status: "accepted" }; },
  };
  await assert.rejects(
    handleCleanCommand({ args: ["--plan", "plan-1", "--select", "task-1"], backend }),
    /clean_task_first_workflow_retired/,
  );
  await assert.rejects(
    handleCleanCommand({ args: ["--submit-attribution", "-"], backend }),
    /clean_task_first_workflow_retired/,
  );
});

test("clean CLI renders canonical occurrence receipt evidence", async () => {
  const backend = {
    async approveOccurrences() {
      return {
        ...receipt,
        selectedTaskIds: [],
        occurrenceSelections: [{ stableId: "item-1", fingerprint: "digest-1" }],
      };
    },
    async readReceipt() { return receipt; },
    async cancel() { return { ...receipt, status: "cancelled" }; },
  };
  const dir = await mkdtemp(join(tmpdir(), "lightrsi-cli-receipt-"));
  try {
    const path = join(dir, "occurrences.json");
    await writeFile(path, JSON.stringify([{
      stableId: "item-1",
      fingerprint: "digest-1",
      completionEvidence: ["completed"],
      continuingUseful: false,
      releaseIntent: "release",
      retainedFindings: [],
      dependencyDirection: "none",
    }]), "utf8");
    const result = await handleCleanCommand({
      args: ["--plan", "plan-1", "--release", path],
      backend,
    });
    assert.match(result.text, /Selected occurrences: item-1/);
    assert.doesNotMatch(result.text, /Selected: \(none\)/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("clean CLI inspects stable occurrences without task selection", async () => {
  const backend = {
    async analyze() { return plan; },
    async inspect() {
      return {
        hostId: "codex",
        sessionId: "session-1",
        revision: "rev-1",
        occurrences: [{
          stableId: "item-1",
          fingerprint: "digest-1",
          shape: "user",
          chars: 40,
          protectionReason: "unassigned; release requires occurrence evidence",
        }],
      };
    },
    async readPlan() { return plan; },
    async approve() { return receipt; },
    async readReceipt() { return receipt; },
    async cancel() { return { ...receipt, status: "cancelled" }; },
  };

  const result = await handleCleanCommand({ args: ["--inspect", "session-1"], backend });
  assert.match(result.text, /item-1 user/);
  assert.match(result.text, /digest-1/);
});

test("clean CLI releases exact occurrence evidence through the shared service", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightrsi-cli-release-"));
  try {
    const path = join(dir, "occurrences.json");
    await writeFile(path, JSON.stringify([{
      stableId: "item-1",
      fingerprint: "digest-1",
      completionEvidence: ["completed"],
      continuingUseful: false,
      releaseIntent: "release",
      retainedFindings: ["none"],
      dependencyDirection: "none",
    }]), "utf8");
    let released = "";
    const backend = {
      async analyze() { return plan; },
      async readPlan() { return plan; },
      async approve() { return receipt; },
      async approveOccurrences(_planId: string, selections: Array<{ stableId: string }>) {
        released = selections[0]?.stableId ?? "";
        return receipt;
      },
      async readReceipt() { return receipt; },
      async cancel() { return { ...receipt, status: "cancelled" }; },
    };
    const result = await handleCleanCommand({
      args: ["--plan", "plan-1", "--release", path],
      backend,
    });
    assert.match(result.text, /scheduled/);
    assert.equal(released, "item-1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("clean CLI releases exact occurrences without exposing an internal plan id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightrsi-cli-direct-release-"));
  try {
    const path = join(dir, "occurrences.json");
    await writeFile(path, JSON.stringify([{
      stableId: "item-1", fingerprint: "digest-1", completionEvidence: ["completed"],
      continuingUseful: false, releaseIntent: "release", retainedFindings: [],
      nothingReusable: true, dependencyDirection: "none",
    }]), "utf8");
    let releasedSession = "";
    const backend = {
      async analyze() { return plan; },
      async readPlan() { return plan; },
      async approve() { return receipt; },
      async releaseOccurrences(sessionId: string) { releasedSession = sessionId; return receipt; },
      async readReceipt() { return receipt; },
      async cancel() { return { ...receipt, status: "cancelled" }; },
    };
    const result = await handleCleanCommand({ args: ["--session", "session-1", "--release", path], backend });
    assert.match(result.text, /scheduled/);
    assert.equal(releasedSession, "session-1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
