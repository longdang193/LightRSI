import type { RuntimeMessage } from "@lightrsi/kernel";

export type StabilizerRequestEnvelope = {
  session: {
    host: {
      hostId: string;
    };
  };
  model: string;
  instructions?: string;
  messages: RuntimeMessage[];
  tools?: unknown[];
};
