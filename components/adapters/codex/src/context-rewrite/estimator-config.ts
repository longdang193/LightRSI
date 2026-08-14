import {
  createApiTaskStateEstimator,
  type TaskStateEstimator,
  type TaskStateEstimatorApiConfig,
} from "@lightmem2/eviction";

export type CodexEstimatorStatus = "disabled" | "incomplete" | "ready";
export type CodexEstimatorRequiredField = "baseUrl" | "apiKey" | "model";
export type CodexEstimatorReasonCode =
  | "feature_disabled"
  | "missing_required_config"
  | "estimator_construction_failed"
  | "ready";

export type CodexResolvedEstimatorConfig = TaskStateEstimatorApiConfig & {
  enabled: boolean;
  requestTimeoutMs: number;
  batchTurns: number;
  evictionLookaheadTurns: number;
  inputMode: "sliding_window" | "completed_summary_plus_active_turns";
  lifecycleMode: "coupled" | "decoupled";
  evidenceMode: "three_state" | "two_state";
};

export type CodexEstimatorResolution = {
  status: CodexEstimatorStatus;
  config: CodexResolvedEstimatorConfig;
  estimator?: TaskStateEstimator;
  missingFields: CodexEstimatorRequiredField[];
  reasonCode: CodexEstimatorReasonCode;
};

export type CodexEstimatorStatusView = {
  status: CodexEstimatorStatus;
  model: string | null;
  baseUrlConfigured: boolean;
  apiKeyConfigured: boolean;
  requestTimeoutMs: number;
  batchTurns: number;
  evictionLookaheadTurns: number;
};

export type CodexEstimatorDiagnostic = CodexEstimatorStatusView & {
  missingFields: CodexEstimatorRequiredField[];
};

type EstimatorEnvironment = Record<string, string | undefined>;

export type ResolveCodexEstimatorOptions = {
  config?: TaskStateEstimatorApiConfig;
  env?: EstimatorEnvironment;
  createEstimator?: (config: TaskStateEstimatorApiConfig) => TaskStateEstimator;
};

const LIGHTMEM2_PREFIX = "LIGHTMEM2_TASK_STATE_ESTIMATOR_";
const TOKENPILOT_PREFIX = "TOKENPILOT_TASK_STATE_ESTIMATOR_";

function envValue(env: EstimatorEnvironment, suffix: string): string | undefined {
  for (const prefix of [LIGHTMEM2_PREFIX, TOKENPILOT_PREFIX]) {
    const value = env[`${prefix}${suffix}`]?.trim();
    if (value) return value;
  }
  return undefined;
}

function envBoolean(env: EstimatorEnvironment, suffix: string): boolean | undefined {
  const value = envValue(env, suffix)?.toLowerCase();
  if (!value) return undefined;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return undefined;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function explicitOrEnvString(
  explicit: string | undefined,
  env: EstimatorEnvironment,
  suffix: string,
): string | undefined {
  const value = explicit?.trim() || envValue(env, suffix);
  return value || undefined;
}

function resolveInputMode(value: unknown): CodexResolvedEstimatorConfig["inputMode"] {
  return value === "completed_summary_plus_active_turns"
    ? "completed_summary_plus_active_turns"
    : "sliding_window";
}

function resolveLifecycleMode(value: unknown): CodexResolvedEstimatorConfig["lifecycleMode"] {
  return value === "decoupled" ? "decoupled" : "coupled";
}

function resolveEvidenceMode(value: unknown): CodexResolvedEstimatorConfig["evidenceMode"] {
  return value === "two_state" ? "two_state" : "three_state";
}

export function resolveCodexTaskStateEstimator(
  options: ResolveCodexEstimatorOptions = {},
): CodexEstimatorResolution {
  const explicit = options.config ?? {};
  const env = options.env ?? process.env;
  const enabled = explicit.enabled ?? envBoolean(env, "ENABLED") ?? false;
  const baseUrl = explicitOrEnvString(explicit.baseUrl, env, "BASE_URL")?.replace(/\/+$/, "");
  const apiKey = explicitOrEnvString(explicit.apiKey, env, "API_KEY");
  const model = explicitOrEnvString(explicit.model, env, "MODEL");
  const requestTimeoutMs = clampNumber(
    explicit.requestTimeoutMs ?? envValue(env, "TIMEOUT_MS") ?? envValue(env, "REQUEST_TIMEOUT_MS"),
    60_000,
    1_000,
    300_000,
  );
  const batchTurns = clampNumber(
    explicit.batchTurns ?? envValue(env, "BATCH_TURNS"),
    5,
    1,
    100,
  );
  const evictionLookaheadTurns = clampNumber(
    explicit.evictionLookaheadTurns ?? envValue(env, "EVICTION_LOOKAHEAD_TURNS"),
    3,
    1,
    100,
  );
  const config: CodexResolvedEstimatorConfig = {
    ...explicit,
    enabled,
    baseUrl,
    apiKey,
    model,
    requestTimeoutMs,
    batchTurns,
    evictionLookaheadTurns,
    inputMode: resolveInputMode(explicit.inputMode ?? envValue(env, "INPUT_MODE")),
    lifecycleMode: resolveLifecycleMode(explicit.lifecycleMode ?? envValue(env, "LIFECYCLE_MODE")),
    evidenceMode: resolveEvidenceMode(explicit.evidenceMode ?? envValue(env, "EVIDENCE_MODE")),
  };

  if (!enabled) {
    return {
      status: "disabled",
      config,
      missingFields: [],
      reasonCode: "feature_disabled",
    };
  }

  const missingFields: CodexEstimatorRequiredField[] = [];
  if (!baseUrl) missingFields.push("baseUrl");
  if (!apiKey) missingFields.push("apiKey");
  if (!model) missingFields.push("model");
  if (missingFields.length > 0) {
    return {
      status: "incomplete",
      config,
      missingFields,
      reasonCode: "missing_required_config",
    };
  }

  try {
    return {
      status: "ready",
      config,
      estimator: (options.createEstimator ?? createApiTaskStateEstimator)(config),
      missingFields: [],
      reasonCode: "ready",
    };
  } catch {
    return {
      status: "incomplete",
      config,
      missingFields: [],
      reasonCode: "estimator_construction_failed",
    };
  }
}

export function codexEstimatorStatusView(
  resolution: CodexEstimatorResolution,
): CodexEstimatorStatusView {
  return {
    status: resolution.status,
    model: resolution.config.model ?? null,
    baseUrlConfigured: Boolean(resolution.config.baseUrl),
    apiKeyConfigured: Boolean(resolution.config.apiKey),
    requestTimeoutMs: resolution.config.requestTimeoutMs,
    batchTurns: resolution.config.batchTurns,
    evictionLookaheadTurns: resolution.config.evictionLookaheadTurns,
  };
}

export function codexEstimatorDiagnostic(
  resolution: CodexEstimatorResolution,
): CodexEstimatorDiagnostic {
  return {
    ...codexEstimatorStatusView(resolution),
    missingFields: resolution.missingFields,
  };
}
