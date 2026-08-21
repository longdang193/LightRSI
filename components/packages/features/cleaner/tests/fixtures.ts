import {
  CONTEXT_CLEAN_SCHEMA_VERSION,
  type ContextCleanPlan,
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
    protectedTokens: 10,
    protectedChars: 40,
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
