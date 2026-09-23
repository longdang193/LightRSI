import {
  createContextCleanerControlService,
  createContextCleanerControlPlane,
  type ContextCleanReceipt,
  type ContextCleanSnapshot,
} from "@lightrsi/cleaner";
import { createCodexContextCleanerBridge } from "../../../../adapters/codex/src/context-cleaner/bridge.js";
import type { CleanCommandBackend } from "../clean.js";
import type { CleanInspectionView, CleanReceiptView } from "../clean-renderer.js";

function receiptView(receipt: ContextCleanReceipt): CleanReceiptView {
  return {
    planId: receipt.planId, status: receipt.status, selectedTaskIds: [...receipt.selectedTaskIds],
    ...(receipt.evidence?.occurrenceSelections
      ? {
          occurrenceSelections: receipt.evidence.occurrenceSelections.map((selection) => ({
            stableId: selection.stableId,
            fingerprint: selection.fingerprint,
          })),
        }
      : {}),
    estimatedSavedTokens: receipt.estimatedSavedTokens, estimatedSavedChars: receipt.estimatedSavedChars,
    ...(receipt.status === "applied" ? { appliedSavedTokens: receipt.appliedSavedTokens, appliedSavedChars: receipt.appliedSavedChars } : {}),
    fallbackUsed: receipt.fallbackUsed, deferredTaskIds: [...receipt.deferredTaskIds], reasons: [...receipt.reasons],
  };
}

export function createCodexCleanCommandBackend(params: {
  stateDir: string;
  boundSessionId?: string;
}): CleanCommandBackend {
  const controlPlane = createContextCleanerControlPlane({ stateDir: params.stateDir });
  const bridge = createCodexContextCleanerBridge({
    stateDir: params.stateDir,
    controlPlane,
    boundSessionId: params.boundSessionId,
  });
  const service = createContextCleanerControlService({
    stateDir: params.stateDir,
    bridge,
  });
  return {
    async inspect(sessionId, options) { return inspectionView(await service.inspect(sessionId, options)); },
    async previewRelease(sessionId, selections) { return service.previewRelease(sessionId, selections); },
    async approveOccurrences(planId, selections) { return receiptView(await service.approveOccurrences(planId, selections)); },
    async releaseOccurrences(sessionId, selections) { return receiptView(await service.releaseOccurrences(sessionId, selections)); },
    async readReceipt(planId) { const receipt = await service.readReceipt(planId); return receipt ? receiptView(receipt) : undefined; },
    async cancel(planId) { return receiptView(await service.cancel(planId)); },
  };
}

function inspectionView(snapshot: ContextCleanSnapshot): CleanInspectionView {
  return {
    hostId: snapshot.hostId,
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    duplicateEvidenceStatus: snapshot.duplicateEvidenceStatus ?? "unavailable",
    ...(snapshot.duplicateEvidence ? { duplicateEvidence: snapshot.duplicateEvidence } : {}),
    ...(snapshot.duplicateEvidenceOmittedGroupCount != null
      ? { duplicateEvidenceOmittedGroupCount: snapshot.duplicateEvidenceOmittedGroupCount }
      : {}),
    contextPressure: snapshot.contextPressure ?? { level: "unknown", source: "unavailable" },
    occurrences: snapshot.items.map((item) => ({
      stableId: item.stableId,
      fingerprint: item.fingerprint,
      shape: [item.kind, item.role, item.callId ? `call:${item.callId}` : undefined].filter(Boolean).join(" "),
      chars: item.chars,
      protectionReason: item.kind === "system" || item.kind === "developer"
        ? "protocol_protected"
        : item.taskIds && item.taskIds.length > 0
          ? "task_attributed; release requires occurrence evidence"
          : "unassigned; release requires occurrence evidence",
    })),
  };
}
