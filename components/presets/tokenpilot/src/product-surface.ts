import type { ProductSurfaceIdentity } from "@lightrsi/product-surface";

export const TOKENPILOT_PRODUCT_SURFACE_IDENTITY = {
  displayName: "TokenPilot",
  commandName: "tokenpilot",
  aliases: [
    {
      name: "tokenpilot",
      description: "Manage TokenPilot runtime knobs by module.",
    },
    {
      name: "lightrsi",
      description: "LightRSI command surface. Compatible alias for /tokenpilot.",
    },
    {
      name: "tp",
      description: "Alias for /tokenpilot.",
    },
  ],
} as const satisfies ProductSurfaceIdentity;
