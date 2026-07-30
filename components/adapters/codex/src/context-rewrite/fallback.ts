import { collectCodexResponseItemsFromStream } from "../context-history/sse-item-collector.js";
import { cloneJson } from "./shared.js";
import type {
  CodexRebaseFallbackResult,
  CodexRebaseEpoch,
  CodexRebaseAccounting,
  CodexRebaseCapabilityNotice,
  CodexRebaseCapabilityStoreParams,
  CodexRebaseCooldownNotice,
  CodexRebaseCooldownStoreParams,
  CodexRebaseEpochStoreParams,
  CodexUpstreamResponse,
  CodexUpstreamSender,
  JsonObject,
} from "./types.js";
import {
  appendPendingCodexRebaseEpoch,
  commitCodexRebaseEpoch,
  failCodexRebaseEpoch,
  readPendingCodexRebaseEpochs,
  rollbackCodexRebaseEpoch,
} from "./rebase-epoch.js";
import {
  appendCodexRebaseCooldown,
  codexRebaseCooldownNotice,
  readActiveCodexRebaseCooldown,
} from "./rebase-cooldown.js";
import {
  appendCodexRebaseCapability,
  codexRebasePayloadItemTypes,
  readUnsupportedCodexRebaseItemTypes,
  unsupportedCodexRebaseItemTypesFromResponse,
} from "./rebase-capability.js";

function isSuccessfulResponse(response: CodexUpstreamResponse): boolean {
  return response.status >= 200 && response.status < 300;
}

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function responseIdFromObject(value: unknown): string | undefined {
  const object = asObject(value);
  if (!object) return undefined;
  if (typeof object.id === "string" && object.id) return object.id;
  const response = asObject(object.response);
  return typeof response?.id === "string" && response.id ? response.id : undefined;
}

function responseStatusFromObject(value: unknown): string | undefined {
  const object = asObject(value);
  if (!object) return undefined;
  if (typeof object.status === "string") return object.status;
  const response = asObject(object.response);
  return typeof response?.status === "string" ? response.status : undefined;
}

function isEventStreamResponse(response: CodexUpstreamResponse): boolean {
  const contentType = Object.entries(response.headers)
    .find(([key]) => key.toLowerCase() === "content-type")?.[1]
    .toLowerCase();
  return Boolean(
    contentType?.includes("text/event-stream")
    || /^event:\s*response\.|^data:\s*\{|\n\n\s*event:\s*response\./m.test(response.text),
  );
}

function rebaseResponseObservation(response: CodexUpstreamResponse): {
  responseId?: string;
  completed: boolean;
  failureReason?: string;
} {
  if (!isSuccessfulResponse(response)) {
    return { completed: false, failureReason: "rebase_upstream_rejected" };
  }
  if (isEventStreamResponse(response)) {
    const collected = collectCodexResponseItemsFromStream(response.text);
    const sawCompleted = (collected.eventTypeCounts["response.completed"] ?? 0) > 0;
    if (collected.status === "failed") {
      return { responseId: collected.responseId, completed: false, failureReason: "rebase_stream_failed" };
    }
    if (collected.malformedEventCount > 0) {
      return { responseId: collected.responseId, completed: false, failureReason: "rebase_stream_malformed" };
    }
    if (collected.status !== "completed" || !sawCompleted) {
      return { responseId: collected.responseId, completed: false, failureReason: "rebase_stream_incomplete" };
    }
    return {
      responseId: collected.responseId,
      completed: typeof collected.responseId === "string" && collected.responseId.length > 0,
      failureReason: collected.responseId ? undefined : "rebase_response_id_missing",
    };
  }

  try {
    const parsed = JSON.parse(response.text) as unknown;
    const status = responseStatusFromObject(parsed);
    if (status === "failed" || status === "incomplete") {
      return { responseId: responseIdFromObject(parsed), completed: false, failureReason: `rebase_response_${status}` };
    }
    const responseId = responseIdFromObject(parsed);
    return {
      responseId,
      completed: typeof responseId === "string" && responseId.length > 0,
      failureReason: responseId ? undefined : "rebase_response_id_missing",
    };
  } catch {
    return { completed: false, failureReason: "rebase_response_id_missing" };
  }
}

export async function executeCodexRebaseWithFallback(params: {
  sessionId: string;
  planId: string;
  epochId: string;
  originalPayload: JsonObject;
  rebasedPayload: JsonObject;
  sendUpstream: CodexUpstreamSender;
  accounting?: CodexRebaseAccounting;
  epochStore?: CodexRebaseEpochStoreParams;
  cooldownStore?: CodexRebaseCooldownStoreParams;
  capabilityStore?: CodexRebaseCapabilityStoreParams;
}): Promise<CodexRebaseFallbackResult> {
  let rebaseResponse: CodexUpstreamResponse | undefined;
  let epoch: CodexRebaseEpoch | undefined;
  let cooldown: CodexRebaseCooldownNotice | undefined;
  let capability: CodexRebaseCapabilityNotice | undefined;
  let failureReason = "rebase_upstream_error";
  const rebaseItemTypes = params.capabilityStore
    ? codexRebasePayloadItemTypes(params.rebasedPayload)
    : [];

  async function sendOriginalBypass(
    notice?: CodexRebaseCapabilityNotice,
  ): Promise<CodexRebaseFallbackResult> {
    const response = await params.sendUpstream(cloneJson(params.originalPayload));
    return {
      response,
      outcome: isSuccessfulResponse(response) ? "bypassed" : "failed",
      capability: notice,
    };
  }

  if (params.capabilityStore && rebaseItemTypes.length > 0) {
    try {
      const skippedItemTypes = await readUnsupportedCodexRebaseItemTypes({
        stateDir: params.capabilityStore.stateDir,
        provider: params.capabilityStore.provider,
        model: params.capabilityStore.model,
        itemTypes: rebaseItemTypes,
      });
      if (skippedItemTypes.length > 0) {
        return sendOriginalBypass({
          provider: params.capabilityStore.provider,
          model: params.capabilityStore.model,
          itemTypes: rebaseItemTypes,
          skippedItemTypes,
          reason: "capability_unsupported",
        });
      }
    } catch {
      // Capability cache is advisory; an unreadable cache must not interrupt proxying.
    }
  }

  if (params.cooldownStore) {
    const activeCooldown = await readActiveCodexRebaseCooldown({
      stateDir: params.cooldownStore.stateDir,
      sessionId: params.sessionId,
      planId: params.planId,
      now: params.cooldownStore.now,
    });
    if (activeCooldown) {
      const response = await params.sendUpstream(cloneJson(params.originalPayload));
      return {
        response,
        outcome: isSuccessfulResponse(response) ? "bypassed" : "failed",
        cooldown: codexRebaseCooldownNotice(activeCooldown),
      };
    }
  }

  async function recordCooldown(reason: string): Promise<CodexRebaseCooldownNotice> {
    const startedAt = params.cooldownStore?.now ?? new Date().toISOString();
    if (!params.cooldownStore) {
      return { planId: params.planId, startedAt, reason };
    }
    return codexRebaseCooldownNotice(await appendCodexRebaseCooldown({
      stateDir: params.cooldownStore.stateDir,
      sessionId: params.sessionId,
      planId: params.planId,
      reason,
      cooldownMs: params.cooldownStore.cooldownMs,
      startedAt,
    }));
  }

  async function safeRecordCooldown(reason: string): Promise<CodexRebaseCooldownNotice> {
    try {
      return await recordCooldown(reason);
    } catch {
      return {
        planId: params.planId,
        startedAt: params.cooldownStore?.now ?? new Date().toISOString(),
        reason,
      };
    }
  }

  async function recordCapabilities(paramsForRecord: {
    itemTypes: string[];
    status: "supported" | "unsupported";
    reason: string;
    responseStatus?: number;
  }): Promise<void> {
    const store = params.capabilityStore;
    if (!store) return;
    await Promise.all(paramsForRecord.itemTypes.map((itemType) => appendCodexRebaseCapability({
      stateDir: store.stateDir,
      provider: store.provider,
      model: store.model,
      itemType,
      status: paramsForRecord.status,
      reason: paramsForRecord.reason,
      responseStatus: paramsForRecord.responseStatus,
      observedAt: store.now,
    })));
  }

  async function safeRecordCapabilities(paramsForRecord: {
    itemTypes: string[];
    status: "supported" | "unsupported";
    reason: string;
    responseStatus?: number;
  }): Promise<void> {
    try {
      await recordCapabilities(paramsForRecord);
    } catch {
      // Capability updates are advisory and must not change request outcome.
    }
  }

  async function transitionEpochAfterFallback(paramsForTransition: {
    fallbackSucceeded: boolean;
    failureReason: string;
  }): Promise<CodexRebaseEpoch | undefined> {
    if (!params.epochStore) return epoch;
    const fallbackAccounting = params.accounting
      ? {
        ...params.accounting,
        fallbackExtraRequestCount: params.accounting.fallbackExtraRequestCount + 1,
      }
      : undefined;
    try {
      return paramsForTransition.fallbackSucceeded
        ? await rollbackCodexRebaseEpoch({
          stateDir: params.epochStore.stateDir,
          sessionId: params.sessionId,
          epochId: params.epochId,
          failureReason: paramsForTransition.failureReason,
          accounting: fallbackAccounting,
        })
        : await failCodexRebaseEpoch({
          stateDir: params.epochStore.stateDir,
          sessionId: params.sessionId,
          epochId: params.epochId,
          failureReason: paramsForTransition.failureReason,
          accounting: fallbackAccounting,
        });
    } catch {
      return epoch;
    }
  }

  async function sendOriginalWithFallbackOutcome(reason: string): Promise<CodexRebaseFallbackResult> {
    let fallbackResponse: CodexUpstreamResponse;
    try {
      fallbackResponse = await params.sendUpstream(cloneJson(params.originalPayload));
    } catch (error) {
      cooldown = await safeRecordCooldown("fallback_upstream_error");
      await transitionEpochAfterFallback({
        fallbackSucceeded: false,
        failureReason: "fallback_upstream_error",
      });
      throw error;
    }
    const fallbackSucceeded = isSuccessfulResponse(fallbackResponse);
    cooldown = await safeRecordCooldown(reason);
    epoch = await transitionEpochAfterFallback({
      fallbackSucceeded,
      failureReason: reason,
    });
    return {
      response: fallbackResponse,
      outcome: fallbackSucceeded ? "bypassed" : "failed",
      rebaseResponse,
      epoch,
      cooldown,
      capability,
    };
  }

  if (params.epochStore) {
    try {
      const activeEpoch = (await readPendingCodexRebaseEpochs({
        stateDir: params.epochStore.stateDir,
        sessionId: params.sessionId,
      })).find((entry) => entry.epochId !== params.epochId);
      if (activeEpoch) {
        return sendOriginalBypass();
      }

      epoch = await appendPendingCodexRebaseEpoch({
        stateDir: params.epochStore.stateDir,
        sessionId: params.sessionId,
        planId: params.planId,
        epochId: params.epochId,
        oldPreviousResponseId: params.epochStore.oldPreviousResponseId,
        oldRevision: params.epochStore.oldRevision,
        accounting: params.accounting,
      });
    } catch {
      return sendOriginalWithFallbackOutcome("epoch_store_error");
    }
  }
  try {
    rebaseResponse = await params.sendUpstream(cloneJson(params.rebasedPayload));
    const observation = rebaseResponseObservation(rebaseResponse);
    const newResponseId = observation.completed ? observation.responseId : undefined;
    if (newResponseId) {
      if (params.epochStore) {
        try {
          epoch = await commitCodexRebaseEpoch({
            stateDir: params.epochStore.stateDir,
            sessionId: params.sessionId,
            epochId: params.epochId,
            newResponseId,
            newRevision: params.epochStore.newRevision,
            accounting: params.accounting,
          });
        } catch {
          return sendOriginalWithFallbackOutcome("epoch_store_error");
        }
      }
      if (params.capabilityStore && rebaseItemTypes.length > 0) {
        await safeRecordCapabilities({
          itemTypes: rebaseItemTypes,
          status: "supported",
          reason: "rebase_committed",
          responseStatus: rebaseResponse.status,
        });
        capability = {
          provider: params.capabilityStore.provider,
          model: params.capabilityStore.model,
          itemTypes: rebaseItemTypes,
          supportedItemTypes: rebaseItemTypes,
          reason: "rebase_committed",
        };
      }
      return {
        response: rebaseResponse,
        outcome: "committed",
        newResponseId,
        rebaseResponse,
        epoch,
        capability,
      };
    }
    failureReason = observation.failureReason ?? (
      isSuccessfulResponse(rebaseResponse)
        ? "rebase_response_id_missing"
        : "rebase_upstream_rejected"
    );
    if (params.capabilityStore) {
      const unsupportedItemTypes = unsupportedCodexRebaseItemTypesFromResponse({
        response: rebaseResponse,
        itemTypes: rebaseItemTypes,
      });
      if (unsupportedItemTypes.length > 0) {
        await safeRecordCapabilities({
          itemTypes: unsupportedItemTypes,
          status: "unsupported",
          reason: "schema_error",
          responseStatus: rebaseResponse.status,
        });
        capability = {
          provider: params.capabilityStore.provider,
          model: params.capabilityStore.model,
          itemTypes: rebaseItemTypes,
          unsupportedItemTypes,
          reason: "schema_error",
        };
      }
    }
  } catch {
    failureReason = "rebase_upstream_error";
  }

  return sendOriginalWithFallbackOutcome(failureReason);
}
