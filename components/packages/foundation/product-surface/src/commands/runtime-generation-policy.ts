import { GENERATION_POLICY_LEVELS } from "../generation-policy.js";
import { setNestedValue, splitArgs } from "../config.js";
import type { ProductSurfaceActionHandler, ProductSurfaceCommandDeps } from "./shared.js";
import { writeUpdatedConfig } from "./shared.js";

type PolicyName = "caveman" | "ponytail";

export function createGenerationPolicyHandler(
  name: PolicyName,
  params: ProductSurfaceCommandDeps,
): ProductSurfaceActionHandler {
  const { bridge, configAdapter, identity } = params;
  return async (_ctx, currentConfig, rest) => {
    const level = splitArgs(rest)[0]?.toLowerCase() ?? "";
    if (level !== "off" && !GENERATION_POLICY_LEVELS.includes(level as typeof GENERATION_POLICY_LEVELS[number])) {
      return { text: `Usage: /${identity.commandName} ${name} <off|lite|full|ultra>` };
    }
    return writeUpdatedConfig(bridge, currentConfig, (nextConfig) => {
      const pluginConfig = configAdapter.ensurePluginConfig(nextConfig);
      setNestedValue(pluginConfig, ["generationPolicy", name], {
        enabled: level !== "off",
        level: level === "off" ? "full" : level,
      });
      return `✅ ${name} = ${level}`;
    });
  };
}
