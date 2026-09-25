import { enqueueEventTrace } from "@lightrsi/host-adapter";

export function appendTrace(stateDir: string, payload: Record<string, unknown>): Promise<void> {
  return enqueueEventTrace(stateDir, payload);
}