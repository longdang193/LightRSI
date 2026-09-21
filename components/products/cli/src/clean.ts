import { readFile } from "node:fs/promises";
import type {
  ContextCleanAttributionSubmission,
  ContextCleanAttributionSubmissionResult,
  ContextCleanOccurrenceSelection,
} from "@lightrsi/cleaner";
import {
  renderCleanPlan,
  renderCleanReceipt,
  type CleanPlanView,
  type CleanReceiptView,
} from "./clean-renderer.js";

export interface CleanCommandBackend {
  analyze(sessionId: string): Promise<CleanPlanView>;
  readPlan(planId: string): Promise<CleanPlanView | undefined>;
  approve(planId: string, selectedTaskIds: string[]): Promise<CleanReceiptView>;
  approveOccurrences?(planId: string, selections: ContextCleanOccurrenceSelection[]): Promise<CleanReceiptView>;
  readReceipt(planId: string): Promise<CleanReceiptView | undefined>;
  cancel(planId: string): Promise<CleanReceiptView>;
  submitAttribution?(request: ContextCleanAttributionSubmission): Promise<ContextCleanAttributionSubmissionResult>;
}

export function formatCleanUsage(): string {
  return [
    "Usage:",
    "  lightrsi <host> clean --session <session-id>",
    "  lightrsi <host> clean --plan <plan-id> --select <task-id[,task-id...]>",
    "  lightrsi <host> clean --plan <plan-id> --release <occurrence-evidence.json>",
    "  lightrsi <host> clean --status <plan-id>",
    "  lightrsi <host> clean --cancel <plan-id>",
    "  lightrsi <host> clean --submit-attribution <submission-file>",
  ].join("\n");
}

function valueAt(args: string[], index: number, error: string): string {
  const value = args[index]?.trim();
  if (!value || value.startsWith("--")) throw new Error(error);
  return value;
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
    const requestedSessionId = valueAt(args, 1, "clean_session_id_missing");
    const sessionId = await params.resolveSessionId?.(requestedSessionId) ?? requestedSessionId;
    return { text: renderCleanPlan(await params.backend.analyze(sessionId)) };
  }
  if (args.length === 2 && args[0] === "--status") {
    const receipt = await params.backend.readReceipt(valueAt(args, 1, "clean_plan_id_missing"));
    if (!receipt) throw new Error("clean_receipt_missing");
    return { text: renderCleanReceipt(receipt) };
  }
  if (args.length === 2 && args[0] === "--cancel") {
    return { text: renderCleanReceipt(await params.backend.cancel(valueAt(args, 1, "clean_plan_id_missing"))) };
  }
  if (args.length === 2 && args[0] === "--submit-attribution") {
    if (!params.backend.submitAttribution) throw new Error("clean_attribution_submission_unsupported");
    const path = valueAt(args, 1, "clean_submission_file_missing");
    const request = JSON.parse(await readFile(path, "utf8")) as ContextCleanAttributionSubmission;
    return { text: JSON.stringify(await params.backend.submitAttribution(request), null, 2) };
  }
  if (args.length === 4 && args[0] === "--plan" && args[2] === "--select") {
    const planId = valueAt(args, 1, "clean_plan_id_missing");
    const selected = valueAt(args, 3, "clean_selection_missing").split(",").map((id) => id.trim());
    if (selected.some((id) => !id)) throw new Error("clean_selection_malformed");
    const plan = await params.backend.readPlan(planId);
    if (!plan) throw new Error("clean_plan_missing");
    for (const taskId of selected) {
      const task = plan.tasks.find((candidate) => candidate.taskId === taskId);
      if (!task) throw new Error(`clean_selection_unknown_task:${taskId}`);
      if (!task.selectable) throw new Error(`clean_selection_task_protected:${taskId}`);
    }
    return { text: renderCleanReceipt(await params.backend.approve(planId, selected)) };
  }
  if (args.length === 4 && args[0] === "--plan" && args[2] === "--release") {
    if (!params.backend.approveOccurrences) throw new Error("clean_occurrence_release_unsupported");
    const planId = valueAt(args, 1, "clean_plan_id_missing");
    const selections = JSON.parse(await readFile(valueAt(args, 3, "clean_release_file_missing"), "utf8")) as ContextCleanOccurrenceSelection[];
    if (!Array.isArray(selections) || selections.length === 0) throw new Error("clean_release_evidence_missing");
    return { text: renderCleanReceipt(await params.backend.approveOccurrences(planId, selections)) };
  }
  if (args.length === 0 && params.sessionId) {
    const sessionId = await params.resolveSessionId?.(params.sessionId) ?? params.sessionId;
    return { text: renderCleanPlan(await params.backend.analyze(sessionId)) };
  }
  throw new Error("clean_argument_syntax");
}
