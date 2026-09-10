import { randomBytes } from "node:crypto";
import { appendFile, mkdir, open, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const writeQueues = new Map<string, Promise<void>>();
export const JSONL_TAIL_READ_CHUNK_BYTES = 64 * 1024;

export type FileLockOptions = {
  timeoutMs?: number;
  retryMs?: number;
  staleMs?: number;
};

type FileLock = {
  release(): Promise<void>;
};

const DEFAULT_FILE_LOCK_TIMEOUT_MS = 5_000;
const DEFAULT_FILE_LOCK_RETRY_MS = 10;
const DEFAULT_FILE_LOCK_STALE_MS = 30 * 60 * 1_000;

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function lockIsStale(lockPath: string, staleMs: number): Promise<boolean> {
  try {
    const owner = JSON.parse(await readFile(`${lockPath}/owner.json`, "utf8")) as {
      pid?: unknown;
      createdAt?: unknown;
    };
    if (typeof owner.pid === "number") return !isProcessAlive(owner.pid);
    if (typeof owner.createdAt === "string") {
      const createdAt = Date.parse(owner.createdAt);
      if (Number.isFinite(createdAt)) return Date.now() - createdAt > staleMs;
    }
  } catch {
    // Fall through to lock directory mtime.
  }
  try {
    const lockStat = await stat(lockPath);
    return Date.now() - lockStat.mtimeMs > staleMs;
  } catch {
    return true;
  }
}

async function acquireFileLock(lockPath: string, options?: FileLockOptions): Promise<FileLock> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_FILE_LOCK_TIMEOUT_MS;
  const retryMs = options?.retryMs ?? DEFAULT_FILE_LOCK_RETRY_MS;
  const staleMs = options?.staleMs ?? DEFAULT_FILE_LOCK_STALE_MS;
  const deadline = Date.now() + timeoutMs;
  const token = `${process.pid}-${Math.random().toString(16).slice(2)}`;
  await mkdir(dirname(lockPath), { recursive: true });
  while (true) {
    try {
      await mkdir(lockPath);
      await writeFile(`${lockPath}/owner.json`, JSON.stringify({
        token,
        pid: process.pid,
        createdAt: new Date().toISOString(),
      }), "utf8");
      return {
        async release() {
          try {
            const owner = JSON.parse(await readFile(`${lockPath}/owner.json`, "utf8")) as { token?: unknown };
            if (owner.token === token) await rm(lockPath, { recursive: true, force: true });
          } catch {}
        },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (await lockIsStale(lockPath, staleMs)) {
        await rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`file lock timeout: ${lockPath}`);
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
  }
}

export async function withFileLock<T>(
  lockPath: string,
  operation: () => Promise<T>,
  options?: FileLockOptions,
): Promise<T> {
  const lock = await acquireFileLock(lockPath, options);
  try {
    return await operation();
  } finally {
    await lock.release();
  }
}

export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function renameWithRetry(sourcePath: string, targetPath: string): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rename(sourcePath, targetPath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!["EPERM", "EACCES", "EBUSY"].includes(code ?? "") || attempt === 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

export async function writeJsonFileAtomic(path: string, payload: unknown): Promise<void> {
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    await mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    try {
      await renameWithRetry(tempPath, path);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }
  });
  writeQueues.set(path, current);
  try {
    await current;
  } finally {
    if (writeQueues.get(path) === current) writeQueues.delete(path);
  }
}
export async function appendJsonl(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(payload)}\n`, "utf8");
}

export async function readRecentJsonlEntries<T>(
  path: string,
  limit = 8,
  isEntry?: (value: unknown) => value is T,
): Promise<T[]> {
  const target = Math.max(1, limit);
  try {
    const handle = await open(path, "r");
    let raw = "";
    try {
      const size = (await handle.stat()).size;
      let offset = size;
      let buffer = Buffer.alloc(0);
      let newlineCount = 0;
      while (offset > 0 && newlineCount <= target) {
        const chunkSize = Math.min(JSONL_TAIL_READ_CHUNK_BYTES, offset);
        offset -= chunkSize;
        const chunk = Buffer.alloc(chunkSize);
        await handle.read(chunk, 0, chunkSize, offset);
        buffer = Buffer.concat([chunk, buffer]);
        newlineCount = 0;
        for (const byte of buffer) {
          if (byte === 0x0a) newlineCount += 1;
        }
      }
      raw = buffer.toString("utf8");
      if (offset > 0) {
        const firstNewline = raw.indexOf("\n");
        raw = firstNewline >= 0 ? raw.slice(firstNewline + 1) : "";
      }
    } finally {
      await handle.close();
    }
    const lines = raw.split(/\r?\n/).filter(Boolean);
    return lines
      .slice(-target)
      .reverse()
      .map((line) => JSON.parse(line) as unknown)
      .filter((entry): entry is T => (isEntry ? isEntry(entry) : true));
  } catch {
    return [];
  }
}
