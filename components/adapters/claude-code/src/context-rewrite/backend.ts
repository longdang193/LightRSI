import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  type ContextMutationPlan,
  type ContextRewriteResult,
  type ContextRewriteValidation,
  type ModelContextRewriteBackend,
  type ModelContextSnapshot,
} from "@lightmem2/host-adapter";
import type { RuntimeMessage } from "@lightmem2/kernel";

import { buildClaudeContextSnapshot } from "./snapshot.js";

const CLAUDE_HOST_ID = "claude-code";

export type ClaudeOverlayRequest = {
  sessionId: string;
  revision: string;
  messages: RuntimeMessage[];
};

// Front-checks that must all hold before any operation may apply. Mirrors the
// openclaw reference backend, minus canonical-state specifics.
function fatalReasonsFor(
  snapshot: ModelContextSnapshot,
  plan: ContextMutationPlan,
): string[] {
  const reasons: string[] = [];
  if (plan.schemaVersion !== MODEL_CONTEXT_REWRITE_SCHEMA_VERSION) {
    reasons.push(`unsupported schema version: ${plan.schemaVersion}`);
  }
  if (snapshot.hostId !== CLAUDE_HOST_ID || plan.hostId !== CLAUDE_HOST_ID) {
    reasons.push("hostId must be claude-code");
  }
  if (plan.sessionId !== snapshot.sessionId) {
    reasons.push("plan sessionId does not match snapshot");
  }
  if (plan.baseRevision !== snapshot.revision) {
    reasons.push("plan baseRevision does not match snapshot");
  }
  const ids = new Set(snapshot.items.map((item) => item.stableId));
  if (ids.size !== snapshot.items.length) {
    reasons.push("snapshot item ids must be unique");
  }
  return reasons;
}

export const claudeContextRewriteBackend: ModelContextRewriteBackend<ClaudeOverlayRequest> = {
  hostId: CLAUDE_HOST_ID,
  mode: "request_overlay",

  async readSnapshot({ sessionId, request }) {
    return buildClaudeContextSnapshot({
      sessionId,
      revision: request.revision,
      messages: request.messages,
    });
  },

  async validate({ snapshot, plan }) {
    const fatal = fatalReasonsFor(snapshot, plan);
    if (fatal.length > 0) {
      return {
        valid: false,
        applicableOperationIds: [],
        deferredOperationIds: plan.operations.map((op) => op.id),
        reasons: fatal,
      };
    }

    // An operation is applicable only if every target item still exists in the
    // snapshot and its fingerprint matches (proves the target survived any
    // revision drift). Otherwise it is deferred, never fuzzily applied.
    const itemById = new Map(snapshot.items.map((item) => [item.stableId, item]));
    const applicableOperationIds: string[] = [];
    const deferredOperationIds: string[] = [];
    const reasons: string[] = [];

    for (const op of plan.operations) {
      const targetsOk = op.targetItemIds.every((id) => {
        const item = itemById.get(id);
        if (!item) return false;
        const expected = op.targetItemFingerprints?.[id];
        return expected === undefined || expected === item.fingerprint;
      });
      if (targetsOk) {
        applicableOperationIds.push(op.id);
      } else {
        deferredOperationIds.push(op.id);
        reasons.push(`operation ${op.id} targets are missing or drifted`);
      }
    }

    return {
      valid: true,
      applicableOperationIds,
      deferredOperationIds,
      reasons,
    };
  },

  async apply({ snapshot, plan, request }) {
    const validation = await this.validate({ snapshot, plan });

    // Skeleton: no request mutation yet. Returns the original request unchanged
    // and reports what validate deemed applicable/deferred. remove/replace lands
    // in the next step (CLA-02 apply).
    const result: ContextRewriteResult = {
      schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
      mode: "request_overlay",
      planId: plan.planId,
      applied: false,
      changed: false,
      previousRevision: snapshot.revision,
      nextRevision: snapshot.revision,
      appliedOperationIds: [],
      deferredOperationIds: validation.deferredOperationIds,
      removedItemIds: [],
      savedChars: 0,
      fallbackUsed: false,
    };

    return { request, result };
  },
};
