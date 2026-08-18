import {
  createTokenPilotHostBinding,
  initializeTokenPilotPreset,
} from "@lightrsi/tokenpilot";

export const CODEX_TOKENPILOT_HOST_BINDING = createTokenPilotHostBinding({
  hostId: "codex",
  supportedFeatures: ["stabilizer", "reduction", "eviction"],
});

export function initializeCodexTokenPilotPreset(): void {
  initializeTokenPilotPreset(CODEX_TOKENPILOT_HOST_BINDING);
}
