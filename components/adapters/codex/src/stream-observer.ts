/* eslint-disable @typescript-eslint/no-explicit-any */

import { collectCodexResponseItemsFromStream } from "./context-history/sse-item-collector.js";

export type CodexStreamSnapshot = {
  assistantText: string;
  usage?: Record<string, unknown>;
  responseId?: string;
  previousResponseId?: string;
  responsePromptCacheKey?: string;
  rawStreamText: string;
};

export function snapshotCodexResponsesStream(rawStreamText: string): CodexStreamSnapshot {
  const collected = collectCodexResponseItemsFromStream(rawStreamText);

  return {
    assistantText: collected.assistantText,
    usage: collected.usage,
    responseId: collected.responseId,
    previousResponseId: collected.previousResponseId,
    responsePromptCacheKey: collected.responsePromptCacheKey,
    rawStreamText,
  };
}
