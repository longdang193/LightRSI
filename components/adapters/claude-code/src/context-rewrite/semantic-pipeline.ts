import {
  buildDeltaViewFromRawSemanticSnapshot,
  listRawSemanticTurnSeqs,
  loadRawSemanticTurnRecord,
  loadSessionTaskRegistry,
  persistRawSemanticTurnRecord,
  persistSessionTaskRegistry,
  SessionTaskRegistryVersionMismatchError,
  type RawSemanticTurnRecord,
} from "@lightmem2/history";
import type { TaskStateEstimator } from "@lightmem2/eviction";
import { buildRawSemanticTurnRecord, buildRawSemanticSnapshot } from "./semantic-mapping.js";
import { bumpClaudeTurnSeq } from "./turn-counter.js";

export type SemanticPipelineResult = {
  ran: boolean;
  changed: boolean;
  turnSeq?: number;
  note?: string;
};

/**
 * V2 semantic-delta pipeline for one Claude request. Advances the per-session
 * turn counter, records this turn, then rebuilds the (lastProcessed, now]
 * interval into a DeltaView, asks the estimator for task-state updates, and
 * persists the updated registry — advancing lastProcessedTurnSeq only when the
 * registry actually changed.
 *
 * The whole thing is fail-open: any error (I/O, estimator, version conflict)
 * leaves the request path untouched and returns { ran:false/… } instead of
 * throwing. The caller (gateway) must treat this as best-effort side work that
 * can never block or fail the actual request.
 *
 * Watermark: updateRegistryFromDelta's mapper already sets
 * lastProcessedTurnSeq = delta.toTurnSeqInclusive in the patch, so a successful
 * update returns a registry whose watermark is advanced — we persist it as-is.
 * On changed=false (estimator failed / no updates / version mismatch) the
 * watermark is NOT advanced, so the next request re-covers the same interval.
 */
export async function runSemanticPipeline(params: {
  stateDir: string;
  sessionId: string;
  messages: unknown[];
  estimator: TaskStateEstimator;
  updateRegistryFromDelta: (args: {
    registry: import("@lightmem2/history").SessionTaskRegistry;
    delta: import("@lightmem2/history").DeltaView;
    estimator: TaskStateEstimator;
  }) => Promise<{ registry: import("@lightmem2/history").SessionTaskRegistry; changed: boolean; note?: string }>;
}): Promise<SemanticPipelineResult> {
  const { stateDir, sessionId, messages, estimator, updateRegistryFromDelta } = params;
  try {
    const turnSeq = await bumpClaudeTurnSeq(stateDir, sessionId);

    const record = buildRawSemanticTurnRecord({ sessionId, turnSeq, messages });
    await persistRawSemanticTurnRecord(stateDir, record);

    const registry = await loadSessionTaskRegistry(stateDir, sessionId);
    const fromTurnSeqExclusive = registry.lastProcessedTurnSeq;

    // Load only the (lastProcessed, now] interval of persisted turn records.
    const allSeqs = await listRawSemanticTurnSeqs(stateDir, sessionId);
    const intervalSeqs = allSeqs.filter(
      (seq) => seq > fromTurnSeqExclusive && seq <= turnSeq,
    );
    const loaded = await Promise.all(
      intervalSeqs.map((seq) => loadRawSemanticTurnRecord(stateDir, sessionId, seq)),
    );
    const turns = loaded.filter(
      (r): r is RawSemanticTurnRecord => r !== null,
    );

    const snapshot = buildRawSemanticSnapshot({ sessionId, turns });
    const delta = buildDeltaViewFromRawSemanticSnapshot(snapshot, {
      fromTurnSeqExclusive,
      toTurnSeqInclusive: turnSeq,
    });

    const result = await updateRegistryFromDelta({ registry, delta, estimator });
    if (!result.changed) {
      return { ran: true, changed: false, turnSeq, note: result.note };
    }

    try {
      await persistSessionTaskRegistry(stateDir, result.registry, {
        expectedVersion: registry.version,
      });
    } catch (error) {
      if (error instanceof SessionTaskRegistryVersionMismatchError) {
        // Another writer advanced the registry; abandon rather than clobber.
        return { ran: true, changed: false, turnSeq, note: "version_conflict" };
      }
      throw error;
    }

    return { ran: true, changed: true, turnSeq };
  } catch {
    // fail-open: semantic side-work must never break the request path
    return { ran: false, changed: false, note: "pipeline_error" };
  }
}
