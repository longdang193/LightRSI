import assert from "node:assert/strict";
import test from "node:test";

import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  MINIMAL_HOST_CAPABILITIES,
  canSupportLifecycleEvictionEquivalently,
  type ContextMutationPlan,
  type ContextRewriteResult,
  type ContextRewriteValidation,
  type ModelContextRewriteBackend,
  type ModelContextRewriteMode,
  type ModelContextSnapshot,
} from "../src/index.js";

const snapshot: ModelContextSnapshot = {
  schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  hostId: "claude-code",
  sessionId: "session-1",
  revision: "revision-1",
  items: [
    {
      stableId: "item-1",
      kind: "user",
      fingerprint: "fp-abc",
      chars: 10,
    },
  ],
};

const plan: ContextMutationPlan = {
  schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  planId: "plan-1",
  hostId: "claude-code",
  sessionId: "session-1",
  baseRevision: "revision-1",
  sourceModuleId: "eviction",
  operations: [
    {
      id: "op-1",
      type: "remove",
      targetItemIds: ["item-1"],
      rationale: "evicted task",
      estimatedSavedChars: 10,
    },
  ],
  createdAt: "2026-07-30T00:00:00.000Z",
};

const validation: ContextRewriteValidation = {
  valid: true,
  applicableOperationIds: ["op-1"],
  deferredOperationIds: [],
  reasons: [],
};

function createResult(
  mode: ModelContextRewriteMode,
): ContextRewriteResult {
  return {
    schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    mode,
    planId: plan.planId,
    applied: true,
    changed: true,
    previousRevision: snapshot.revision,
    nextRevision: "revision-2",
    appliedOperationIds: ["op-1"],
    deferredOperationIds: [],
    removedItemIds: ["item-1"],
    savedChars: 10,
    fallbackUsed: false,
  };
}

type FakeRequest = {
  input: string;
};

const claudeBackend: ModelContextRewriteBackend<FakeRequest> = {
  hostId: "claude-code",
  mode: "request_overlay",
  async readSnapshot() {
    return snapshot;
  },
  async validate() {
    return validation;
  },
  async apply({ request }) {
    return { request, result: createResult(this.mode) };
  },
};

const codexBackend: ModelContextRewriteBackend<FakeRequest> = {
  hostId: "codex",
  mode: "response_chain_rebase",
  async readSnapshot() {
    return { ...snapshot, hostId: "codex" };
  },
  async validate() {
    return validation;
  },
  async apply({ request }) {
    return { request, result: createResult(this.mode) };
  },
};

test("schema version is locked to 1", () => {
  assert.equal(MODEL_CONTEXT_REWRITE_SCHEMA_VERSION, 1);
});

test("Claude can implement the request overlay contract", async () => {
  const request = { input: "hello" };
  const result = await claudeBackend.apply({ snapshot, plan, request });

  assert.equal(claudeBackend.mode, "request_overlay");
  assert.equal(result.request, request);
  assert.equal(result.result.planId, plan.planId);
  assert.deepEqual(result.result.removedItemIds, ["item-1"]);
  assert.equal(result.result.savedChars, 10);
});

test("Codex can implement the response chain rebase contract", async () => {
  const request = { input: "hello" };
  const result = await codexBackend.apply({ snapshot, plan, request });

  assert.equal(codexBackend.mode, "response_chain_rebase");
  assert.equal(result.request, request);
  assert.equal(result.result.planId, plan.planId);
});

test("context rewrite capabilities default to disabled", () => {
  assert.equal(MINIMAL_HOST_CAPABILITIES.modelContextRewriteMode, "none");
  assert.equal(MINIMAL_HOST_CAPABILITIES.supportsPersistentRewritePlans, false);
  assert.equal(MINIMAL_HOST_CAPABILITIES.supportsRewriteRollback, false);
});

test("persistent rewrite modes support lifecycle eviction", () => {
  const requestOverlayCapabilities = {
    ...MINIMAL_HOST_CAPABILITIES,
    modelContextRewriteMode: "request_overlay" as const,
    supportsPersistentRewritePlans: true,
  };
  const legacyTranscriptCapabilities = {
    ...MINIMAL_HOST_CAPABILITIES,
    supportsTranscriptRead: true,
    supportsTranscriptRewrite: true,
  };

  assert.equal(
    canSupportLifecycleEvictionEquivalently(MINIMAL_HOST_CAPABILITIES),
    false,
  );
  assert.equal(
    canSupportLifecycleEvictionEquivalently(requestOverlayCapabilities),
    true,
  );
  assert.equal(canSupportLifecycleEvictionEquivalently(legacyTranscriptCapabilities), true);
});
