import { join } from "node:path";
import { appendJsonl, appendJsonlLines } from "./file-store.js";

export type EventTraceQueueStats = {
  queuedRecords: number;
  queuedBytes: number;
  droppedRecords: number;
  drainFailures: number;
};

type QueuedEventTrace = {
  stateDir: string;
  line: string;
  bytes: number;
  settle: () => void;
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
      const batch = [entry];
      while (eventTraceQueue[0]?.stateDir === entry.stateDir) {
        const next = eventTraceQueue.shift();
        if (!next) break;
        batch.push(next);
      }
      queuedBytes -= batch.reduce((total, item) => total + item.bytes, 0);
      try {
        await appendJsonlLines(eventTracePath(entry.stateDir), batch.map((item) => item.line));
      } catch {
        drainFailures += batch.length;
      } finally {
        for (const item of batch) item.settle();
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
): Promise<void> {
  return new Promise((resolve) => {
    const record = { at: new Date().toISOString(), ...payload };
    let bytes: number;
    try {
      bytes = Buffer.byteLength(`${JSON.stringify(record)}\n`, "utf8");
    } catch {
      droppedRecords += 1;
      resolve();
      return;
    }
    if (
      eventTraceQueue.length >= MAX_QUEUED_EVENT_TRACE_RECORDS
      || queuedBytes + bytes > MAX_QUEUED_EVENT_TRACE_BYTES
    ) {
      droppedRecords += 1;
      resolve();
      return;
    }
    eventTraceQueue.push({
      stateDir,
      line: `${JSON.stringify(record)}\n`,
      bytes,
      settle: resolve,
    });
    queuedBytes += bytes;
    scheduleEventTraceDrain();
  });
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
