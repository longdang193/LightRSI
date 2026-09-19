import type { ContextItemRef } from "@lightrsi/host-adapter";
import type { ContextCleanLifecycleState } from "./contracts.js";

export type ContextCleanRemovalItem = {
  item?: Pick<ContextItemRef, "stableId" | "kind" | "role" | "taskIds" | "fingerprint">;
  expectedFingerprint?: string;
};

export function evaluateContextCleanRemoval(input: {
  taskId: string;
  lifecycleState: ContextCleanLifecycleState;
  activeTaskIds: readonly string[];
  evictableTaskIds: readonly string[];
  currentRevision?: string;
  expectedRevision?: string;
  items?: readonly ContextCleanRemovalItem[];
}): { safe: boolean; reasons: string[] } {
  if (input.currentRevision !== undefined && input.expectedRevision !== undefined
    && input.currentRevision !== input.expectedRevision) return { safe: false, reasons: ["revision_stale"] };
  if (input.activeTaskIds.includes(input.taskId)) return { safe: false, reasons: ["task_active"] };
  if (input.lifecycleState === "unresolved") return { safe: false, reasons: ["task_unresolved"] };
  if (input.lifecycleState !== "completed") return { safe: false, reasons: ["task_not_completed"] };
  if (!input.evictableTaskIds.includes(input.taskId)) return { safe: false, reasons: ["task_not_evictable"] };
  for (const target of input.items ?? []) {
    const item = target.item;
    if (!item) return { safe: false, reasons: ["item_missing"] };
    if (item.kind === "system" || item.kind === "developer"
      || item.role === "system" || item.role === "developer") {
      return { safe: false, reasons: ["protected_item"] };
    }
    if (!item.taskIds || item.taskIds.length !== 1) {
      return { safe: false, reasons: ["task_attribution_shared"] };
    }
    if (item.taskIds[0] !== input.taskId) return { safe: false, reasons: ["task_attribution_stale"] };
    if (target.expectedFingerprint !== undefined && item.fingerprint !== target.expectedFingerprint) {
      return { safe: false, reasons: ["item_stale"] };
    }
  }
  return { safe: true, reasons: [] };
}
