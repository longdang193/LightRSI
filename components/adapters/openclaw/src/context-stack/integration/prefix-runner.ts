/* eslint-disable @typescript-eslint/no-explicit-any */
import { syncOpenClawPayloadFromEnvelope } from "./openclaw-host-adapter.js";

export type PrefixRunResult = {
  enabled: boolean;
  requestEnvelope: any;
  stableRewrite: any;
  rootPromptRewrite: any;
  developerForwardedText: string;
  developerCanonicalText: string;
  devAndUser: any;
  firstTurnCandidate: boolean;
  originalPromptCacheKey: string;
};

export function runPrefixIfEnabled(params: {
  enabled: boolean;
  payload: any;
  requestEnvelope: any;
  payloadCodec: any;
  model: string;
  dynamicContextTarget: "user" | "developer";
  helpers: any;
}): PrefixRunResult {
  const {
    enabled,
    payload,
    payloadCodec,
    model,
    dynamicContextTarget,
    helpers,
  } = params;
  let requestEnvelope = params.requestEnvelope;
  const originalPromptCacheKey =
    typeof requestEnvelope.metadata?.promptCacheKey === "string"
      && requestEnvelope.metadata.promptCacheKey.trim().length > 0
      ? String(requestEnvelope.metadata.promptCacheKey)
      : typeof payload?.prompt_cache_key === "string" && payload.prompt_cache_key.trim().length > 0
        ? String(payload.prompt_cache_key)
        : "";
  const devAndUser = enabled
    ? helpers.findDeveloperAndPrimaryUser(requestEnvelope.messages)
    : null;
  const rootPromptCandidate = enabled
    ? helpers.findRootPromptCandidate(requestEnvelope.messages)
    : null;
  const firstTurnCandidate = Boolean(devAndUser);
  const rootPromptRewrite = rootPromptCandidate && enabled
    ? helpers.rewriteRootPromptForStablePrefix(rootPromptCandidate.text)
    : null;
  const developerCanonicalText = String(
    rootPromptRewrite?.canonicalPromptText ?? rootPromptCandidate?.text ?? "",
  );
  const developerForwardedText = String(
    rootPromptRewrite?.forwardedPromptText ?? rootPromptCandidate?.text ?? "",
  );



  const stableRewrite = enabled
    ? helpers.rewritePayloadForStablePrefix(payload, model, {
      dynamicContextTarget,
      developerTextForKeyOverride: developerCanonicalText,
    })
    : {
      promptCacheKey: originalPromptCacheKey,
      userContentRewrites: 0,
      senderMetadataBlocksBefore: 0,
      senderMetadataBlocksAfter: 0,
    };
  requestEnvelope = payloadCodec.decodeRequest(payload);
  requestEnvelope = {
    ...requestEnvelope,
    metadata: {
      ...(requestEnvelope.metadata ?? {}),
      promptCacheKey: String(stableRewrite.promptCacheKey ?? ""),
    },
  };

  return {
    enabled,
    requestEnvelope,
    stableRewrite,
    rootPromptRewrite,
    developerForwardedText,
    developerCanonicalText,
    devAndUser,
    firstTurnCandidate,
    originalPromptCacheKey,
  };
}
