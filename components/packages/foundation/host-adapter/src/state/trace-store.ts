import { join } from "node:path";
import { appendJsonl } from "./file-store.js";

export type EventTraceQueueStats = {
  queuedRecords: number;
  queuedBytes: number;
  droppedRecords: number;
  drainFailures: number;
};

type QueuedEventTrace = {
  stateDir: string;
  record: Record<string, unknown>;
  bytes: number;
};

const MAX_QUEUED_EVENT_TRACE_RECORDS = 1_024;
const MAX_QUEUED_EVENT_TRACE_BYTES = 4 * 1024 * 1024;
const eventTraceQueue: QueuedEventTrace[] = [];
let queuedBytes = 0;
let droppedRecords = 0;
let drainFailures = 0;
let drainPromise: Promise<void> | undefined;

export function eventTracePath(stateDir: string): string {
  return join(stateDir, "event-trace.jsonl");
}

export async function appendEventTrace(
  stateDir: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await appendJsonl(eventTracePath(stateDir), {
    at: new Date().toISOString(),
    ...payload,
  });
}

function scheduleEventTraceDrain(): void {
  if (drainPromise) return;
  drainPromise = (async () => {
    while (eventTraceQueue.length > 0) {
      const entry = eventTraceQueue.shift();
      if (!entry) continue;
      queuedBytes -= entry.bytes;
      try {
        await appendJsonl(eventTracePath(entry.stateDir), entry.record);
      } catch {
        drainFailures += 1;
      }
    }
  })().finally(() => {
    drainPromise = undefined;
    if (eventTraceQueue.length > 0) scheduleEventTraceDrain();
  });
}

export function enqueueEventTrace(
  stateDir: string,
  payload: Record<string, unknown>,
): void {
  const record = { at: new Date().toISOString(), ...payload };
  let bytes: number;
  try {
    bytes = Buffer.byteLength(`${JSON.stringify(record)}\n`, "utf8");
  } catch {
    droppedRecords += 1;
    return;
  }
  if (
    eventTraceQueue.length >= MAX_QUEUED_EVENT_TRACE_RECORDS
    || queuedBytes + bytes > MAX_QUEUED_EVENT_TRACE_BYTES
  ) {
    droppedRecords += 1;
    return;
  }
  eventTraceQueue.push({ stateDir, record, bytes });
  queuedBytes += bytes;
  scheduleEventTraceDrain();
}

export async function drainEventTraceQueue(): Promise<void> {
  while (drainPromise) await drainPromise;
}

export function getEventTraceQueueStats(): EventTraceQueueStats {
  return {
    queuedRecords: eventTraceQueue.length,
    queuedBytes,
    droppedRecords,
    drainFailures,
  };
}
