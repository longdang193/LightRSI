import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type AcceptancePhase = "before_restart" | "after_restart";

export interface AcceptanceSentinels {
  uuid: string;
  evict: string;
  keep: string;
}

export interface CapturedRequest {
  phase: AcceptancePhase;
  body: unknown;
  fallback: boolean;
}

export interface ToolClosureResult {
  complete: boolean;
  missingOutputs: string[];
  orphanOutputs: string[];
}

export interface AcceptancePhaseResult {
  phase: AcceptancePhase;
  requestCount: number;
  keepFound: boolean;
  evictFound: boolean;
  toolClosure: ToolClosureResult;
  passed: boolean;
}

export interface AcceptanceSummary {
  passed: boolean;
  requestCount: number;
  savedCharacters: number;
  fallbackCount: number;
  phases: AcceptancePhaseResult[];
}

export interface AcceptanceHarnessInput {
  sentinels: AcceptanceSentinels;
  requests: readonly CapturedRequest[];
  originalCharacters: number;
  rewrittenCharacters: number;
}

export interface TemporaryAcceptanceEnvironment {
  rootDir: string;
  homeDir: string;
  stateDir: string;
  env: NodeJS.ProcessEnv;
  cleanup: () => void;
}

interface CaptureOptions {
  fallback?: boolean;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TOOL_CALL_TYPES = new Set(["function_call", "custom_tool_call"]);

const TOOL_OUTPUT_TYPES = new Map([
  ["function_call_output", "function_call"],
  ["custom_tool_call_output", "custom_tool_call"],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readItemId(item: Record<string, unknown>): string | null {
  if (typeof item.call_id === "string" && item.call_id.length > 0) {
    return item.call_id;
  }

  if (typeof item.id === "string" && item.id.length > 0) {
    return item.id;
  }

  return null;
}

function visitRecords(
  value: unknown,
  visitor: (record: Record<string, unknown>) => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      visitRecords(item, visitor);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  visitor(value);

  for (const child of Object.values(value)) {
    visitRecords(child, visitor);
  }
}

function collectStrings(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    output.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, output);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const child of Object.values(value)) {
    collectStrings(child, output);
  }
}

function requestContains(body: unknown, sentinel: string): boolean {
  const strings: string[] = [];
  collectStrings(body, strings);
  return strings.some((value) => value.includes(sentinel));
}

function selectEffectiveRequest(
  requests: readonly CapturedRequest[],
): CapturedRequest | null {
  for (let index = requests.length - 1; index >= 0; index -= 1) {
    if (!requests[index].fallback) {
      return requests[index];
    }
  }

  return requests.at(-1) ?? null;
}

export function createAcceptanceSentinels(
  uuid: string,
): AcceptanceSentinels {
  const normalized = uuid.toLowerCase();

  if (!UUID_PATTERN.test(normalized)) {
    throw new Error(`Invalid acceptance sentinel UUID: ${uuid}`);
  }

  return {
    uuid: normalized,
    evict: `EVICT_ME_${normalized}`,
    keep: `KEEP_ME_${normalized}`,
  };
}

export class MockUpstreamRecorder {
  private readonly captured: CapturedRequest[] = [];

  record(
    phase: AcceptancePhase,
    body: unknown,
    options: CaptureOptions = {},
  ): void {
    this.captured.push({
      phase,
      body,
      fallback: options.fallback === true,
    });
  }

  requests(): readonly CapturedRequest[] {
    return this.captured.slice();
  }

  clear(): void {
    this.captured.length = 0;
  }
}

export function inspectToolClosure(body: unknown): ToolClosureResult {
  const calls = new Set<string>();
  const outputs = new Set<string>();

  visitRecords(body, (item) => {
    const type = typeof item.type === "string" ? item.type : null;
    const itemId = readItemId(item);

    if (type === null || itemId === null) {
      return;
    }

    if (TOOL_CALL_TYPES.has(type)) {
      calls.add(`${type}:${itemId}`);
      return;
    }

    const callType = TOOL_OUTPUT_TYPES.get(type);
    if (callType !== undefined) {
      outputs.add(`${callType}:${itemId}`);
    }
  });

  const missingOutputs = [...calls]
    .filter((key) => !outputs.has(key))
    .sort();

  const orphanOutputs = [...outputs]
    .filter((key) => !calls.has(key))
    .sort();

  return {
    complete: missingOutputs.length === 0 && orphanOutputs.length === 0,
    missingOutputs,
    orphanOutputs,
  };
}

export function inspectAcceptancePhase(
  phase: AcceptancePhase,
  requests: readonly CapturedRequest[],
  sentinels: AcceptanceSentinels,
): AcceptancePhaseResult {
  const phaseRequests = requests.filter((request) => request.phase === phase);
  const effectiveRequest = selectEffectiveRequest(phaseRequests);

  if (effectiveRequest === null) {
    return {
      phase,
      requestCount: 0,
      keepFound: false,
      evictFound: false,
      toolClosure: {
        complete: false,
        missingOutputs: [],
        orphanOutputs: [],
      },
      passed: false,
    };
  }

  const keepFound = requestContains(effectiveRequest.body, sentinels.keep);
  const evictFound = requestContains(effectiveRequest.body, sentinels.evict);
  const toolClosure = inspectToolClosure(effectiveRequest.body);

  return {
    phase,
    requestCount: phaseRequests.length,
    keepFound,
    evictFound,
    toolClosure,
    passed: keepFound && !evictFound && toolClosure.complete,
  };
}

export function runAcceptanceHarness(
  input: AcceptanceHarnessInput,
): AcceptanceSummary {
  const phases: AcceptancePhaseResult[] = [
    inspectAcceptancePhase(
      "before_restart",
      input.requests,
      input.sentinels,
    ),
    inspectAcceptancePhase(
      "after_restart",
      input.requests,
      input.sentinels,
    ),
  ];

  return {
    passed: phases.every((phase) => phase.passed),
    requestCount: input.requests.length,
    savedCharacters: Math.max(
      0,
      input.originalCharacters - input.rewrittenCharacters,
    ),
    fallbackCount: input.requests.filter((request) => request.fallback).length,
    phases,
  };
}

export function formatAcceptanceSummary(
  summary: AcceptanceSummary,
): string {
  const status = summary.passed ? "PASS" : "FAIL";

  return [
    `status=${status}`,
    `request_count=${summary.requestCount}`,
    `saved_characters=${summary.savedCharacters}`,
    `fallback_count=${summary.fallbackCount}`,
  ].join(" ");
}

export function createTemporaryAcceptanceEnvironment(
  prefix = "lightmem2-openclaw-acceptance-",
): TemporaryAcceptanceEnvironment {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const homeDir = path.join(rootDir, "home");
  const stateDir = path.join(rootDir, "openclaw-state");

  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });

  let cleaned = false;

  return {
    rootDir,
    homeDir,
    stateDir,
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      OPENCLAW_STATE_DIR: stateDir,
    },
    cleanup: () => {
      if (cleaned) {
        return;
      }

      cleaned = true;
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
}
