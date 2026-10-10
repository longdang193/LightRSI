import type { ProductSurfaceConfigAdapter, ProductSurfaceHostBridge } from "@lightrsi/host-adapter";
import type { ProductSurfaceIdentity } from "./identity.js";
import { createEvictionHandler } from "./commands/runtime-eviction.js";
import { createGenerationPolicyHandler } from "./commands/runtime-generation-policy.js";
import { createModeHandler } from "./commands/runtime-mode.js";
import { createReductionHandler } from "./commands/runtime-reduction.js";
import { createSettingsHandler } from "./commands/runtime-settings.js";
import { createStabilizerHandler } from "./commands/runtime-stabilizer.js";
import { createHostActionHandlers } from "./commands/host.js";
import type { ProductSurfaceActionHandler, ProductSurfaceCommandDeps } from "./commands/shared.js";

export function createProductSurfaceActionHandlers(params: {
  bridge: ProductSurfaceHostBridge;
  configAdapter: ProductSurfaceConfigAdapter;
  identity: ProductSurfaceIdentity;
}): Record<string, ProductSurfaceActionHandler> {
  const deps: ProductSurfaceCommandDeps = params;

  return {
    ...createHostActionHandlers(deps),
    mode: createModeHandler(deps),
    settings: createSettingsHandler(deps),
    stabilizer: createStabilizerHandler(deps),
    reduction: createReductionHandler(deps),
    eviction: createEvictionHandler(deps),
    caveman: createGenerationPolicyHandler("caveman", deps),
    ponytail: createGenerationPolicyHandler("ponytail", deps),
  };
}
