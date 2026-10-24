export const NINE_ROUTER_PROVIDER_ID = "9router" as const;

export const NINE_ROUTER_RETAINED_MODEL_CONTRACT = [
  {
    profile: "ui",
    model: "combo-ui",
    providerId: NINE_ROUTER_PROVIDER_ID,
    capabilities: ["responses"],
  },
  {
    profile: "xhigh",
    model: "combo-xhigh",
    providerId: NINE_ROUTER_PROVIDER_ID,
    capabilities: ["responses"],
  },
] as const;

export const NINE_ROUTER_DIRECT_MODELS = new Set(
  NINE_ROUTER_RETAINED_MODEL_CONTRACT.map((entry) => entry.model),
);
