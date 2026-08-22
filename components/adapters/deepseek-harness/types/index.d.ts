export interface DshPluginContext {
  on(
    event: "agent/pre-step",
    handler: (payload: unknown, next: () => Promise<unknown>) => Promise<unknown>,
  ): void;
  tokenMeter: {
    measure(session: unknown): unknown;
  };
}

export declare const name = "tokenpilot-dsh";
export declare const inject: string[];
export declare function apply(ctx: DshPluginContext, rawConfig?: unknown): void;
export default apply;
