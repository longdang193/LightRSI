import { createApiTaskStateEstimator, type TaskStateEstimator } from "@lightrsi/eviction";

// Prefer the current platform namespace, then the previous platform namespace,
// and finally the preset-specific compatibility namespace.
function envValue(env: NodeJS.ProcessEnv, primary: string, fallback: string): string {
  const legacy = primary.replace(/^LIGHTRSI_/, "LIGHTMEM2_");
  const raw = env[primary] ?? env[legacy] ?? env[fallback] ?? "";
  return typeof raw === "string" ? raw.trim() : "";
}

function isTruthy(value: string): boolean {
  const v = value.toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export type ClaudeEstimatorConfig = {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  requestTimeoutMs?: number;
  batchTurns?: number;
  evictionLookaheadTurns?: number;
  inputMode?: "sliding_window" | "completed_summary_plus_active_turns";
  lifecycleMode?: "coupled" | "decoupled";
  evidenceMode?: "two_state" | "three_state";
};

export type ClaudeEstimatorConfigStatus = {
  enabled: boolean;
  configured: boolean;
};

function resolveEstimatorConnection(params?: {
  config?: ClaudeEstimatorConfig;
  env?: NodeJS.ProcessEnv;
}): ClaudeEstimatorConfigStatus & {
  baseUrl: string;
  apiKey: string;
  model: string;
} {
  const config = params?.config ?? {};
  const env = params?.env ?? process.env;
  const enabled =
    config.enabled ?? isTruthy(envValue(env, "LIGHTRSI_TASK_STATE_ESTIMATOR_ENABLED", "TOKENPILOT_TASK_STATE_ESTIMATOR_ENABLED"));
  const baseUrlRaw =
    config.baseUrl && config.baseUrl.trim().length > 0
      ? config.baseUrl.trim()
      : envValue(env, "LIGHTRSI_TASK_STATE_ESTIMATOR_BASE_URL", "TOKENPILOT_TASK_STATE_ESTIMATOR_BASE_URL");
  const baseUrl = baseUrlRaw ? baseUrlRaw.replace(/\/+$/, "") : "";
  const apiKey =
    config.apiKey && config.apiKey.trim().length > 0
      ? config.apiKey.trim()
      : envValue(env, "LIGHTRSI_TASK_STATE_ESTIMATOR_API_KEY", "TOKENPILOT_TASK_STATE_ESTIMATOR_API_KEY");
  const model =
    config.model && config.model.trim().length > 0
      ? config.model.trim()
      : envValue(env, "LIGHTRSI_TASK_STATE_ESTIMATOR_MODEL", "TOKENPILOT_TASK_STATE_ESTIMATOR_MODEL");
  return {
    enabled,
    configured: Boolean(baseUrl && apiKey && model),
    baseUrl,
    apiKey,
    model,
  };
}

export function inspectClaudeTaskStateEstimatorConfig(params?: {
  config?: ClaudeEstimatorConfig;
  env?: NodeJS.ProcessEnv;
}): ClaudeEstimatorConfigStatus {
  const { enabled, configured } = resolveEstimatorConnection(params);
  return { enabled, configured };
}

/**
 * Assemble the Claude-side task-state estimator from explicit config (wins) or
 * environment variables (fallback), mirroring OpenClaw's assembly pattern but
 * covering the estimator API fields the Claude path uses (baseUrl/apiKey/model
 * plus requestTimeoutMs/batchTurns/evictionLookaheadTurns/inputMode/lifecycleMode/
 * evidenceMode; promotion knobs are not exposed). Returns undefined — meaning "semantic path off" —
 * when the estimator is not enabled or is not fully configured
 * (baseUrl + apiKey + model all required). Never throws: a missing/partial
 * config yields undefined, not an error, so callers can simply skip semantics.
 *
 * env is injectable for testing; it defaults to process.env.
 */
export function resolveClaudeTaskStateEstimator(params?: {
  config?: ClaudeEstimatorConfig;
  env?: NodeJS.ProcessEnv;
}): TaskStateEstimator | undefined {
  const config = params?.config ?? {};
  const env = params?.env ?? process.env;
  const connection = resolveEstimatorConnection({ config, env });
  const { baseUrl, apiKey, model } = connection;
  if (!connection.enabled) return undefined;

  // Not fully configured → stay off rather than construct a broken estimator
  // (createApiTaskStateEstimator throws without all three).
  if (!connection.configured) return undefined;

  const timeoutRaw = envValue(env, "LIGHTRSI_TASK_STATE_ESTIMATOR_TIMEOUT_MS", "TOKENPILOT_TASK_STATE_ESTIMATOR_TIMEOUT_MS");
  const parsedTimeout = Number.parseInt(timeoutRaw, 10);
  const requestTimeoutMs =
    config.requestTimeoutMs ?? (Number.isFinite(parsedTimeout) ? Math.max(1000, parsedTimeout) : undefined);

  const batchTurnsRaw = envValue(env, "LIGHTRSI_TASK_STATE_ESTIMATOR_BATCH_TURNS", "TOKENPILOT_TASK_STATE_ESTIMATOR_BATCH_TURNS");
  const parsedBatchTurns = Number.parseInt(batchTurnsRaw, 10);
  const batchTurns =
    config.batchTurns ?? (Number.isFinite(parsedBatchTurns) ? Math.max(1, parsedBatchTurns) : undefined);

  const lookaheadRaw = envValue(env, "LIGHTRSI_TASK_STATE_ESTIMATOR_EVICTION_LOOKAHEAD_TURNS", "TOKENPILOT_TASK_STATE_ESTIMATOR_EVICTION_LOOKAHEAD_TURNS");
  const parsedLookahead = Number.parseInt(lookaheadRaw, 10);
  const evictionLookaheadTurns =
    config.evictionLookaheadTurns ?? (Number.isFinite(parsedLookahead) ? Math.max(1, parsedLookahead) : undefined);

  const envInputMode = envValue(env, "LIGHTRSI_TASK_STATE_ESTIMATOR_INPUT_MODE", "TOKENPILOT_TASK_STATE_ESTIMATOR_INPUT_MODE");
  const inputMode =
    config.inputMode ??
    (envInputMode === "sliding_window" || envInputMode === "completed_summary_plus_active_turns" ? envInputMode : undefined);

  const envLifecycleMode = envValue(env, "LIGHTRSI_TASK_STATE_ESTIMATOR_LIFECYCLE_MODE", "TOKENPILOT_TASK_STATE_ESTIMATOR_LIFECYCLE_MODE");
  const lifecycleMode =
    config.lifecycleMode ?? (envLifecycleMode === "decoupled" || envLifecycleMode === "coupled" ? envLifecycleMode : undefined);

  const envEvidenceMode = envValue(env, "LIGHTRSI_TASK_STATE_ESTIMATOR_EVIDENCE_MODE", "TOKENPILOT_TASK_STATE_ESTIMATOR_EVIDENCE_MODE");
  const evidenceMode =
    config.evidenceMode ?? (envEvidenceMode === "two_state" || envEvidenceMode === "three_state" ? envEvidenceMode : undefined);

  return createApiTaskStateEstimator({
    baseUrl,
    apiKey,
    model,
    ...(requestTimeoutMs !== undefined ? { requestTimeoutMs } : {}),
    ...(batchTurns !== undefined ? { batchTurns } : {}),
    ...(evictionLookaheadTurns !== undefined ? { evictionLookaheadTurns } : {}),
    ...(inputMode !== undefined ? { inputMode } : {}),
    ...(lifecycleMode !== undefined ? { lifecycleMode } : {}),
    ...(evidenceMode !== undefined ? { evidenceMode } : {}),
  });
}
