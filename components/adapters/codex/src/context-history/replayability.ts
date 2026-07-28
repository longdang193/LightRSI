import type { JsonObject } from "./types.js";

export type CodexReplayabilityMode = "replayable" | "observation_only";

export type CodexReplayabilityReason =
  | "default_replayable"
  | "tool_closure_required"
  | "exact_payload_required"
  | "provider_observation"
  | "turn_context_instruction";

export type CodexItemReplayability = {
  mode: CodexReplayabilityMode;
  reason: CodexReplayabilityReason;
};

export function codexReplayabilityForItem(item: JsonObject): CodexItemReplayability {
  const type = String(item.type ?? "").toLowerCase();
  if (type === "web_search_call" || type === "event_msg") {
    return { mode: "observation_only", reason: "provider_observation" };
  }
  if (type === "turn_context") {
    return { mode: "observation_only", reason: "turn_context_instruction" };
  }
  if (
    type === "function_call"
    || type === "custom_tool_call"
    || type === "function_call_output"
    || type === "custom_tool_call_output"
  ) {
    return { mode: "replayable", reason: "tool_closure_required" };
  }
  if (type === "reasoning") {
    return { mode: "replayable", reason: "exact_payload_required" };
  }
  return { mode: "replayable", reason: "default_replayable" };
}

export function isCodexObservationOnlyItem(item: JsonObject): boolean {
  return codexReplayabilityForItem(item).mode === "observation_only";
}
