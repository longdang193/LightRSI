import assert from "node:assert/strict";
import test from "node:test";

import {
  decideContextCleanRecovery,
  type ContextCleanExecutionClaim,
} from "../src/index.js";

const claim = (dispatchState: ContextCleanExecutionClaim["dispatchState"]): ContextCleanExecutionClaim => ({
  schemaVersion: 1,
  claimId: "claim-1",
  planId: "plan-1",
  hostId: "codex",
  sessionId: "session-1",
  selectedTaskIds: ["task-1"],
  mutationPlanId: "mutation-1",
  analysisRevision: "rev-1",
  executionRevision: "rev-1",
  ownerToken: "owner-1",
  claimedAt: "2026-08-20T00:00:00.000Z",
  dispatchState,
});

test("recovery fences continuation before provider dispatch", () => {
  assert.equal(decideContextCleanRecovery({ claim: claim("dispatch_not_started") }), "continue_before_dispatch");
});

test("recovery never authorizes resend after uncertain dispatch", () => {
  assert.equal(decideContextCleanRecovery({ claim: claim("dispatch_started") }), "recovery_required");
});

test("committed host evidence reconstructs missing receipt", () => {
  assert.equal(decideContextCleanRecovery({ claim: claim("host_committed") }), "reconstruct_receipt");
});

test("recovery-required claim stays blocked even with no evidence", () => {
  assert.equal(decideContextCleanRecovery({ claim: claim("recovery_required") }), "recovery_required");
});
