import {
  hasRecoveryMarker,
  hasRecoverySkipReductionFlag,
  isRecoveryText,
  MEMORY_FAULT_RECOVER_TOOL_NAME,
} from "@lightrsi/artifact-store";

const asObject = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;

export function isRecoveryExemptSegment(segment: {
  id: string;
  text: string;
  metadata?: unknown;
}): boolean {
  const metadata = asObject(segment.metadata);
  const toolPayload = asObject(metadata?.toolPayload);
  const toolName = typeof metadata?.toolName === "string"
    ? metadata.toolName
    : typeof toolPayload?.toolName === "string"
      ? toolPayload.toolName
      : undefined;

  return hasRecoverySkipReductionFlag(metadata, asObject)
    || hasRecoveryMarker(metadata, asObject)
    || toolName?.trim().toLowerCase() === MEMORY_FAULT_RECOVER_TOOL_NAME
    || isRecoveryText(segment.text);
}
