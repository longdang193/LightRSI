import type { CodexUpstreamResponse } from "./types.js";

export function cloneJson<T>(value: T): T {
  return value == null ? value : JSON.parse(JSON.stringify(value)) as T;
}

export function stableInputKey(item: unknown): string {
  return JSON.stringify(item);
}

export function hasNoReplayMarker(response: Pick<CodexUpstreamResponse, "headers">): boolean {
  return Object.entries(response.headers).some(([name, value]) => (
    name.toLowerCase() === "x-9router-no-replay" && value === "1"
  ));
}
