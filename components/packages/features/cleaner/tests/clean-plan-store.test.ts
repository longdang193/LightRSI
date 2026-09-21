import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  CONTEXT_CLEAN_STATUS_TRANSITIONS,
  canTransitionContextCleanStatus,
  contextCleanPlanFilePath,
  isTerminalContextCleanStatus,
  readContextCleanPlan,
  saveContextCleanPlan,
  sameCanonicalValue,
} from "../src/index.js";
import {
  readContextCleanExecutionClaim,
  saveContextCleanExecutionClaim,
} from "../src/clean-claim-store.js";
import { transitionContextCleanPlan } from "../src/clean-plan-store.js";
import { samplePlan } from "./fixtures.js";

async function stateDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "lightrsi-clean-plan-"));
}

test("status transition contract is frozen and terminal states cannot advance", () => {
  assert.deepEqual(CONTEXT_CLEAN_STATUS_TRANSITIONS.analyzed, ["approved", "cancelled", "failed"]);
  assert.equal(canTransitionContextCleanStatus("analyzed", "approved"), true);
  assert.equal(canTransitionContextCleanStatus("analyzed", "applied"), false);
  assert.equal(canTransitionContextCleanStatus("applied", "applied"), true);
  assert.equal(isTerminalContextCleanStatus("applied"), true);
  assert.equal(isTerminalContextCleanStatus("scheduled"), false);
});

test("canonical value comparison ignores object key insertion order", () => {
  assert.equal(
    sameCanonicalValue(
      { outer: { second: 2, first: 1 }, list: [{ beta: true, alpha: false }] },
      { list: [{ alpha: false, beta: true }], outer: { first: 1, second: 2 } },
    ),
    true,
  );
});

test("plan store is idempotent and rejects plan id content conflicts", async () => {
  const root = await stateDir();
  try {
    const plan = samplePlan();
    assert.equal((await saveContextCleanPlan({ stateDir: root, plan })).outcome, "stored");
    assert.equal((await saveContextCleanPlan({ stateDir: root, plan })).outcome, "unchanged");
    const conflict = { ...plan, baseRevision: "different-revision" };
    const result = await saveContextCleanPlan({ stateDir: root, plan: conflict });
    assert.equal(result.outcome, "conflict");
    assert.equal(result.bypassed, true);
    assert.deepEqual((await readContextCleanPlan({ stateDir: root, planId: plan.planId })).value?.plan, plan);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("concurrent writers cannot overwrite one plan id with different content", async () => {
  const root = await stateDir();
  try {
    const plan = samplePlan();
    const other = { ...plan, baseRevision: "concurrent-revision" };
    const results = await Promise.all([
      saveContextCleanPlan({ stateDir: root, plan }),
      saveContextCleanPlan({ stateDir: root, plan: other }),
    ]);
    assert.equal(results.filter((result) => result.outcome === "stored").length, 1);
    assert.equal(results.filter((result) => result.outcome === "conflict").length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("plan store permits legal transitions and fails closed after a terminal state", async () => {
  const root = await stateDir();
  try {
    const plan = samplePlan();
    await saveContextCleanPlan({ stateDir: root, plan });
    const approved = await transitionContextCleanPlan({ stateDir: root, planId: plan.planId,
      status: "approved", updatedAt: "2026-08-20T00:01:00.000Z" });
    assert.equal(approved.value?.status, "approved");
    const cancelled = await transitionContextCleanPlan({ stateDir: root, planId: plan.planId,
      status: "cancelled", updatedAt: "2026-08-20T00:02:00.000Z" });
    assert.equal(cancelled.value?.status, "cancelled");
    const invalid = await transitionContextCleanPlan({ stateDir: root, planId: plan.planId,
      status: "approved", updatedAt: "2026-08-20T00:03:00.000Z" });
    assert.equal(invalid.bypassed, true);
    assert.match(invalid.reasons[0] ?? "", /invalid_transition/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("plan store rejects a non-ISO update timestamp before writing", async () => {
  const root = await stateDir();
  try {
    const plan = samplePlan();
    assert.equal((await saveContextCleanPlan({ stateDir: root, plan, updatedAt: "not-a-time" })).bypassed, true);
    await saveContextCleanPlan({ stateDir: root, plan });
    const result = await transitionContextCleanPlan({ stateDir: root, planId: plan.planId,
      status: "approved", updatedAt: "not-a-time" });
    assert.deepEqual(result.reasons, ["clean_plan_updated_at_invalid"]);
    assert.equal((await readContextCleanPlan({ stateDir: root, planId: plan.planId })).value?.status, "analyzed");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("plan reader ignores unknown fields but fails closed for corrupt data and schema", async () => {
  const root = await stateDir();
  try {
    const plan = samplePlan();
    await saveContextCleanPlan({ stateDir: root, plan });
    const path = contextCleanPlanFilePath(root, plan.planId);
    const stored = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    stored.futureField = { supportedBy: "newer-version" };
    (stored.plan as Record<string, unknown>).futurePlanField = true;
    await writeFile(path, JSON.stringify(stored), "utf8");
    const compatible = await readContextCleanPlan({ stateDir: root, planId: plan.planId });
    assert.equal(compatible.bypassed, false);
    assert.equal("futurePlanField" in (compatible.value?.plan ?? {}), false);

    await writeFile(path, "{broken", "utf8");
    assert.equal((await readContextCleanPlan({ stateDir: root, planId: plan.planId })).bypassed, true);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ ...stored, storeSchemaVersion: 999 }), "utf8");
    assert.equal((await readContextCleanPlan({ stateDir: root, planId: plan.planId })).bypassed, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("plan store preserves attribution status across save and read", async () => {
  const root = await stateDir();
  try {
    const plan = { ...samplePlan(), attributionStatus: "waiting" as const };
    assert.equal((await saveContextCleanPlan({ stateDir: root, plan })).bypassed, false);
    assert.equal((await readContextCleanPlan({ stateDir: root, planId: plan.planId })).value?.plan.attributionStatus, "waiting");
    const path = contextCleanPlanFilePath(root, plan.planId);
    const stored = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    (stored.plan as Record<string, unknown>).attributionStatus = "unknown";
    await writeFile(path, JSON.stringify(stored), "utf8");
    assert.equal((await readContextCleanPlan({ stateDir: root, planId: plan.planId })).bypassed, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("execution claim is durable, revision-fenced, and single-owner", async () => {
  const root = await stateDir();
  try {
    const plan = samplePlan();
    await saveContextCleanPlan({ stateDir: root, plan });
    const claim = {
      schemaVersion: 1 as const,
      claimId: "claim-1",
      planId: plan.planId,
      hostId: plan.hostId,
      sessionId: plan.sessionId,
      selectedTaskIds: ["task-a"],
      mutationPlanId: "mutation-1",
      analysisRevision: plan.baseRevision,
       executionRevision: "rev-2",
      ownerToken: "owner-1",
      claimedAt: "2026-08-20T00:00:00.000Z",
      dispatchState: "dispatch_not_started" as const,
    };
    assert.equal((await saveContextCleanExecutionClaim({ stateDir: root, claim })).outcome, "stored");
    assert.equal((await saveContextCleanExecutionClaim({ stateDir: root, claim })).outcome, "unchanged");
    assert.equal((await readContextCleanExecutionClaim({ stateDir: root, planId: plan.planId })).value?.claimId, "claim-1");
    const other = { ...claim, claimId: "claim-2", ownerToken: "owner-2" };
    const rejected = await saveContextCleanExecutionClaim({ stateDir: root, claim: other });
    assert.equal(rejected.outcome, "conflict");
    assert.equal(rejected.bypassed, true);
    assert.equal(rejected.value?.claimId, "claim-1");
  } finally { await rm(root, { recursive: true, force: true }); }
});
