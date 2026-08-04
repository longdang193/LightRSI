import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  CONTEXT_MUTATION_PLAN_STORE_SCHEMA_VERSION,
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  contextMutationPlanFilePath,
  contextMutationPlanLockPath,
  contextMutationPlanQuarantineDir,
  contextMutationPlanSessionRoot,
  contextMutationPlanStatusDir,
  loadActiveContextMutationPlans,
  loadContextMutationPlans,
  markContextMutationPlanApplied,
  markContextMutationPlanFailed,
  saveActiveContextMutationPlan,
  type ContextMutationPlan,
} from "../src/index.js";

function createPlan(
  planId: string,
  sessionId = "session-1",
): ContextMutationPlan {
  return {
    schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    planId,
    hostId: "test-host",
    sessionId,
    baseRevision: "ctxrev-v1-base",
    sourceModuleId: "eviction",
    operations: [
      {
        id: `operation-${planId}`,
        type: "remove",
        targetItemIds: [`item-${planId}`],
        targetItemFingerprints: {
          [`item-${planId}`]: `fingerprint-${planId}`,
        },
        rationale: "evicted completed task",
        estimatedSavedChars: 10,
      },
    ],
    createdAt: "2026-08-02T00:00:00.000Z",
  };
}

test("plan store schema version is locked to 1", () => {
  assert.equal(CONTEXT_MUTATION_PLAN_STORE_SCHEMA_VERSION, 1);
});

test("active plans persist idempotently and recover after restart", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightmem2-plan-store-restart-"));
  try {
    const plan = createPlan("plan-1");
    const first = await saveActiveContextMutationPlan({
      stateDir,
      plan,
      storedAt: "2026-08-02T00:01:00.000Z",
    });
    const duplicate = await saveActiveContextMutationPlan({
      stateDir,
      plan: { ...plan, operations: plan.operations.map((operation) => ({ ...operation })) },
      storedAt: "2026-08-02T00:02:00.000Z",
    });
    const recovered = await loadActiveContextMutationPlans({
      stateDir,
      sessionId: plan.sessionId,
    });

    assert.equal(first.outcome, "stored");
    assert.equal(duplicate.outcome, "unchanged");
    assert.equal(duplicate.status, "active");
    assert.equal(recovered.bypassed, false);
    assert.deepEqual(recovered.plans.map((entry) => entry.planId), ["plan-1"]);

    const files = await readdir(
      contextMutationPlanStatusDir(stateDir, plan.sessionId, "active"),
    );
    assert.equal(files.filter((name) => name.endsWith(".json")).length, 1);
    assert.equal(files.some((name) => name.endsWith(".tmp")), false);

    const sessionRoot = contextMutationPlanSessionRoot(stateDir, plan.sessionId);
    await assert.rejects(access(join(sessionRoot, "latest.json")));
    await assert.rejects(access(join(sessionRoot, "revisions.jsonl")));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("active plans move atomically into separate terminal states", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightmem2-plan-store-status-"));
  try {
    const appliedPlan = createPlan("plan-applied");
    const failedPlan = createPlan("plan-failed");
    await saveActiveContextMutationPlan({ stateDir, plan: appliedPlan });
    await saveActiveContextMutationPlan({ stateDir, plan: failedPlan });

    const applied = await markContextMutationPlanApplied({
      stateDir,
      sessionId: appliedPlan.sessionId,
      planId: appliedPlan.planId,
    });
    const failed = await markContextMutationPlanFailed({
      stateDir,
      sessionId: failedPlan.sessionId,
      planId: failedPlan.planId,
    });
    const appliedAgain = await markContextMutationPlanApplied({
      stateDir,
      sessionId: appliedPlan.sessionId,
      planId: appliedPlan.planId,
    });
    const terminalReplay = await saveActiveContextMutationPlan({
      stateDir,
      plan: appliedPlan,
    });

    assert.equal(applied.outcome, "transitioned");
    assert.equal(failed.outcome, "transitioned");
    assert.equal(appliedAgain.outcome, "unchanged");
    assert.equal(terminalReplay.outcome, "unchanged");
    assert.equal(terminalReplay.status, "applied");

    const active = await loadActiveContextMutationPlans({
      stateDir,
      sessionId: appliedPlan.sessionId,
    });
    const appliedPlans = await loadContextMutationPlans({
      stateDir,
      sessionId: appliedPlan.sessionId,
      status: "applied",
    });
    const failedPlans = await loadContextMutationPlans({
      stateDir,
      sessionId: appliedPlan.sessionId,
      status: "failed",
    });
    assert.deepEqual(active.plans, []);
    assert.deepEqual(appliedPlans.plans.map((plan) => plan.planId), ["plan-applied"]);
    assert.deepEqual(failedPlans.plans.map((plan) => plan.planId), ["plan-failed"]);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("session lock serializes concurrent active plan writes", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightmem2-plan-store-concurrent-"));
  try {
    const plans = Array.from({ length: 12 }, (_, index) =>
      createPlan(`plan-${String(index).padStart(2, "0")}`));
    const results = await Promise.all(plans.map((plan) =>
      saveActiveContextMutationPlan({
        stateDir,
        plan,
        lock: { lockTimeoutMs: 5_000, lockRetryMs: 2 },
      })));
    const loaded = await loadActiveContextMutationPlans({
      stateDir,
      sessionId: "session-1",
    });

    assert.equal(results.every((result) => result.outcome === "stored"), true);
    assert.equal(loaded.bypassed, false);
    assert.deepEqual(
      loaded.plans.map((plan) => plan.planId),
      plans.map((plan) => plan.planId),
    );
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("corrupt active plan is quarantined and causes one safe bypass", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightmem2-plan-store-corrupt-"));
  try {
    const validPlan = createPlan("plan-valid");
    const corruptPlan = createPlan("plan-corrupt");
    await saveActiveContextMutationPlan({ stateDir, plan: validPlan });
    const corruptPath = contextMutationPlanFilePath(
      stateDir,
      corruptPlan.sessionId,
      "active",
      corruptPlan.planId,
    );
    await mkdir(dirname(corruptPath), { recursive: true });
    await writeFile(corruptPath, "{not-json", "utf8");

    const bypassed = await loadActiveContextMutationPlans({
      stateDir,
      sessionId: validPlan.sessionId,
    });
    assert.equal(bypassed.bypassed, true);
    assert.deepEqual(bypassed.plans, []);
    assert.equal(bypassed.quarantinedFileCount, 1);
    assert.ok(bypassed.reasons.includes("corrupt_plan_quarantined"));

    const quarantineFiles = await readdir(
      contextMutationPlanQuarantineDir(
        stateDir,
        validPlan.sessionId,
        "active",
      ),
    );
    assert.equal(quarantineFiles.length, 1);

    const recovered = await loadActiveContextMutationPlans({
      stateDir,
      sessionId: validPlan.sessionId,
    });
    assert.equal(recovered.bypassed, false);
    assert.deepEqual(recovered.plans.map((plan) => plan.planId), ["plan-valid"]);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("corrupt terminal conflict is quarantined before active plans resume", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightmem2-plan-store-terminal-corrupt-"));
  try {
    const plan = createPlan("plan-terminal-corrupt");
    await saveActiveContextMutationPlan({ stateDir, plan });
    const corruptTerminalPath = contextMutationPlanFilePath(
      stateDir,
      plan.sessionId,
      "applied",
      plan.planId,
    );
    await mkdir(dirname(corruptTerminalPath), { recursive: true });
    await writeFile(corruptTerminalPath, "{not-json", "utf8");

    const bypassed = await loadActiveContextMutationPlans({
      stateDir,
      sessionId: plan.sessionId,
    });
    assert.equal(bypassed.bypassed, true);
    assert.deepEqual(bypassed.plans, []);
    assert.equal(bypassed.quarantinedFileCount, 1);
    assert.deepEqual(bypassed.reasons, ["corrupt_plan_quarantined"]);

    const recovered = await loadActiveContextMutationPlans({
      stateDir,
      sessionId: plan.sessionId,
    });
    assert.equal(recovered.bypassed, false);
    assert.deepEqual(recovered.plans.map((entry) => entry.planId), [plan.planId]);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("unsupported future schema bypasses without quarantining the file", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightmem2-plan-store-future-"));
  try {
    const plan = createPlan("plan-future");
    const path = contextMutationPlanFilePath(
      stateDir,
      plan.sessionId,
      "active",
      plan.planId,
    );
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({
      schemaVersion: 2,
      storedAt: "2026-08-02T00:01:00.000Z",
      plan,
      futureField: true,
    }), "utf8");

    const loaded = await loadActiveContextMutationPlans({
      stateDir,
      sessionId: plan.sessionId,
    });
    assert.equal(loaded.bypassed, true);
    assert.deepEqual(loaded.reasons, ["unsupported_schema"]);
    assert.equal(loaded.quarantinedFileCount, 0);
    assert.equal(JSON.parse(await readFile(path, "utf8")).schemaVersion, 2);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("stale session lock is recovered while a live lock causes bypass", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightmem2-plan-store-lock-"));
  try {
    const stalePlan = createPlan("plan-after-stale");
    const lockPath = contextMutationPlanLockPath(stateDir, stalePlan.sessionId);
    await mkdir(lockPath, { recursive: true });
    await writeFile(join(lockPath, "owner.json"), JSON.stringify({
      token: "stale-owner",
      pid: 2_147_483_647,
      hostname: hostname(),
      createdAt: "2026-08-01T00:00:00.000Z",
    }), "utf8");

    const recovered = await saveActiveContextMutationPlan({
      stateDir,
      plan: stalePlan,
      lock: { lockTimeoutMs: 50, lockRetryMs: 2 },
    });
    assert.equal(recovered.outcome, "stored");

    await mkdir(lockPath, { recursive: true });
    await writeFile(join(lockPath, "owner.json"), JSON.stringify({
      token: "live-owner",
      pid: process.pid,
      hostname: hostname(),
      createdAt: new Date().toISOString(),
    }), "utf8");
    const blocked = await saveActiveContextMutationPlan({
      stateDir,
      plan: createPlan("plan-blocked"),
      lock: { lockTimeoutMs: 20, lockRetryMs: 2 },
    });
    assert.equal(blocked.outcome, "bypassed");
    assert.deepEqual(blocked.reasons, ["session_lock_unavailable"]);
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});

test("adapter-owned replacement payloads are rejected before persistence", async () => {
  const stateDir = await mkdtemp(join(tmpdir(), "lightmem2-plan-store-payload-"));
  try {
    const plan = createPlan("plan-raw-payload");
    const unsafePlan = {
      ...plan,
      operations: [{
        ...plan.operations[0]!,
        replacementItems: [{ rawHostMessage: "secret" }],
      }],
    } as unknown as ContextMutationPlan;
    const result = await saveActiveContextMutationPlan({
      stateDir,
      plan: unsafePlan,
    });

    assert.equal(result.outcome, "bypassed");
    assert.deepEqual(result.reasons, ["invalid_plan"]);
    await assert.rejects(access(contextMutationPlanFilePath(
      stateDir,
      plan.sessionId,
      "active",
      plan.planId,
    )));
  } finally {
    await rm(stateDir, { recursive: true, force: true });
  }
});
