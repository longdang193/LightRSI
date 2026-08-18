import {
  createTokenPilotHostBinding,
  initializeTokenPilotPreset,
} from "@lightrsi/tokenpilot";

export const OPENCLAW_TOKENPILOT_HOST_BINDING = createTokenPilotHostBinding({
  hostId: "openclaw",
  supportedFeatures: ["stabilizer", "reduction", "eviction"],
});

export function initializeOpenClawTokenPilotPreset(): void {
  initializeTokenPilotPreset(OPENCLAW_TOKENPILOT_HOST_BINDING);
}
