import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { writeJsonFileAtomic } from "@lightrsi/host-adapter";
import {
  CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
  contextCleanTransactionFilePath,
  readContextCleanPlan,
  readContextCleanReceipt,
  saveContextCleanExecutionClaim,
  recoverContextCleanState,
  saveContextCleanPlan,
  transitionContextCleanState,
} from "../src/index.js";
import { approveContextCleanSelection, finalizeContextCleanSchedule } from "../src/orchestrator.js";
import { saveContextCleanReceipt } from "../src/clean-receipt-store.js";
import { transitionContextCleanPlan } from "../src/clean-plan-store.js";
import { cancelContextCleanPlan } from "../src/orchestrator.js";
import { samplePlan, sampleReceipt } from "./fixtures.js";

test("coordinator advances plan and receipt through the normal lifecycle", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-state-"));
  try {
    await saveContextCleanPlan({ stateDir: root, plan: samplePlan() });
    for (const status of ["approved", "scheduled", "applied"] as const) {
      const result = await transitionContextCleanState({ stateDir: root, receipt: sampleReceipt(status) });
      assert.equal(result.bypassed, false);
      assert.equal(result.value?.status, status);
    }
    assert.equal((await readContextCleanReceipt({ stateDir: root, planId: samplePlan().planId })).value?.status, "applied");
    const duplicate = await transitionContextCleanState({ stateDir: root, receipt: sampleReceipt("applied") });
    assert.equal(duplicate.outcome, "unchanged");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("recovery completes a receipt-first interrupted transition", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-recover-receipt-"));
  try {
    const plan = samplePlan();
    const receipt = sampleReceipt("approved");
    await saveContextCleanPlan({ stateDir: root, plan });
    const intent = { storeSchemaVersion: CONTEXT_CLEAN_STORE_SCHEMA_VERSION, planId: plan.planId,
      fromStatus: "analyzed", receipt, createdAt: receipt.updatedAt };
    const path = contextCleanTransactionFilePath(root, plan.planId);
    await mkdir(dirname(path), { recursive: true });
    await writeJsonFileAtomic(path, intent);
    await saveContextCleanReceipt({ stateDir: root, receipt });
    const recovered = await recoverContextCleanState({ stateDir: root, planId: plan.planId });
    assert.equal(recovered.value?.status, "approved");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("recovery completes a plan-first interrupted transition and fails closed on conflicts", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-recover-plan-"));
  try {
    const plan = samplePlan();
    const receipt = sampleReceipt("approved");
    await saveContextCleanPlan({ stateDir: root, plan });
    const intent = { storeSchemaVersion: CONTEXT_CLEAN_STORE_SCHEMA_VERSION, planId: plan.planId,
      fromStatus: "analyzed", receipt, createdAt: receipt.updatedAt };
    const path = contextCleanTransactionFilePath(root, plan.planId);
    await mkdir(dirname(path), { recursive: true });
    await writeJsonFileAtomic(path, intent);
    await transitionContextCleanPlan({ stateDir: root, planId: plan.planId,
      status: "approved", updatedAt: receipt.updatedAt });
    const recovered = await recoverContextCleanState({ stateDir: root, planId: plan.planId });
    assert.equal(recovered.value?.status, "approved");

    await transitionContextCleanPlan({ stateDir: root, planId: plan.planId,
      status: "scheduled", updatedAt: "2026-08-20T00:02:00.000Z" });
    const staleIntent = { ...intent, receipt: sampleReceipt("failed") };
    await writeJsonFileAtomic(path, staleIntent);
    const conflict = await recoverContextCleanState({ stateDir: root, planId: plan.planId });
    assert.equal(conflict.bypassed, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("recovery fails closed when an intent contains an unknown source status", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-recover-invalid-"));
  try {
    const plan = samplePlan();
    await saveContextCleanPlan({ stateDir: root, plan });
    const path = contextCleanTransactionFilePath(root, plan.planId);
    await mkdir(dirname(path), { recursive: true });
    await writeJsonFileAtomic(path, { storeSchemaVersion: CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
      planId: plan.planId, fromStatus: "future-status", receipt: sampleReceipt("approved"),
      createdAt: "2026-08-20T00:00:00.000Z" });
    const result = await recoverContextCleanState({ stateDir: root, planId: plan.planId });
    assert.equal(result.bypassed, true);
    assert.deepEqual(result.reasons, ["clean_transaction_invalid"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("identity conflicts do not leave an intent that bricks later transitions", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-identity-"));
  try {
    const plan = samplePlan();
    await saveContextCleanPlan({ stateDir: root, plan });
    const wrong = { ...sampleReceipt("approved"), hostId: "other-host" };
    const rejected = await transitionContextCleanState({ stateDir: root, receipt: wrong });
    assert.deepEqual(rejected.reasons, ["clean_transaction_identity_conflict"]);
    const valid = await transitionContextCleanState({ stateDir: root, receipt: sampleReceipt("approved") });
    assert.equal(valid.value?.status, "approved");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("recovery aborts a legacy identity-conflicting intent and permits a retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-identity-recover-"));
  try {
    const plan = samplePlan();
    await saveContextCleanPlan({ stateDir: root, plan });
    const receipt = { ...sampleReceipt("approved"), sessionId: "other-session" };
    const path = contextCleanTransactionFilePath(root, plan.planId);
    await mkdir(dirname(path), { recursive: true });
    await writeJsonFileAtomic(path, { storeSchemaVersion: CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
      planId: plan.planId, fromStatus: "analyzed", receipt, createdAt: receipt.updatedAt });
    const rejected = await recoverContextCleanState({ stateDir: root, planId: plan.planId });
    assert.deepEqual(rejected.reasons, ["clean_transaction_identity_conflict"]);
    const valid = await transitionContextCleanState({ stateDir: root, receipt: sampleReceipt("approved") });
    assert.equal(valid.value?.status, "approved");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("coordinator aborts same-status receipt content conflicts without bricking the plan", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-content-conflict-"));
  try {
    await saveContextCleanPlan({ stateDir: root, plan: samplePlan() });
    await transitionContextCleanState({ stateDir: root, receipt: sampleReceipt("approved") });
    const conflicting = { ...sampleReceipt("approved"), reasons: ["different"] };
    const rejected = await transitionContextCleanState({ stateDir: root, receipt: conflicting });
    assert.deepEqual(rejected.reasons, ["clean_transaction_receipt_content_conflict"]);
    const duplicate = await transitionContextCleanState({ stateDir: root, receipt: sampleReceipt("approved") });
    assert.equal(duplicate.outcome, "unchanged");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("coordinator supports stale from approved and scheduled", async () => {
  for (const from of ["approved", "scheduled"] as const) {
    const root = await mkdtemp(join(tmpdir(), `lightrsi-clean-stale-${from}-`));
    try {
      await saveContextCleanPlan({ stateDir: root, plan: samplePlan() });
      await transitionContextCleanState({ stateDir: root, receipt: sampleReceipt("approved") });
      if (from === "scheduled") {
        await transitionContextCleanState({ stateDir: root, receipt: sampleReceipt("scheduled") });
      }
      const stale = await transitionContextCleanState({ stateDir: root, receipt: sampleReceipt("stale") });
      assert.equal(stale.value?.status, "stale");
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test("approval retry replays same selection without changing receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-approval-retry-"));
  try {
    const plan = samplePlan();
    await saveContextCleanPlan({ stateDir: root, plan });
    const request = {
      schemaVersion: 1 as const,
      cleanPlanId: plan.planId,
      hostId: plan.hostId,
      sessionId: plan.sessionId,
      baseRevision: plan.baseRevision,
      approvedAt: "2026-08-20T00:01:00.000Z",
      selectedTaskIds: ["task-a"],
    };
    const first = await approveContextCleanSelection({ stateDir: root, request });
    const retry = await approveContextCleanSelection({
      stateDir: root,
      request: { ...request, approvedAt: "2026-08-20T00:02:00.000Z" },
    });
    assert.deepEqual(retry, first);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("schedule retry replays later outcome without changing receipt", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-schedule-retry-"));
  try {
    const plan = samplePlan();
    await saveContextCleanPlan({ stateDir: root, plan });
    const approved = await approveContextCleanSelection({
      stateDir: root,
      request: {
        schemaVersion: 1,
        cleanPlanId: plan.planId,
        hostId: plan.hostId,
        sessionId: plan.sessionId,
        baseRevision: plan.baseRevision,
        approvedAt: "2026-08-20T00:01:00.000Z",
        selectedTaskIds: ["task-a"],
      },
    });
    const request = {
      cleanPlanId: plan.planId,
      hostId: plan.hostId,
      sessionId: plan.sessionId,
      baseRevision: plan.baseRevision,
      selectedTaskIds: ["task-a"],
    };
    const first = await finalizeContextCleanSchedule({
      stateDir: root,
      request: { ...request, scheduledAt: "2026-08-20T00:02:00.000Z" },
    });
    const retry = await finalizeContextCleanSchedule({
      stateDir: root,
      request: { ...request, scheduledAt: "2026-08-20T00:03:00.000Z" },
    });
    assert.equal(approved.status, "approved");
    assert.deepEqual(retry, first);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("cancel wins queued claim admission under the plan lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-cancel-claim-race-"));
  try {
    const plan = samplePlan();
    await saveContextCleanPlan({ stateDir: root, plan });
    await transitionContextCleanState({ stateDir: root, receipt: sampleReceipt("approved") });
    const claim = {
      schemaVersion: 1 as const,
      claimId: "claim-race",
      planId: plan.planId,
      hostId: plan.hostId,
      sessionId: plan.sessionId,
      selectedTaskIds: ["task-a"],
      mutationPlanId: "mutation-race",
      analysisRevision: plan.baseRevision,
      executionRevision: plan.baseRevision,
      ownerToken: "owner-race",
      claimedAt: "2026-08-20T00:01:00.000Z",
      dispatchState: "dispatch_not_started" as const,
    };
    const cancellation = cancelContextCleanPlan({
      stateDir: root,
      planId: plan.planId,
      now: "2026-08-20T00:02:00.000Z",
    });
    await delay(0);
    const admission = saveContextCleanExecutionClaim({ stateDir: root, claim });
    const [cancelResult, claimResult] = await Promise.allSettled([cancellation, admission]);
    const finalPlan = await readContextCleanPlan({ stateDir: root, planId: plan.planId });
    assert.equal(finalPlan.value?.status === "cancelled" || finalPlan.value?.status === "approved", true);
    if (finalPlan.value?.status === "cancelled") {
      assert.equal(cancelResult.status, "fulfilled");
      assert.equal(claimResult.status, "fulfilled");
      if (claimResult.status === "fulfilled") {
        assert.deepEqual(claimResult.value.reasons, ["clean_claim_plan_terminal"]);
      }
    } else {
      assert.equal(cancelResult.status, "rejected");
      assert.equal(claimResult.status, "fulfilled");
      if (cancelResult.status === "rejected") assert.match(String(cancelResult.reason), /execution_in_progress/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("claim admission recovers pending cancellation intent before creating a claim", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-claim-recovery-"));
  try {
    const plan = samplePlan();
    await saveContextCleanPlan({ stateDir: root, plan });
    await transitionContextCleanState({ stateDir: root, receipt: sampleReceipt("approved") });
    const cancelled = {
      ...sampleReceipt("cancelled"),
      updatedAt: "2026-08-20T00:03:00.000Z",
    };
    await writeJsonFileAtomic(contextCleanTransactionFilePath(root, plan.planId), {
      storeSchemaVersion: CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
      planId: plan.planId,
      fromStatus: "approved",
      receipt: cancelled,
      createdAt: cancelled.updatedAt,
    });
    const claim = {
      schemaVersion: 1 as const,
      claimId: "claim-after-cancel",
      planId: plan.planId,
      hostId: plan.hostId,
      sessionId: plan.sessionId,
      selectedTaskIds: ["task-a"],
      mutationPlanId: "mutation-after-cancel",
      analysisRevision: plan.baseRevision,
      executionRevision: plan.baseRevision,
      ownerToken: "owner-after-cancel",
      claimedAt: "2026-08-20T00:04:00.000Z",
      dispatchState: "dispatch_not_started" as const,
    };

    const result = await saveContextCleanExecutionClaim({ stateDir: root, claim });
    assert.equal(result.outcome, "bypassed");
    assert.deepEqual(result.reasons, ["clean_claim_plan_terminal"]);
    assert.equal((await readContextCleanPlan({ stateDir: root, planId: plan.planId })).value?.status, "cancelled");
  } finally { await rm(root, { recursive: true, force: true }); }
});
