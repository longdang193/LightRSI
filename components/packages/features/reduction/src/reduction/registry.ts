import { formatSlimmingPass } from "../passes/pass-format-slimming.js";
import { htmlSlimmingPass } from "../passes/pass-html-slimming.js";
import { toolPayloadTrimPass } from "../passes/pass-tool-payload-trim.js";
import { execOutputTruncationPass, execOutputTruncationBeforeCall } from "../passes/pass-exec-output-truncation.js";
import { readStateCompactionPass } from "../passes/pass-read-state-compaction.js";
import { formatCleaningPass } from "../passes/pass-format-cleaning.js";
import { pathTruncationPass } from "../passes/pass-path-truncation.js";
import { imageDownsamplePass } from "../passes/pass-image-downsample.js";
import { lineNumberStripPass } from "../passes/pass-line-number-strip.js";
import { agentsStartupOptimizationPass } from "../passes/pass-agents-startup-optimization.js";
import type {
  BuiltinReductionPassId,
  ReductionPassId,
  ReductionPassRegistry,
  ReductionPassHandler,
} from "./types.js";

const immutable = (handler: ReductionPassHandler): ReductionPassHandler => ({
  ...handler,
  immutableInput: true,
});

const BUILTIN_PASSES: Record<BuiltinReductionPassId, ReductionPassHandler> = {
  read_state_compaction: immutable(readStateCompactionPass),
  tool_payload_trim: immutable(toolPayloadTrimPass),
  html_slimming: immutable(htmlSlimmingPass),
  format_slimming: immutable(formatSlimmingPass),
  exec_output_truncation: immutable(execOutputTruncationPass),
  format_cleaning: immutable(formatCleaningPass),
  path_truncation: immutable(pathTruncationPass),
  image_downsample: immutable(imageDownsamplePass),
  line_number_strip: immutable(lineNumberStripPass),
  agents_startup_optimization: immutable(agentsStartupOptimizationPass),
};

// Passes that need both beforeCall and afterCall handlers
export const execOutputTruncationBeforeCallPass = immutable(execOutputTruncationBeforeCall);

export function resolveReductionPass(
  id: ReductionPassId,
  overrides?: ReductionPassRegistry,
): ReductionPassHandler | undefined {
  return overrides?.[id] ?? BUILTIN_PASSES[id as BuiltinReductionPassId];
}

export function listBuiltinReductionPasses(): BuiltinReductionPassId[] {
  return Object.keys(BUILTIN_PASSES) as BuiltinReductionPassId[];
}
