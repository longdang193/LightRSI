import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import type {
  ContextCleanOccurrenceSelection,
} from "@lightrsi/cleaner";
import {
  renderCleanInspection,
  renderCleanReceipt,
  type CleanInspectionView,
  type CleanReceiptView,
} from "./clean-renderer.js";

export interface CleanCommandBackend {
  inspect?(sessionId: string): Promise<CleanInspectionView>;
  approveOccurrences?(planId: string, selections: ContextCleanOccurrenceSelection[]): Promise<CleanReceiptView>;
  releaseOccurrences?(sessionId: string, selections: ContextCleanOccurrenceSelection[]): Promise<CleanReceiptView>;
  readReceipt(planId: string): Promise<CleanReceiptView | undefined>;
  cancel(planId: string): Promise<CleanReceiptView>;
}

export function formatCleanUsage(): string {
  return [
    "Usage:",
    "  lightrsi <host> clean --inspect <session-id>",
    "  lightrsi <host> clean --session <session-id> --release <occurrence-evidence.json>",
    "  lightrsi <host> clean --plan <plan-id> --release <occurrence-evidence.json>",
    "  lightrsi <host> clean --status <plan-id>",
    "  lightrsi <host> clean --cancel <plan-id>",
  ].join("\n");
}

function valueAt(args: string[], index: number, error: string): string {
  const value = args[index]?.trim();
  if (!value || value.startsWith("--")) throw new Error(error);
  return value;
}

async function readJsonInput(path: string, error: string): Promise<unknown> {
  try {
    return JSON.parse(path === "-" ? readFileSync(0, "utf8") : await readFile(path, "utf8"));
  } catch {
    throw new Error(error);
  }
}

export async function handleCleanCommand(params: {
  args: string[];
  sessionId?: string;
  resolveSessionId?: (sessionId: string) => Promise<string | undefined>;
  backend: CleanCommandBackend;
}): Promise<{ text: string }> {
  const args = params.args;
  if (args[0] === "--help" || args[0] === "-h") return { text: formatCleanUsage() };
  if (args.length === 2 && args[0] === "--session") {
    throw new Error("clean_task_first_workflow_retired");
  }
  if (args.length === 2 && args[0] === "--status") {
    const receipt = await params.backend.readReceipt(valueAt(args, 1, "clean_plan_id_missing"));
    if (!receipt) throw new Error("clean_receipt_missing");
    return { text: renderCleanReceipt(receipt) };
  }
  if (args.length === 2 && args[0] === "--cancel") {
    return { text: renderCleanReceipt(await params.backend.cancel(valueAt(args, 1, "clean_plan_id_missing"))) };
  }
  if (args.length === 2 && args[0] === "--inspect") {
    if (!params.backend.inspect) throw new Error("clean_occurrence_inspection_unsupported");
    const requestedSessionId = valueAt(args, 1, "clean_session_id_missing");
    const sessionId = await params.resolveSessionId?.(requestedSessionId) ?? requestedSessionId;
    return { text: renderCleanInspection(await params.backend.inspect(sessionId)) };
  }
  if (args.length === 2 && args[0] === "--submit-attribution") {
    throw new Error("clean_task_first_workflow_retired");
  }
  if (args.length === 4 && args[0] === "--plan" && args[2] === "--select") {
    throw new Error("clean_task_first_workflow_retired");
  }
  if (args.length === 4 && args[0] === "--session" && args[2] === "--release") {
    if (!params.backend.releaseOccurrences) throw new Error("clean_occurrence_release_unsupported");
    const requestedSessionId = valueAt(args, 1, "clean_session_id_missing");
    const sessionId = await params.resolveSessionId?.(requestedSessionId) ?? requestedSessionId;
    const selections = await readJsonInput(valueAt(args, 3, "clean_release_file_missing"), "clean_release_json_invalid") as ContextCleanOccurrenceSelection[];
    if (!Array.isArray(selections) || selections.length === 0) throw new Error("clean_release_evidence_missing");
    return { text: renderCleanReceipt(await params.backend.releaseOccurrences(sessionId, selections)) };
  }
  if (args.length === 4 && args[0] === "--plan" && args[2] === "--release") {
    if (!params.backend.approveOccurrences) throw new Error("clean_occurrence_release_unsupported");
    const planId = valueAt(args, 1, "clean_plan_id_missing");
    const selections = await readJsonInput(valueAt(args, 3, "clean_release_file_missing"), "clean_release_json_invalid") as ContextCleanOccurrenceSelection[];
    if (!Array.isArray(selections) || selections.length === 0) throw new Error("clean_release_evidence_missing");
    return { text: renderCleanReceipt(await params.backend.approveOccurrences(planId, selections)) };
  }
  throw new Error("clean_argument_syntax");
}
