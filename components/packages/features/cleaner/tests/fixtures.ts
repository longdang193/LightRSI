import {
  CONTEXT_CLEAN_SCHEMA_VERSION,
  type ContextCleanPlan,
  type ContextCleanReceipt,
} from "../src/index.js";
import {
  MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
  type ModelContextSnapshot,
} from "@lightrsi/host-adapter";

export function sampleSnapshot(revision = "rev-1"): ModelContextSnapshot {
  return {
    schemaVersion: MODEL_CONTEXT_REWRITE_SCHEMA_VERSION,
    hostId: "codex",
    sessionId: "session-1",
    revision,
    items: [
      {
        stableId: "item-a",
        kind: "user",
        taskIds: ["task-a"],
        fingerprint: "digest-a",
        chars: 120,
      },
      {
        stableId: "item-b",
        kind: "assistant",
        taskIds: ["task-a"],
        fingerprint: "digest-b",
        chars: 80,
      },
      {
        stableId: "item-current",
        kind: "user",
        taskIds: ["task-current"],
        fingerprint: "digest-current",
        chars: 40,
      },
    ],
  };
}

export function sampleReceipt(
  status: ContextCleanReceipt["status"] = "analyzed",
): ContextCleanReceipt {
  const base = {
    schemaVersion: CONTEXT_CLEAN_SCHEMA_VERSION,
    planId: "clean-plan-1",
    hostId: "codex",
    sessionId: "session-1",
    selectedTaskIds: status === "analyzed" ? [] : ["task-a"],
    estimatedSavedTokens: 50,
    estimatedSavedChars: 200,
    tokenCountMode: "estimated" as const,
    deferredTaskIds: [],
    reasons: [],
    updatedAt: "2026-08-20T00:00:00.000Z",
  };
  if (status === "applied") {
    return { ...base, status, fallbackUsed: false, appliedSavedTokens: 45,
      appliedSavedChars: 180, evidence: { previousRevision: "rev-1", nextRevision: "rev-2",
        operationIds: ["operation-1"], itemIds: ["item-a", "item-b"] } };
  }
  if (status === "stale" || status === "cancelled" || status === "failed") {
    return { ...base, status, fallbackUsed: status === "failed" };
  }
  return { ...base, status, fallbackUsed: false };
}

export function samplePlan(): ContextCleanPlan {
  return {
    schemaVersion: CONTEXT_CLEAN_SCHEMA_VERSION,
    planId: "clean-plan-1",
    hostId: "codex",
    sessionId: "session-1",
    baseRevision: "rev-1",
    model: "gpt-5.4",
    usedTokens: 60,
    usedChars: 240,
    protectedTokens: 0,
    protectedChars: 0,
    unassignedTokens: 0,
    unassignedChars: 0,
    tokenCountMode: "estimated",
    tokenCountMethod: "fixture",
    tasks: [
      {
        taskId: "task-a",
        label: "finished task",
        description: "finished task description",
        summary: "finished task summary",
        lifecycleState: "completed",
        itemIds: ["item-a", "item-b"],
        itemDigests: { "item-a": "digest-a", "item-b": "digest-b" },
        tokenCount: 50,
        charCount: 200,
        tokenPercent: 83.33,
        recommendation: "clean",
        reasonCodes: ["completed"],
        selectable: true,
      },
      {
        taskId: "task-current",
        label: "current task",
        description: "current task description",
        summary: "current task summary",
        lifecycleState: "active",
        itemIds: ["item-current"],
        itemDigests: { "item-current": "digest-current" },
        tokenCount: 10,
        charCount: 40,
        tokenPercent: 16.67,
        recommendation: "protected",
        reasonCodes: ["current_task"],
        selectable: false,
      },
    ],
    createdAt: "2026-08-19T00:00:00.000Z",
  };
}
