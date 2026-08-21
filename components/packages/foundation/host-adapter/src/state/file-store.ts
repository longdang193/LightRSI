import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function renameWithRetry(sourcePath: string, targetPath: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await rename(sourcePath, targetPath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!["EPERM", "EACCES", "EBUSY"].includes(code ?? "") || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
}

export async function writeJsonFileAtomic(path: string, payload: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tempPath = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  try {
    await renameWithRetry(tempPath, path);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
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
  try {
    const raw = await readFile(path, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    return lines
      .slice(-Math.max(1, limit))
      .reverse()
      .map((line) => JSON.parse(line) as unknown)
      .filter((entry): entry is T => (isEntry ? isEntry(entry) : true));
  } catch {
    return [];
  }
}
