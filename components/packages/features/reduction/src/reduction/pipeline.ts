import type { RuntimeTurnContext, RuntimeTurnResult } from "@lightrsi/kernel";
import { resolveReductionPass, execOutputTruncationBeforeCallPass } from "./registry.js";
import type { ReadStateClassification } from "./read-state-compaction.js";
import type {
  DeepReadonly,
  ReductionMetadata,
  ReductionModuleConfig,
  ReductionPhase,
  ReductionPassRegistry,
  ReductionPassHandler,
  ReductionPassSpec,
  ReductionReportEntry,
  ReductionRequestState,
} from "./types.js";

export type RunReductionBeforeCallParams = {
  turnCtx: RuntimeTurnContext;
  passes: ReductionPassSpec[];
  registry?: ReductionPassRegistry;
  frozenSegmentIds?: ReadonlySet<string>;
  requestState?: ReductionRequestState;
};

export type RunReductionAfterCallParams = {
  turnCtx: RuntimeTurnContext;
  result: RuntimeTurnResult;
  passes: ReductionPassSpec[];
  registry?: ReductionPassRegistry;
};

const clonePass = (spec: ReductionPassSpec): ReductionPassSpec => ({
  ...spec,
  options: spec.options ? { ...spec.options } : undefined,
});

export function resolveReductionPasses(
  cfg: ReductionModuleConfig = {},
): ReductionPassSpec[] {
  if (Array.isArray(cfg.passes) && cfg.passes.length > 0) {
    return cfg.passes.map(clonePass);
  }

  const passOptions = cfg.passOptions ?? {};

  return [
    {
      id: "read_state_compaction",
      phase: "before_call",
      target: "context_segment",
      options: {
        enabled: true,
        ...(passOptions.read_state_compaction ?? {}),
      },
    },
    {
      id: "tool_payload_trim",
      phase: "before_call",
      target: "tool_payload",
      options: {
        maxChars: cfg.maxToolChars ?? 1200,
        noteLabel: cfg.strategy ?? "rule",
        ...(passOptions.tool_payload_trim ?? {}),
      },
    },
    {
      id: "html_slimming",
      phase: "before_call",
      target: "structured_payload",
      options: {
        enabled: true,
        ...(passOptions.html_slimming ?? {}),
      },
    },
    {
      id: "exec_output_truncation",
      phase: "before_call",
      target: "context_segment",
      options: {
        enabled: true,
        ...(passOptions.exec_output_truncation ?? {}),
      },
    },
    {
      id: "agents_startup_optimization",
      phase: "before_call",
      target: "context_segment",
      options: {
        enabled: true,
        ...(passOptions.agents_startup_optimization ?? {}),
      },
    },
    {
      id: "format_slimming",
      phase: "after_call",
      target: "result_content",
      options: {
        removeCodeFences: true,
        collapseBlankLines: true,
        trimTrailingSpaces: true,
        ...(passOptions.format_slimming ?? {}),
      },
    },
    {
      id: "format_cleaning",
      phase: "after_call",
      target: "result_content",
      options: {
        enabled: true,
        ...(passOptions.format_cleaning ?? {}),
      },
    },
    {
      id: "path_truncation",
      phase: "after_call",
      target: "result_content",
      options: {
        enabled: true,
        ...(passOptions.path_truncation ?? {}),
      },
    },
    {
      id: "image_downsample",
      phase: "after_call",
      target: "result_content",
      options: {
        enabled: true,
        ...(passOptions.image_downsample ?? {}),
      },
    },
    {
      id: "line_number_strip",
      phase: "after_call",
      target: "result_content",
      options: {
        enabled: true,
        ...(passOptions.line_number_strip ?? {}),
      },
    },
  ];
}

const totalSegmentChars = (ctx: RuntimeTurnContext): number =>
  ctx.segments.reduce((sum, segment) => sum + segment.text.length, 0);

const isPhaseMatch = (spec: ReductionPassSpec, phase: ReductionPhase): boolean =>
  (spec.phase ?? "before_call") === phase;

const cloneTurnContext = (turnCtx: RuntimeTurnContext): RuntimeTurnContext =>
  structuredClone(turnCtx);

const publishTurnContext = (target: RuntimeTurnContext, source: RuntimeTurnContext): void => {
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete (target as Record<string, unknown>)[key];
  }
  Object.assign(target, source);
};

const EVENT_PRESERVING_BUILTINS = new Set([
  "read_state_compaction",
  "tool_payload_trim",
  "exec_output_truncation",
]);

const buildSegmentIndex = (turnCtx: RuntimeTurnContext): ReadonlyMap<string, DeepReadonly<RuntimeTurnContext["segments"][number]>> =>
  new Map(turnCtx.segments.map((segment) => [segment.id, segment]));

const cloneReadStateClassifications = (
  classifications: ReadonlyMap<string, DeepReadonly<ReadStateClassification>> | undefined,
): ReadonlyMap<string, DeepReadonly<ReadStateClassification>> | undefined =>
  classifications
    ? new Map([...classifications].map(([id, classification]) => [id, structuredClone(classification)] as const))
    : undefined;

const buildPrivateRequestState = (
  turnCtx: RuntimeTurnContext,
  acceptedState: ReductionRequestState,
): ReductionRequestState => ({
  segmentIndex: buildSegmentIndex(turnCtx),
  readStateClassifications: cloneReadStateClassifications(acceptedState.readStateClassifications),
});

const canReuseReadStateClassifications = (
  spec: ReductionPassSpec,
  registry: ReductionPassRegistry | undefined,
): boolean =>
  !Object.prototype.hasOwnProperty.call(registry ?? {}, spec.id)
  && EVENT_PRESERVING_BUILTINS.has(spec.id);

export function readReductionMetadata(metadata?: Record<string, unknown>): ReductionMetadata {
  const raw = metadata?.reduction;
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  return {
    beforeCall: Array.isArray(obj.beforeCall) ? (obj.beforeCall as ReductionReportEntry[]) : undefined,
    afterCall: Array.isArray(obj.afterCall) ? (obj.afterCall as ReductionReportEntry[]) : undefined,
  };
}

export async function runReductionBeforeCall(
  params: RunReductionBeforeCallParams,
): Promise<{ turnCtx: RuntimeTurnContext; report: ReductionReportEntry[] }> {
  const { turnCtx, passes, registry, frozenSegmentIds } = params;
  const requestState = params.requestState ?? {};
  let currentCtx: RuntimeTurnContext = {
    ...turnCtx,
    segments: frozenSegmentIds?.size
      ? turnCtx.segments.filter((segment) => !frozenSegmentIds.has(segment.id))
      : turnCtx.segments,
  };
  const report: ReductionReportEntry[] = [];
  requestState.segmentIndex = buildSegmentIndex(currentCtx);
  requestState.readStateClassifications = undefined;

  for (const rawSpec of passes) {
    const spec = clonePass(rawSpec);
    if (!isPhaseMatch(spec, "before_call")) continue;
    if (spec.enabled === false) {
      report.push({
        id: spec.id,
        phase: "before_call",
        target: spec.target ?? "result_content",
        changed: false,
        skippedReason: "disabled",
        beforeChars: totalSegmentChars(currentCtx),
        afterChars: totalSegmentChars(currentCtx),
      });
      continue;
    }

    // Special handler for exec_output_truncation beforeCall
    const handler = spec.id === "exec_output_truncation"
      ? execOutputTruncationBeforeCallPass
      : resolveReductionPass(spec.id, registry);

    if (!handler?.beforeCall) {
      report.push({
        id: spec.id,
        phase: "before_call",
        target: spec.target ?? "result_content",
        changed: false,
        skippedReason: handler ? "no_before_call_handler" : "unknown_pass",
        beforeChars: totalSegmentChars(currentCtx),
        afterChars: totalSegmentChars(currentCtx),
      });
      continue;
    }

    const beforeChars = totalSegmentChars(currentCtx);
    const immutableInput = handler.immutableInput === true;
    const workingCtx = immutableInput ? currentCtx : cloneTurnContext(currentCtx);
    const handlerRequestState = immutableInput
      ? requestState
      : buildPrivateRequestState(workingCtx, requestState);
    const startedAt = Date.now();
    let outcome: Awaited<ReturnType<NonNullable<ReductionPassHandler["beforeCall"]>>>;
    try {
      outcome = await handler.beforeCall({
        turnCtx: workingCtx,
        spec,
        requestState: handlerRequestState,
      });
    } catch (error) {
      report.push({
        id: spec.id,
        phase: "before_call",
        target: spec.target ?? "result_content",
        changed: false,
        skippedReason: "pass_error",
        note: error instanceof Error ? error.message : String(error),
        beforeChars,
        afterChars: beforeChars,
        durationMs: Date.now() - startedAt,
      });
      continue;
    }

    if (outcome.turnCtx) {
      currentCtx = outcome.metadata
        ? {
            ...outcome.turnCtx,
            metadata: {
              ...(outcome.turnCtx.metadata ?? {}),
              ...outcome.metadata,
            },
          }
        : outcome.turnCtx;
    } else if (!immutableInput) {
      currentCtx = outcome.metadata
        ? {
            ...workingCtx,
            metadata: {
              ...(workingCtx.metadata ?? {}),
              ...outcome.metadata,
            },
          }
        : workingCtx;
    } else if (outcome.metadata) {
      currentCtx = {
        ...currentCtx,
        metadata: {
          ...(currentCtx.metadata ?? {}),
          ...outcome.metadata,
        },
      };
    }

    report.push({
      id: spec.id,
      phase: "before_call",
      target: spec.target ?? "result_content",
      changed: outcome.changed,
      note: outcome.note,
      skippedReason: outcome.skippedReason,
      beforeChars,
      afterChars: totalSegmentChars(currentCtx),
      durationMs: Date.now() - startedAt,
      touchedSegmentIds: outcome.touchedSegmentIds,
    });
    requestState.segmentIndex = buildSegmentIndex(currentCtx);
    if (!canReuseReadStateClassifications(spec, registry)) {
      requestState.readStateClassifications = undefined;
    }
  }

  return { turnCtx: currentCtx, report };
}

export async function runReductionAfterCall(
  params: RunReductionAfterCallParams,
): Promise<{ result: RuntimeTurnResult; report: ReductionReportEntry[] }> {
  const { turnCtx, result, passes, registry } = params;
  let currentResult: RuntimeTurnResult = { ...result };
  const report: ReductionReportEntry[] = [];

  for (const rawSpec of passes) {
    const spec = clonePass(rawSpec);
    if (!isPhaseMatch(spec, "after_call")) continue;
    if (spec.enabled === false) {
      report.push({
        id: spec.id,
        phase: "after_call",
        target: spec.target ?? "result_content",
        changed: false,
        skippedReason: "disabled",
        beforeChars: currentResult.content.length,
        afterChars: currentResult.content.length,
      });
      continue;
    }

    const handler = resolveReductionPass(spec.id, registry);
    if (!handler?.afterCall) {
      report.push({
        id: spec.id,
        phase: "after_call",
        target: spec.target ?? "result_content",
        changed: false,
        skippedReason: handler ? "no_after_call_handler" : "unknown_pass",
        beforeChars: currentResult.content.length,
        afterChars: currentResult.content.length,
      });
      continue;
    }

    const beforeChars = currentResult.content.length;
    const immutableInput = handler.immutableInput === true;
    const workingResult = immutableInput ? currentResult : structuredClone(currentResult);
    const workingTurnCtx = immutableInput ? turnCtx : cloneTurnContext(turnCtx);
    const startedAt = Date.now();
    let outcome: Awaited<ReturnType<NonNullable<ReductionPassHandler["afterCall"]>>>;
    try {
      outcome = await handler.afterCall({
        turnCtx: workingTurnCtx,
        originalResult: immutableInput ? result : structuredClone(result),
        currentResult: workingResult,
        spec,
      });
    } catch (error) {
      report.push({
        id: spec.id,
        phase: "after_call",
        target: spec.target ?? "result_content",
        changed: false,
        skippedReason: "pass_error",
        note: error instanceof Error ? error.message : String(error),
        beforeChars,
        afterChars: beforeChars,
        durationMs: Date.now() - startedAt,
      });
      continue;
    }

    if (!immutableInput) publishTurnContext(turnCtx, workingTurnCtx);

    if (outcome.result) {
      currentResult = outcome.metadata
        ? {
            ...outcome.result,
            metadata: {
              ...(outcome.result.metadata ?? {}),
              ...outcome.metadata,
            },
          }
        : outcome.result;
    } else if (!immutableInput) {
      currentResult = outcome.metadata
        ? {
            ...workingResult,
            metadata: {
              ...(workingResult.metadata ?? {}),
              ...outcome.metadata,
            },
          }
        : workingResult;
    } else if (outcome.metadata) {
      currentResult = {
        ...currentResult,
        metadata: {
          ...(currentResult.metadata ?? {}),
          ...outcome.metadata,
        },
      };
    }

    report.push({
      id: spec.id,
      phase: "after_call",
      target: spec.target ?? "result_content",
      changed: outcome.changed,
      note: outcome.note,
      skippedReason: outcome.skippedReason,
      beforeChars,
      afterChars: currentResult.content.length,
      durationMs: Date.now() - startedAt,
    });
  }

  return { result: currentResult, report };
}
