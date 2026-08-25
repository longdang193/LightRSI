import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  acquireCodexRebaseSessionLock,
} from "../src/context-rewrite/index.js";
import {
  appendCodexCleanerCommitted,
  appendCodexCleanerTerminal,
  codexCleanerScheduleJournalPath,
  readCodexCleanerSchedule,
  scheduleCodexCleanerPlan,
} from "../src/context-cleaner/scheduler.js";

async function withTempState(
  run: (stateDir: string) => Promise<void>,
): Promise<void> {
  const stateDir = await mkdtemp(join(tmpdir(), "lightrsi-codex-cleaner-scheduler-"));
  try {
    await run(stateDir);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
}

const scheduledAt = "2026-08-22T00:00:00.000Z";

function scheduleParams(stateDir: string) {
  return {
    stateDir,
    sessionId: "codex-cleaner-session",
    cleanPlanId: "clean-plan-1",
    baseRevision: "revision-1",
    selectedTaskIds: ["task-1", "task-2"],
    scheduledAt,
  };
}

test("Codex cleaner scheduler persists only the approved plan reference and is idempotent", async () => {
  await withTempState(async (stateDir) => {
    const first = await scheduleCodexCleanerPlan(scheduleParams(stateDir));
    const duplicate = await scheduleCodexCleanerPlan(scheduleParams(stateDir));
    const reorderedDuplicate = await scheduleCodexCleanerPlan({
      ...scheduleParams(stateDir),
      selectedTaskIds: ["task-2", "task-1"],
    });

    assert.equal(first.outcome, "stored");
    assert.equal(duplicate.outcome, "unchanged");
    assert.deepEqual(duplicate.record, first.record);
    assert.equal(reorderedDuplicate.outcome, "unchanged");
    assert.deepEqual(reorderedDuplicate.record, first.record);

    const read = await readCodexCleanerSchedule({
      stateDir,
      sessionId: "codex-cleaner-session",
    });
    assert.equal(read.outcome, "ready");
    if (read.outcome !== "ready") return;
    assert.deepEqual(read.record.selectedTaskIds, ["task-1", "task-2"]);
    assert.equal(read.record.baseRevision, "revision-1");

    const raw = await readFile(
      codexCleanerScheduleJournalPath(stateDir, "codex-cleaner-session"),
      "utf8",
    );
    assert.equal(raw.includes("itemIds"), false);
    assert.equal(raw.includes("itemDigests"), false);
    assert.equal(raw.trim().split(/\r?\n/u).length, 1);
  });
});

test("Codex cleaner scheduler rejects conflicting pending plans and selections", async () => {
  await withTempState(async (stateDir) => {
    assert.equal(
      (await scheduleCodexCleanerPlan(scheduleParams(stateDir))).outcome,
      "stored",
    );

    const changedSelection = await scheduleCodexCleanerPlan({
      ...scheduleParams(stateDir),
      selectedTaskIds: ["task-1"],
    });
    assert.equal(changedSelection.outcome, "conflict");
    assert.deepEqual(changedSelection.reasons, ["cleaner_schedule_identity_conflict"]);

    const secondPlan = await scheduleCodexCleanerPlan({
      ...scheduleParams(stateDir),
      cleanPlanId: "clean-plan-2",
    });
    assert.equal(secondPlan.outcome, "conflict");
    assert.deepEqual(secondPlan.reasons, ["cleaner_schedule_pending_conflict"]);
  });
});

test("Codex cleaner scheduler uses the existing rebase session lock", async () => {
  await withTempState(async (stateDir) => {
    const lock = await acquireCodexRebaseSessionLock({
      stateDir,
      sessionId: "codex-cleaner-session",
    });
    assert.ok(lock);
    try {
      const blocked = await scheduleCodexCleanerPlan(scheduleParams(stateDir));
      assert.equal(blocked.outcome, "bypassed");
      assert.deepEqual(blocked.reasons, ["cleaner_schedule_lock_busy"]);
    } finally {
      await lock.release();
    }
  });
});

test("Codex cleaner scheduler survives restart and terminal records are not active", async () => {
  await withTempState(async (stateDir) => {
    await scheduleCodexCleanerPlan(scheduleParams(stateDir));
    assert.equal(
      (await readCodexCleanerSchedule({
        stateDir,
        sessionId: "codex-cleaner-session",
      })).outcome,
      "ready",
    );

    const terminal = await appendCodexCleanerTerminal({
      stateDir,
      sessionId: "codex-cleaner-session",
      cleanPlanId: "clean-plan-1",
      receiptStatus: "stale",
      reasons: ["clean_execution_revision_stale"],
      updatedAt: "2026-08-22T00:00:01.000Z",
    });
    assert.equal(terminal.outcome, "transitioned");

    const restored = await readCodexCleanerSchedule({
      stateDir,
      sessionId: "codex-cleaner-session",
    });
    assert.equal(restored.outcome, "terminal");
    if (restored.outcome !== "terminal") return;
    assert.equal(restored.record.receiptStatus, "stale");
  });
});

test("Codex cleaner scheduler preserves a local committed marker without creating an applied receipt", async () => {
  await withTempState(async (stateDir) => {
    await scheduleCodexCleanerPlan(scheduleParams(stateDir));
    const committed = await appendCodexCleanerCommitted({
      stateDir,
      sessionId: "codex-cleaner-session",
      cleanPlanId: "clean-plan-1",
      mutationPlanId: "ctxcleanplan-v1-digest",
      epochId: "epoch-clean-1",
      updatedAt: "2026-08-22T00:00:02.000Z",
    });
    assert.equal(committed.outcome, "transitioned");

    const restored = await readCodexCleanerSchedule({
      stateDir,
      sessionId: "codex-cleaner-session",
    });
    assert.equal(restored.outcome, "committed");
    if (restored.outcome !== "committed") return;
    assert.equal(restored.record.mutationPlanId, "ctxcleanplan-v1-digest");
    assert.equal(restored.record.epochId, "epoch-clean-1");
    assert.equal("appliedSavedChars" in restored.record, false);
    assert.equal("evidence" in restored.record, false);

    const conflict = await appendCodexCleanerCommitted({
      stateDir,
      sessionId: "codex-cleaner-session",
      cleanPlanId: "clean-plan-1",
      mutationPlanId: "ctxcleanplan-v1-different",
      epochId: "epoch-clean-different",
      updatedAt: "2026-08-22T00:00:03.000Z",
    });
    assert.equal(conflict.outcome, "conflict");
    assert.deepEqual(conflict.reasons, ["cleaner_schedule_terminal_conflict"]);
  });
});

test("Codex cleaner scheduler fails closed on malformed or cross-session journal rows", async () => {
  await withTempState(async (stateDir) => {
    const sessionId = "codex-cleaner-session";
    await scheduleCodexCleanerPlan(scheduleParams(stateDir));
    await appendFile(
      codexCleanerScheduleJournalPath(stateDir, sessionId),
      [
        "not-json",
        JSON.stringify({
          schema: "lightrsi.codex.cleaner-schedule/v1",
          hostId: "codex",
          sessionId: "different-session",
          cleanPlanId: "clean-plan-other",
          baseRevision: "revision-other",
          selectedTaskIds: ["task-other"],
          status: "scheduled",
          scheduledAt,
          updatedAt: scheduledAt,
        }),
        "",
      ].join("\n"),
      "utf8",
    );

    const read = await readCodexCleanerSchedule({ stateDir, sessionId });
    assert.equal(read.outcome, "bypassed");
    assert.deepEqual(read.reasons, ["cleaner_schedule_journal_malformed"]);
  });
});
