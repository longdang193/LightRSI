import { enqueueEventTrace } from "@lightrsi/host-adapter";

export async function appendClaudeCodeTrace(
  stateDir: string,
  payload: Record<string, unknown>,
): Promise<void> {
  enqueueEventTrace(stateDir, payload);
}
