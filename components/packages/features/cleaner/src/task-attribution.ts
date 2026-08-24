import type {
  ContextItemRef,
  ModelContextSnapshot,
} from "@lightrsi/host-adapter";
import type {
  SessionTaskRegistry,
  TaskLifecycle,
} from "@lightrsi/history";
import type { ContextCleanLifecycleState } from "./contracts.js";

/**
 * Attribution inputs. Snapshot items may already carry taskIds (host bridges
 * populate them when the registry proves the mapping); when they do not, the
 * caller supplies host-specific join tables so the feature layer never needs
 * adapter-internal turn logic. Both tables are optional; items that resolve to
 * nothing become unassigned (or protected for system/developer content).
 */
export type TaskAttributionInput = {
  snapshot: ModelContextSnapshot;
  /** Shared session task registry; missing/empty registry degrades to unassigned. */
  registry?: SessionTaskRegistry;
  /** Host-provided stable item id -> task ids, used when snapshot items lack taskIds. */
  taskIdsByStableId?: Record<string, string[]>;
  /** Host-provided tool call id -> turn id, joined through registry.turnToTaskIds. */
  callIdToTurnAbsId?: ReadonlyMap<string, string>;
};

export type ContextCleanItemBucket = "task" | "protected" | "unassigned";

export type AttributedItem = {
  stableId: string;
  /** Resolved task ids after tool-pair union; empty means nothing could be attributed. */
  taskIds: string[];
  bucket: ContextCleanItemBucket;
  /** Present when bucket === "protected". */
  protectedReason?: "shared" | "system_developer";
};

const SYSTEM_DEVELOPER_KINDS = new Set(["system", "developer"]);

function isSystemOrDeveloper(item: ContextItemRef): boolean {
  return SYSTEM_DEVELOPER_KINDS.has(item.kind)
    || item.role === "system"
    || item.role === "developer";
}

function dedupeNonBlank(taskIds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of taskIds) {
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function resolveItemTaskIds(item: ContextItemRef, input: TaskAttributionInput): string[] {
  if (item.taskIds && item.taskIds.length > 0) return item.taskIds;
  const injected = input.taskIdsByStableId?.[item.stableId];
  if (injected && injected.length > 0) return injected;
  if (item.callId && input.callIdToTurnAbsId?.has(item.callId)) {
    const turnAbsId = input.callIdToTurnAbsId.get(item.callId) as string;
    const fromTurn = input.registry?.turnToTaskIds[turnAbsId];
    if (fromTurn && fromTurn.length > 0) return fromTurn;
  }
  return [];
}

/**
 * Tool call/result pairs must stay in the same task. Items sharing a callId get
 * the union of their resolved task ids, so a pair split across tasks becomes a
 * shared item and lands in the protected bucket instead of being split. Items
 * whose ids were unresolved inherit the pair's task ids (the pair belongs
 * together); a fully unresolved pair stays unresolved.
 */
function pairByCallId(
  resolved: Map<string, { callId?: string; taskIds: string[] }>,
): void {
  const unionByCallId = new Map<string, string[]>();
  for (const info of resolved.values()) {
    if (info.callId) {
      unionByCallId.set(info.callId, dedupeNonBlank([
        ...(unionByCallId.get(info.callId) ?? []),
        ...info.taskIds,
      ]));
    }
  }
  for (const info of resolved.values()) {
    if (info.callId) info.taskIds = unionByCallId.get(info.callId) as string[];
  }
}

/**
 * Resolves every snapshot item to a single accounting bucket:
 *
 * - task: exactly one task id after tool-pair union.
 * - protected: system/developer content, or items shared by multiple tasks
 *   (including pairs split across tasks). Only content NOT attributed to a
 *   single task may land here, so task + protected + unassigned never
 *   double-count an item.
 * - unassigned: nothing could be attributed and the item is not protected.
 */
export function attributeItems(input: TaskAttributionInput): AttributedItem[] {
  const resolved = new Map<string, { callId?: string; taskIds: string[] }>();
  for (const item of input.snapshot.items) {
    resolved.set(item.stableId, {
      callId: item.callId,
      taskIds: dedupeNonBlank(resolveItemTaskIds(item, input)),
    });
  }
  pairByCallId(resolved);

  const attributed: AttributedItem[] = [];
  for (const item of input.snapshot.items) {
    const info = resolved.get(item.stableId) as { callId?: string; taskIds: string[] };
    let bucket: ContextCleanItemBucket;
    let protectedReason: AttributedItem["protectedReason"];
    if (info.taskIds.length === 0) {
      if (isSystemOrDeveloper(item)) {
        bucket = "protected";
        protectedReason = "system_developer";
      } else {
        bucket = "unassigned";
      }
    } else if (info.taskIds.length > 1) {
      bucket = "protected";
      protectedReason = "shared";
    } else {
      bucket = "task";
    }
    attributed.push({
      stableId: item.stableId,
      taskIds: info.taskIds,
      bucket,
      ...(protectedReason ? { protectedReason } : {}),
    });
  }
  return attributed;
}

/**
 * Maps the shared history lifecycle vocabulary onto the clean contract's.
 * Unresolved questions win over the lifecycle so a completed task with open
 * questions stays protected by later selection rules.
 */
export function mapTaskLifecycle(
  lifecycle: TaskLifecycle,
  unresolvedQuestions: string[],
): ContextCleanLifecycleState {
  if (unresolvedQuestions.length > 0) return "unresolved";
  switch (lifecycle) {
    case "active": return "active";
    case "blocked": return "unresolved";
    case "completed": return "completed";
    case "evictable": return "completed";
    default: return "unknown";
  }
}
