import { enqueueEventTrace } from "@lightrsi/host-adapter";

export async function appendTrace(stateDir: string, payload: Record<string, unknown>): Promise<void> {
  enqueueEventTrace(stateDir, payload);
}
