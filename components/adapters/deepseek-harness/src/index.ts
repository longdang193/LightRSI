/**
 * TokenPilot DeepSeek Harness plugin entry (Cordis).
 *
 * DSH's plugin loader calls `apply(ctx, config)` with the live plugin context
 * and the profile/bundle config patch. This module is intentionally tiny: it
 * normalizes config and, when enabled, registers the eviction handler on
 * `agent/pre-step`. Everything else lives in the sibling modules.
 *
 * `ctx` is typed against the structural `DshPluginContext` bridge, so this
 * package needs no `@deepseek-ai/cordis` import — the real Cordis context
 * satisfies the subset used here. `inject` tells DSH which services to make
 * available before `apply` runs.
 *
 * NOTE: master flag OFF installs nothing (no listener). Even ON, the handler
 * is a safe no-op that defers on `agent/pre-step` until R3/R4 land — it never
 * mutates the surface. So installing this plugin is observable (it attaches to
 * pre-step) but has no eviction effect yet.
 */

import { normalizeDshConfig } from "./config.js";
import { registerEvictionPreStep } from "./eviction-engine.js";
import type { DshPluginContext } from "./types.js";

/** Cordis plugin name. */
export const name = "tokenpilot-dsh";

/** Host services DSH must provide before `apply` runs. */
export const inject = ["tokenMeter"];

/** Cordis plugin entry. */
export function apply(ctx: DshPluginContext, rawConfig?: unknown): void {
  const config = normalizeDshConfig(rawConfig);
  if (!config.enabled) return; // master flag off: attach nothing
  registerEvictionPreStep(ctx, config);
}

export default apply;
