import { readCodexContextHistoryJournal } from "./journal-store.js";
import { cloneJson, hashJson } from "./shared.js";
import type {
  CodexContextHistoryJournalEntry,
  CodexEffectiveHistory,
  CodexEffectiveHistoryItem,
  CodexRequestJournalEntry,
  CodexResponseJournalEntry,
  JsonObject,
} from "./types.js";

type IndexedRequest = {
  entry: CodexRequestJournalEntry;
  journalIndex: number;
};

type IndexedResponse = {
  entry: CodexResponseJournalEntry;
  journalIndex: number;
};

type CommittedTurn = {
  request: IndexedRequest;
  response: IndexedResponse;
};

function latestRequests(journal: CodexContextHistoryJournalEntry[]): Map<string, IndexedRequest> {
  const requests = new Map<string, IndexedRequest>();
  journal.forEach((entry, journalIndex) => {
    if (entry.kind === "request") requests.set(entry.requestId, { entry, journalIndex });
  });
  return requests;
}

function latestResponsesById(journal: CodexContextHistoryJournalEntry[]): Map<string, IndexedResponse> {
  const responses = new Map<string, IndexedResponse>();
  journal.forEach((entry, journalIndex) => {
    if (entry.kind === "response" && entry.responseId) {
      responses.set(entry.responseId, { entry, journalIndex });
    }
  });
  return responses;
}

function committedResponses(
  responses: Map<string, IndexedResponse>,
  requests: Map<string, IndexedRequest>,
): IndexedResponse[] {
  return Array.from(responses.values())
    .filter(({ entry }) => {
      if (entry.status !== "completed" || !entry.requestId) return false;
      return requests.get(entry.requestId)?.entry.status === "completed";
    })
    .sort((left, right) => left.journalIndex - right.journalIndex);
}

function previousResponseId(turn: CommittedTurn): string | undefined {
  return turn.response.entry.previousResponseId ?? turn.request.entry.previousResponseId;
}

function buildCommittedChain(params: {
  headResponseId?: string;
  requests: Map<string, IndexedRequest>;
  responses: Map<string, IndexedResponse>;
}): { chain: CommittedTurn[]; complete: boolean } {
  const committed = committedResponses(params.responses, params.requests);
  const head = params.headResponseId
    ? params.responses.get(params.headResponseId)
    : committed.at(-1);
  if (!head) {
    return { chain: [], complete: params.headResponseId === undefined && params.requests.size === 0 };
  }

  const chain: CommittedTurn[] = [];
  const seenResponseIds = new Set<string>();
  let cursor: IndexedResponse | undefined = head;
  while (cursor) {
    const responseId = cursor.entry.responseId;
    const requestId = cursor.entry.requestId;
    if (!responseId || !requestId || cursor.entry.status !== "completed") {
      return { chain: [], complete: false };
    }
    if (seenResponseIds.has(responseId)) return { chain: [], complete: false };
    seenResponseIds.add(responseId);

    const request = params.requests.get(requestId);
    if (!request || request.entry.status !== "completed") {
      return { chain: [], complete: false };
    }
    const turn = { request, response: cursor };
    chain.unshift(turn);

    const previousId = previousResponseId(turn);
    if (!previousId) break;
    cursor = params.responses.get(previousId);
    if (!cursor) return { chain: [], complete: false };
  }
  return { chain, complete: true };
}

function itemIdentity(params: {
  item: JsonObject;
  sessionId: string;
  turnOrdinal: number;
  phase: "input" | "output";
  itemOrdinal: number;
}): string {
  const type = typeof params.item.type === "string"
    ? params.item.type
    : typeof params.item.role === "string"
      ? `message:${params.item.role}`
      : "item";
  if (typeof params.item.id === "string") return `${type}:id:${params.item.id}`;
  if (typeof params.item.call_id === "string") return `${type}:call:${params.item.call_id}`;
  return `${type}:synthetic:${hashJson({
    sessionId: params.sessionId,
    type,
    turnOrdinal: params.turnOrdinal,
    phase: params.phase,
    itemOrdinal: params.itemOrdinal,
    item: params.item,
  })}`;
}

function isObservationOnlyItem(item: JsonObject): boolean {
  const type = String(item.type ?? "").toLowerCase();
  return type === "web_search_call" || type === "event_msg" || type === "turn_context";
}

function appendEffectiveItem(params: {
  item: JsonObject;
  sessionId: string;
  turnOrdinal: number;
  phase: "input" | "output";
  itemOrdinal: number;
  seen: Set<string>;
  replayableItems: CodexEffectiveHistoryItem[];
  observationOnlyItems: CodexEffectiveHistoryItem[];
}): void {
  const nativeId = itemIdentity(params);
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
    if ((type === "function_call_output" || type === "custom_tool_call_output") && entry.callId) {
      outputs.add(entry.callId);
    }
  }
  return Array.from(calls).filter((callId) => !outputs.has(callId)).sort();
}

function hasUncommittedActiveWork(params: {
  chain: CommittedTurn[];
  currentRequestId?: string;
  explicitHead: boolean;
  requests: Map<string, IndexedRequest>;
}): boolean {
  const headTurnOrdinal = params.chain.at(-1)?.request.entry.turnOrdinal ?? 0;
  const committedRequestIds = new Set(params.chain.map((turn) => turn.request.entry.requestId));
  return Array.from(params.requests.values()).some(({ entry }) => {
    if (entry.requestId === params.currentRequestId || entry.status === "failed") return false;
    if (committedRequestIds.has(entry.requestId)) return false;
    if (params.explicitHead) return false;
    if (entry.turnOrdinal <= headTurnOrdinal) return false;
    return true;
  });
}

function hasUncommittedResponseWork(params: {
  chain: CommittedTurn[];
  explicitHead: boolean;
  journal: CodexContextHistoryJournalEntry[];
  requests: Map<string, IndexedRequest>;
}): boolean {
  if (params.explicitHead) return false;
  const headJournalIndex = params.chain.at(-1)?.response.journalIndex ?? -1;
  return params.journal.some((entry, journalIndex) => {
    if (journalIndex <= headJournalIndex || entry.kind !== "response" || entry.status === "failed") return false;
    if (!entry.requestId) return true;
    return params.requests.get(entry.requestId)?.entry.status !== "failed";
  });
}

export async function buildCodexEffectiveHistory(params: {
  stateDir: string;
  sessionId: string;
  headResponseId?: string;
  currentRequestId?: string;
  rolloutParserBootstrap?: () => Promise<CodexEffectiveHistory | null>;
}): Promise<CodexEffectiveHistory> {
  const journalRead = await readCodexContextHistoryJournal(params.stateDir, params.sessionId);
  const requests = latestRequests(journalRead.entries);
  const responses = latestResponsesById(journalRead.entries);
  const committedChain = buildCommittedChain({
    headResponseId: params.headResponseId,
    requests,
    responses,
  });
  const journalIncomplete = Boolean(
    journalRead.readError
    || journalRead.malformedLineCount > 0
    || !committedChain.complete
    || (
      committedChain.chain.length === 0
      && journalRead.entries.some((entry) => (
        entry.status !== "failed"
        && !(entry.kind === "request" && entry.requestId === params.currentRequestId)
      ))
    )
    || hasUncommittedActiveWork({
      chain: committedChain.chain,
      currentRequestId: params.currentRequestId,
      explicitHead: params.headResponseId !== undefined,
      requests,
    })
    || hasUncommittedResponseWork({
      chain: committedChain.chain,
      explicitHead: params.headResponseId !== undefined,
      journal: journalRead.entries,
      requests,
    }),
  );
  if ((journalRead.entries.length === 0 || journalIncomplete) && params.rolloutParserBootstrap) {
    const bootstrapped = await params.rolloutParserBootstrap();
    if (bootstrapped) return bootstrapped;
  }

  const replayableItems: CodexEffectiveHistoryItem[] = [];
  const observationOnlyItems: CodexEffectiveHistoryItem[] = [];
  const seen = new Set<string>();
  for (const turn of committedChain.chain) {
    turn.request.entry.inputItems.forEach((item, itemOrdinal) => {
      appendEffectiveItem({
        item,
        sessionId: params.sessionId,
        turnOrdinal: turn.request.entry.turnOrdinal,
        phase: "input",
        itemOrdinal,
        seen,
        replayableItems,
        observationOnlyItems,
      });
    });
    turn.response.entry.outputItems.forEach((item, itemOrdinal) => {
      appendEffectiveItem({
        item,
        sessionId: params.sessionId,
        turnOrdinal: turn.request.entry.turnOrdinal,
        phase: "output",
        itemOrdinal,
        seen,
        replayableItems,
        observationOnlyItems,
      });
    });
  }

  const unresolved = unresolvedCallIds(replayableItems);
  const revision = `rev-${hashJson({
    replayableItems: replayableItems.map((entry) => ({
      stableItemId: entry.stableItemId,
      fingerprint: hashJson(entry.item),
    })),
    observationOnlyItems: observationOnlyItems.map((entry) => ({
      stableItemId: entry.stableItemId,
      fingerprint: hashJson(entry.item),
    })),
    unresolved,
    journalIncomplete,
  })}`;

  return {
    revision,
    replayableItems,
    observationOnlyItems,
    unresolvedCallIds: unresolved,
    source: journalRead.entries.length > 0 ? "proxy_journal" : "empty",
    incomplete: journalIncomplete,
  };
}
