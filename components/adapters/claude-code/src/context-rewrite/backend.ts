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
const TOOL_RESULT_POINTER = "[evicted: earlier tool result content removed]";
const TEXT_POINTER = "[evicted: earlier content removed]";

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

type ParsedStableId = { msgIdx: number; blockIdx: number };

function parseStableId(id: string): ParsedStableId | undefined {
  const parts = id.split(":");
  if (parts.length < 3) return undefined;
  const msgIdx = Number(parts[parts.length - 2]);
  const blockIdx = Number(parts[parts.length - 1]);
  if (!Number.isInteger(msgIdx) || !Number.isInteger(blockIdx)) return undefined;
  return { msgIdx, blockIdx };
}

function asBlockRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function lastUserMessageIndex(messages: RuntimeMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "user") return i;
  }
  return -1;
}

function blockCharCount(block: Record<string, unknown>): number {
  const value =
    block.type === "tool_result"
      ? block.content
      : block.type === "tool_use"
        ? block.input
        : (block.text ?? block.content);
  if (typeof value === "string") return value.length;
  return JSON.stringify(value ?? "").length;
}

// Rewrite a single block to its pointer stub. tool_result keeps its type and
// tool_use_id so the tool-use/tool-result pair stays closed; only the content
// is replaced. Other blocks become a short text stub.
function stubBlock(block: Record<string, unknown>): Record<string, unknown> {
  if (block.type === "tool_result") {
    return {
      type: "tool_result",
      tool_use_id: block.tool_use_id,
      content: TOOL_RESULT_POINTER,
    };
  }
  return { type: "text", text: TEXT_POINTER };
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

    const unchanged = (fallbackUsed: boolean): ContextRewriteResult => ({
      schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
      mode: "request_overlay",
      planId: plan.planId,
      applied: false,
      changed: false,
      previousRevision: snapshot.revision,
      nextRevision: snapshot.revision,
      appliedOperationIds: [],
      deferredOperationIds: plan.operations.map((op) => op.id),
      removedItemIds: [],
      savedChars: 0,
      fallbackUsed,
    });

    if (!validation.valid || validation.applicableOperationIds.length === 0) {
      return { request, result: unchanged(false) };
    }

    try {
      // Guard against drift: the request we are about to rewrite must still
      // describe the same revision the plan was validated against.
      const current = buildClaudeContextSnapshot({
        sessionId: request.sessionId,
        revision: request.revision,
        messages: request.messages,
      });
      if (current.revision !== snapshot.revision) {
        return { request, result: unchanged(false) };
      }

      const messages = structuredClone(request.messages);
      const protectedIdx = lastUserMessageIndex(messages);
      const applicable = new Set(validation.applicableOperationIds);

      const removedItemIds: string[] = [];
      const appliedOperationIds: string[] = [];
      const deferredOperationIds = [...validation.deferredOperationIds];
      let savedChars = 0;

      for (const op of plan.operations) {
        if (!applicable.has(op.id)) continue;
        let opTouched = false;

        for (const itemId of op.targetItemIds) {
          const parsed = parseStableId(itemId);
          if (!parsed) continue;
          const { msgIdx, blockIdx } = parsed;
          // Never rewrite the current user turn.
          if (msgIdx === protectedIdx) continue;
          const message = messages[msgIdx];
          if (!message || typeof message.content === "string") continue;
          const block = asBlockRecord(message.content[blockIdx]);
          if (!block) continue;
          // tool_use is half of a pair; leave it so closure stays intact.
          if (block.type === "tool_use") continue;

          const stub = stubBlock(block);
          savedChars += Math.max(0, blockCharCount(block) - blockCharCount(stub));
          message.content[blockIdx] = stub as never;
          removedItemIds.push(itemId);
          opTouched = true;
        }

        if (opTouched) appliedOperationIds.push(op.id);
        else deferredOperationIds.push(op.id);
      }

      const changed = removedItemIds.length > 0;
      const nextRequest = changed ? { ...request, messages } : request;

      const result: ContextRewriteResult = {
        schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
        mode: "request_overlay",
        planId: plan.planId,
        applied: appliedOperationIds.length > 0,
        changed,
        previousRevision: snapshot.revision,
        nextRevision: snapshot.revision,
        appliedOperationIds,
        deferredOperationIds,
        removedItemIds,
        savedChars,
        fallbackUsed: false,
      };
      return { request: nextRequest, result };
    } catch {
      return { request, result: unchanged(true) };
    }
  },
};
