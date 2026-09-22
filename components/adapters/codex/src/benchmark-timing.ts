import { performance } from "node:perf_hooks";

export type BenchmarkResponseMode = "streamed" | "buffered" | "nonstreaming";

export type BenchmarkTimingMark =
  | "handlerStart"
  | "bodyComplete"
  | "dispatchStart"
  | "upstreamHeaders"
  | "firstUsefulOutput"
  | "responseFinish"
  | "durableCompletion";

export type BenchmarkTimingSnapshot = {
  responseMode: BenchmarkResponseMode;
  complete: boolean;
  marks: Partial<Record<BenchmarkTimingMark, number>>;
  durationsMs: Partial<Record<
    | "handlerToBody"
    | "bodyToDispatch"
    | "dispatchToHeaders"
    | "dispatchToFirstUsefulOutput"
    | "handlerToFinish"
    | "handlerToDurableCompletion",
    number
  >>;
};

const requiredMarks: readonly BenchmarkTimingMark[] = [
  "handlerStart",
  "bodyComplete",
  "dispatchStart",
  "upstreamHeaders",
  "firstUsefulOutput",
  "responseFinish",
  "durableCompletion",
];

function duration(
  marks: Partial<Record<BenchmarkTimingMark, number>>,
  start: BenchmarkTimingMark,
  end: BenchmarkTimingMark,
): number | undefined {
  const startAt = marks[start];
  const endAt = marks[end];
  if (startAt === undefined || endAt === undefined) return undefined;
  return endAt - startAt;
}

export function createBenchmarkTiming(now: () => number = () => performance.now()) {
  const marks: Partial<Record<BenchmarkTimingMark, number>> = {};

  return {
    mark(name: BenchmarkTimingMark): void {
      if (marks[name] === undefined) marks[name] = now();
    },
    snapshot(responseMode: BenchmarkResponseMode): BenchmarkTimingSnapshot {
      const durationsMs: BenchmarkTimingSnapshot["durationsMs"] = {};
      const phaseDurations = [
        ["handlerToBody", "handlerStart", "bodyComplete"],
        ["bodyToDispatch", "bodyComplete", "dispatchStart"],
        ["dispatchToHeaders", "dispatchStart", "upstreamHeaders"],
        ["dispatchToFirstUsefulOutput", "dispatchStart", "firstUsefulOutput"],
        ["handlerToFinish", "handlerStart", "responseFinish"],
        ["handlerToDurableCompletion", "handlerStart", "durableCompletion"],
      ] as const;
      for (const [name, start, end] of phaseDurations) {
        const elapsed = duration(marks, start, end);
        if (elapsed !== undefined) durationsMs[name] = elapsed;
      }
      return {
        responseMode,
        complete: requiredMarks.every((name) => marks[name] !== undefined),
        marks: { ...marks },
        durationsMs,
      };
    },
  };
}
