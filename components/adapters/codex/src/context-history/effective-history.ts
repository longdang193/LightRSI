import { readCodexContextHistoryJournalEntries } from "./journal-store.js";
import { cloneJson, hashJson } from "./shared.js";
import type { CodexEffectiveHistory, CodexEffectiveHistoryItem, JsonObject } from "./types.js";

function nativeItemId(item: JsonObject, prefix: string, index: number): string {
  const type = typeof item.type === "string"
    ? item.type
    : typeof item.role === "string"
      ? `message:${item.role}`
      : "item";
  if (typeof item.id === "string") return `${type}:id:${item.id}`;
  if (typeof item.call_id === "string") return `${type}:call:${item.call_id}`;
  return `${type}:hash:${hashJson({ prefix, index, item })}`;
}

function isObservationOnlyItem(item: JsonObject): boolean {
  const type = String(item.type ?? "").toLowerCase();
  return type === "web_search_call" || type === "event_msg" || type === "turn_context";
}

function appendEffectiveItem(params: {
  item: JsonObject;
  prefix: string;
  index: number;
  seen: Set<string>;
  replayableItems: CodexEffectiveHistoryItem[];
  observationOnlyItems: CodexEffectiveHistoryItem[];
}): void {
  const nativeId = nativeItemId(params.item, params.prefix, params.index);
  if (params.seen.has(nativeId)) return;
  params.seen.add(nativeId);
  const effectiveItem: CodexEffectiveHistoryItem = {
    stableItemId: `codex-${hashJson(nativeId)}`,
    nativeId,
    callId: typeof params.item.call_id === "string" ? params.item.call_id : undefined,
    item: cloneJson(params.item),
  };
  if (isObservationOnlyItem(params.item)) params.observationOnlyItems.push(effectiveItem);
  else params.replayableItems.push(effectiveItem);
}

function unresolvedCallIds(items: CodexEffectiveHistoryItem[]): string[] {
  const calls = new Set<string>();
  const outputs = new Set<string>();
  for (const entry of items) {
    const type = String(entry.item.type ?? "").toLowerCase();
    if ((type === "function_call" || type === "custom_tool_call") && entry.callId) calls.add(entry.callId);
    if ((type === "function_call_output" || type === "custom_tool_call_output") && entry.callId) outputs.add(entry.callId);
  }
  return Array.from(calls).filter((callId) => !outputs.has(callId)).sort();
}

export async function buildCodexEffectiveHistory(params: {
  stateDir: string;
  sessionId: string;
  rolloutParserBootstrap?: () => Promise<CodexEffectiveHistory | null>;
}): Promise<CodexEffectiveHistory> {
  const journal = await readCodexContextHistoryJournalEntries(params.stateDir, params.sessionId);
  const hasIncompleteJournal = journal.some((entry) => entry.status === "incomplete");
  if ((journal.length === 0 || hasIncompleteJournal) && params.rolloutParserBootstrap) {
    const bootstrapped = await params.rolloutParserBootstrap();
    if (bootstrapped) return bootstrapped;
  }

  const replayableItems: CodexEffectiveHistoryItem[] = [];
  const observationOnlyItems: CodexEffectiveHistoryItem[] = [];
  const seen = new Set<string>();
  journal.forEach((entry, entryIndex) => {
    const items = entry.kind === "request" ? entry.inputItems : entry.outputItems;
    items.forEach((item, itemIndex) => {
      appendEffectiveItem({
        item,
        prefix: `${entry.kind}:${entryIndex}`,
        index: itemIndex,
        seen,
        replayableItems,
        observationOnlyItems,
      });
    });
  });

  const unresolved = unresolvedCallIds(replayableItems);
  const revision = `rev-${hashJson({
    replayableItems: replayableItems.map((entry) => entry.nativeId),
    observationOnlyItems: observationOnlyItems.map((entry) => entry.nativeId),
    unresolved,
    hasIncompleteJournal,
  })}`;

  return {
    revision,
    replayableItems,
    observationOnlyItems,
    unresolvedCallIds: unresolved,
    source: journal.length > 0 ? "proxy_journal" : "empty",
    incomplete: hasIncompleteJournal,
  };
}
