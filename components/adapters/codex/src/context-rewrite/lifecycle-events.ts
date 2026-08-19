import {
  appendContextRewriteEvent,
  type ContextRewriteEventInput,
} from "@lightrsi/host-adapter";

type CodexContextRewriteEventInput = Omit<
  ContextRewriteEventInput,
  "hostId" | "sessionId" | "mode"
>;

type ContextRewriteEventAppender = typeof appendContextRewriteEvent;

export type CodexContextRewriteLifecycle = {
  append(input: CodexContextRewriteEventInput): Promise<void>;
};

/**
 * Builds the Codex runtime bridge to the shared context-rewrite event schema.
 * Event persistence is deliberately best effort: observability must never turn
 * a valid provider request into a failure.
 */
export function createCodexContextRewriteLifecycle(params: {
  stateDir: string;
  sessionId: string;
  appendEvent?: ContextRewriteEventAppender;
}): CodexContextRewriteLifecycle {
  const appendEvent = params.appendEvent ?? appendContextRewriteEvent;
  return {
    async append(input): Promise<void> {
      try {
        await appendEvent(params.stateDir, {
          ...input,
          hostId: "codex",
          sessionId: params.sessionId,
          mode: "response_chain_rebase",
        });
      } catch {
        // Lifecycle traces are advisory and must not affect proxy availability.
      }
    },
  };
}
