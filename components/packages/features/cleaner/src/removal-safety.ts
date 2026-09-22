import type { ContextItemRef } from "@lightrsi/host-adapter";
import type { TaskDependencyDirection, TaskRetentionDecision } from "@lightrsi/history";
import type {
  ContextCleanLifecycleState,
  ContextCleanOccurrenceSet,
  ContextCleanOccurrenceSelection,
} from "./contracts.js";

export function evaluateContextCleanOccurrence(input: {
  occurrence: { stableId: string; fingerprint: string };
  item?: ContextCleanRemovalItem["item"];
  set: Pick<ContextCleanOccurrenceSet, "provenance" | "sourceTaskIds">;
  activeTaskIds: readonly string[];
  evictableTaskIds: readonly string[];
  lifecycleState: ContextCleanLifecycleState;
  retentionDecision?: TaskRetentionDecision;
  dependencyDirection?: TaskDependencyDirection;
  retainedFindingReferences?: readonly string[];
  releaseEvidence?: ContextCleanOccurrenceSelection;
}): { safe: boolean; reasons: string[] } {
  const evidence = input.releaseEvidence;
  if (input.set.provenance === "agent"
    && (!evidence
      || evidence.stableId !== input.occurrence.stableId
      || evidence.fingerprint !== input.occurrence.fingerprint
      || evidence.completionEvidence.length === 0
      || evidence.continuingUseful
      || evidence.releaseIntent !== "release"
      || (evidence.retainedFindings.length > 0) === Boolean(evidence.nothingReusable))) {
    return { safe: false, reasons: ["occurrence_evidence_invalid"] };
  }
  if (!input.item) return { safe: false, reasons: ["item_missing"] };
  if (input.set.provenance === "agent") {
    if (!evidence) return { safe: false, reasons: ["occurrence_evidence_invalid"] };
    if (evidence.retainedFindings.length > 0) {
      const references = new Set(input.retainedFindingReferences ?? []);
      if (evidence.retainedFindings.some((finding) => !references.has(finding))) {
        return { safe: false, reasons: ["retained_findings"] };
      }
    }
    if (input.item.kind === "system" || input.item.kind === "developer"
      || input.item.role === "system" || input.item.role === "developer") {
      return { safe: false, reasons: ["protected_item"] };
    }
    if (input.item.fingerprint !== input.occurrence.fingerprint) {
      return { safe: false, reasons: ["item_stale"] };
    }
    return { safe: true, reasons: [] };
  }
  return evaluateContextCleanRemoval({
    taskId: input.set.sourceTaskIds[0] ?? input.occurrence.stableId,
    lifecycleState: input.lifecycleState,
    activeTaskIds: input.activeTaskIds,
    evictableTaskIds: input.evictableTaskIds,
    retentionDecision: input.retentionDecision,
    dependencyDirection: input.dependencyDirection,
    items: [{ item: input.item, expectedFingerprint: input.occurrence.fingerprint }],
  });
}

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
  retentionDecision?: TaskRetentionDecision;
  dependencyDirection?: TaskDependencyDirection;
  items?: readonly ContextCleanRemovalItem[];
}): { safe: boolean; reasons: string[] } {
  if (input.currentRevision !== undefined && input.expectedRevision !== undefined
    && input.currentRevision !== input.expectedRevision) return { safe: false, reasons: ["revision_stale"] };
  if (input.activeTaskIds.includes(input.taskId)) return { safe: false, reasons: ["task_active"] };
  if (input.lifecycleState === "unresolved") return { safe: false, reasons: ["task_unresolved"] };
  if (input.lifecycleState !== "completed") return { safe: false, reasons: ["task_not_completed"] };
  if (!input.evictableTaskIds.includes(input.taskId)) return { safe: false, reasons: ["task_not_evictable"] };
  if (input.retentionDecision === "retain") return { safe: false, reasons: ["task_retained"] };
  if (input.dependencyDirection === "incoming") return { safe: false, reasons: ["incoming_dependency"] };
  if (input.dependencyDirection === "unknown") return { safe: false, reasons: ["dependency_unknown"] };
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
