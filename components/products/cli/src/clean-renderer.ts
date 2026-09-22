export type CleanPlanView = {
  planId: string;
  hostId: string;
  sessionId: string;
  usedTokens: number | null;
  usedChars: number;
  protectedTokens: number | null;
  protectedChars: number;
  unassignedTokens: number | null;
  unassignedChars: number;
  tokenCountMode: string;
  attributionStatus?: string;
  tasks: Array<{
    taskId: string;
    label: string;
    description: string;
    lifecycleState: string;
    tokenCount: number | null;
    charCount: number;
    tokenPercent: number | null;
    recommendation: string;
    reasonCodes: string[];
    selectable: boolean;
  }>;
};

export type CleanReceiptView = {
  planId: string;
  status: string;
  selectedTaskIds: string[];
  occurrenceSelections?: Array<{ stableId: string; fingerprint: string }>;
  estimatedSavedTokens: number | null;
  estimatedSavedChars: number;
  appliedSavedTokens?: number | null;
  appliedSavedChars?: number;
  fallbackUsed: boolean;
  deferredTaskIds: string[];
  reasons: string[];
};

export type CleanOccurrenceView = {
  stableId: string;
  fingerprint: string;
  shape: string;
  chars: number;
  protectionReason: string;
};

export type CleanInspectionView = {
  hostId: string;
  sessionId: string;
  revision: string;
  occurrences: CleanOccurrenceView[];
};

function count(tokens: number | null, chars: number): string {
  return tokens === null ? `${chars} chars` : `${tokens} tokens / ${chars} chars`;
}

export function renderCleanPlan(plan: CleanPlanView): string {
  const lines = [
    `Context Cleaner plan: ${plan.planId}`,
    `Host/session: ${plan.hostId} / ${plan.sessionId}`,
    `Used: ${count(plan.usedTokens, plan.usedChars)} (${plan.tokenCountMode})`,
    `Protected: ${count(plan.protectedTokens, plan.protectedChars)}`,
    `Unassigned: ${count(plan.unassignedTokens, plan.unassignedChars)}`,
    ...(plan.attributionStatus ? [`Attribution: ${plan.attributionStatus}`] : []),
  ];
  for (const task of plan.tasks) {
    lines.push(`${task.selectable ? "[selectable]" : "[protected]"} ${task.taskId}: ${task.label} — ${count(task.tokenCount, task.charCount)}`);
    if (task.reasonCodes.length > 0) lines.push(`  reasons: ${task.reasonCodes.join(", ")}`);
  }
  return lines.join("\n");
}

export function renderCleanReceipt(receipt: CleanReceiptView): string {
  const lines = [
    `Context Cleaner receipt: ${receipt.planId}`,
    `Status: ${receipt.status}`,
    ...(receipt.occurrenceSelections && receipt.occurrenceSelections.length > 0
      ? [`Selected occurrences: ${receipt.occurrenceSelections.map((selection) => selection.stableId).join(", ")}`]
      : [`Selected tasks: ${receipt.selectedTaskIds.length > 0 ? receipt.selectedTaskIds.join(", ") : "(none)"}`]),
    `Estimated savings: ${count(receipt.estimatedSavedTokens, receipt.estimatedSavedChars)}`,
    `Fallback: ${receipt.fallbackUsed ? "yes" : "no"}`,
  ];
  if (receipt.status === "applied") lines.push(`Applied savings: ${count(receipt.appliedSavedTokens ?? null, receipt.appliedSavedChars ?? 0)}`);
  if (receipt.deferredTaskIds.length > 0) lines.push(`Deferred: ${receipt.deferredTaskIds.join(", ")}`);
  if (receipt.reasons.length > 0) lines.push(`Reasons: ${receipt.reasons.join(", ")}`);
  return lines.join("\n");
}

export function renderCleanInspection(inspection: CleanInspectionView): string {
  const lines = [
    `Context Cleaner occurrences: ${inspection.hostId} / ${inspection.sessionId}`,
    `Revision: ${inspection.revision}`,
  ];
  for (const occurrence of inspection.occurrences) {
    lines.push(`${occurrence.stableId} ${occurrence.shape} — ${occurrence.chars} chars — ${occurrence.protectionReason}`);
    lines.push(`  fingerprint: ${occurrence.fingerprint}`);
  }
  return lines.join("\n");
}
