import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
  contextCleanReceiptFilePath,
  readContextCleanReceipt,
  saveContextCleanPlan,
} from "../src/index.js";
import { saveContextCleanReceipt } from "../src/clean-receipt-store.js";
import { transitionContextCleanPlan } from "../src/clean-plan-store.js";
import { samplePlan, sampleReceipt } from "./fixtures.js";

test("receipt store persists transitions and rejects identity changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-receipt-"));
  try {
    await saveContextCleanPlan({ stateDir: root, plan: samplePlan() });
    const analyzed = sampleReceipt("analyzed");
    assert.equal((await saveContextCleanReceipt({ stateDir: root, receipt: analyzed })).outcome, "stored");
    assert.equal((await saveContextCleanReceipt({ stateDir: root, receipt: analyzed })).outcome, "unchanged");
    const approved = { ...sampleReceipt("approved"), updatedAt: "2026-08-20T00:01:00.000Z" };
    assert.equal((await saveContextCleanReceipt({ stateDir: root, receipt: approved })).outcome, "transitioned");
    await transitionContextCleanPlan({ stateDir: root, planId: samplePlan().planId,
      status: "approved", updatedAt: approved.updatedAt });
    const changedTargets = { ...sampleReceipt("scheduled"), selectedTaskIds: ["task-other"] };
    assert.equal((await saveContextCleanReceipt({ stateDir: root, receipt: changedTargets })).outcome, "conflict");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("receipt reader rejects applied-field mixing and missing applied evidence at runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-receipt-json-"));
  try {
    const receipt = sampleReceipt("scheduled");
    const path = contextCleanReceiptFilePath(root, receipt.planId);
    await mkdir(dirname(path), { recursive: true });
    const stored = { storeSchemaVersion: CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
      receipt: { ...receipt } as Record<string, unknown> };
    stored.receipt.appliedSavedTokens = 10;
    stored.receipt.appliedSavedChars = 40;
    await writeFile(path, JSON.stringify(stored), "utf8");
    assert.equal((await readContextCleanReceipt({ stateDir: root, planId: receipt.planId })).bypassed, true);

    stored.receipt = { ...sampleReceipt("applied") } as unknown as Record<string, unknown>;
    delete stored.receipt.evidence;
    await writeFile(path, JSON.stringify(stored), "utf8");
    assert.equal((await readContextCleanReceipt({ stateDir: root, planId: receipt.planId })).bypassed, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("receipt reader strips unknown fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-receipt-future-"));
  try {
    const receipt = sampleReceipt("applied");
    const path = contextCleanReceiptFilePath(root, receipt.planId);
    await mkdir(dirname(path), { recursive: true });
    const stored = { storeSchemaVersion: CONTEXT_CLEAN_STORE_SCHEMA_VERSION,
      receipt: { ...receipt } as Record<string, unknown> };
    stored.receipt.futureReceiptField = "ignored";
    await writeFile(path, JSON.stringify(stored), "utf8");
    const read = await readContextCleanReceipt({ stateDir: root, planId: receipt.planId });
    assert.equal(read.bypassed, false);
    assert.equal("futureReceiptField" in (read.value ?? {}), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("bare receipt writes require a matching non-terminal plan transition", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-receipt-plan-"));
  try {
    const missing = await saveContextCleanReceipt({ stateDir: root, receipt: sampleReceipt("approved") });
    assert.deepEqual(missing.reasons, ["clean_receipt_plan_missing"]);

    const plan = samplePlan();
    await saveContextCleanPlan({ stateDir: root, plan });
    await transitionContextCleanPlan({ stateDir: root, planId: plan.planId,
      status: "cancelled", updatedAt: "2026-08-20T00:01:00.000Z" });
    const applied = await saveContextCleanReceipt({ stateDir: root, receipt: sampleReceipt("applied") });
    assert.equal(applied.bypassed, true);
    assert.match(applied.reasons[0] ?? "", /plan_status_conflict/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("analyzed to approved freezes the user's first selected task ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-receipt-selection-"));
  try {
    await saveContextCleanPlan({ stateDir: root, plan: samplePlan() });
    assert.deepEqual(sampleReceipt("analyzed").selectedTaskIds, []);
    await saveContextCleanReceipt({ stateDir: root, receipt: sampleReceipt("analyzed") });
    const approved = await saveContextCleanReceipt({ stateDir: root, receipt: sampleReceipt("approved") });
    assert.equal(approved.bypassed, false);
    assert.deepEqual(approved.value?.selectedTaskIds, ["task-a"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("receipt selections must belong to the plan and remain selectable", async () => {
  const root = await mkdtemp(join(tmpdir(), "lightrsi-clean-receipt-selection-validation-"));
  try {
    const plan = samplePlan();
    await saveContextCleanPlan({ stateDir: root, plan });

    const unknown = await saveContextCleanReceipt({
      stateDir: root,
      receipt: { ...sampleReceipt("approved"), selectedTaskIds: ["task-missing"] },
    });
    assert.deepEqual(unknown.reasons, ["clean_receipt_selected_task_unknown"]);

    const protectedTask = await saveContextCleanReceipt({
      stateDir: root,
      receipt: { ...sampleReceipt("approved"), selectedTaskIds: ["task-current"] },
    });
    assert.deepEqual(protectedTask.reasons, ["clean_receipt_selected_task_not_selectable"]);

    const analyzedSelection = await saveContextCleanReceipt({
      stateDir: root,
      receipt: { ...sampleReceipt("analyzed"), selectedTaskIds: ["task-a"] },
    });
    assert.deepEqual(analyzedSelection.reasons, ["clean_receipt_analyzed_selection_not_empty"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
