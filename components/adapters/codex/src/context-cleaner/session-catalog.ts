import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import { sessionStateRoot } from "@lightrsi/host-adapter";
import type { ContextCleanerSession } from "@lightrsi/cleaner";

import { loadCodexSessionSnapshot } from "../session-state.js";

export async function listCodexCleanerSessions(
  stateDir: string,
): Promise<ContextCleanerSession[]> {
  const directory = join(sessionStateRoot(stateDir), "sessions");
  let names: string[];
  try {
    names = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const sessions = await Promise.all(names.map(async (name): Promise<ContextCleanerSession | undefined> => {
    let sessionId: string;
    try {
      sessionId = decodeURIComponent(basename(name, ".json"));
    } catch {
      return undefined;
    }
    if (!sessionId.trim()) return undefined;
    const snapshot = await loadCodexSessionSnapshot(stateDir, sessionId);
    if (!snapshot || snapshot.sessionId !== sessionId) return undefined;
    return { sessionId, updatedAt: snapshot.updatedAt };
  }));

  return sessions
    .filter((session): session is ContextCleanerSession => session !== undefined)
    .sort((left, right) => (
      String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""))
      || left.sessionId.localeCompare(right.sessionId)
    ));
}
