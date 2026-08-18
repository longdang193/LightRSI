import {
  createTokenPilotHostBinding,
  initializeTokenPilotPreset,
} from "@lightrsi/tokenpilot";

export const CLAUDE_CODE_TOKENPILOT_HOST_BINDING = createTokenPilotHostBinding({
  hostId: "claude-code",
  supportedFeatures: ["stabilizer", "reduction", "eviction"],
});

export function initializeClaudeCodeTokenPilotPreset(): void {
  initializeTokenPilotPreset(CLAUDE_CODE_TOKENPILOT_HOST_BINDING);
}
