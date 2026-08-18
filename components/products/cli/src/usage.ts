import { CLI_HOSTS } from "./hosts/registry.js";

export function formatCliUsage(): string {
  return [
    "Usage:",
    "  lightrsi <command>",
    "  lightrsi <host> <command>",
    "  lightrsi <host> session <session-id> <command>",
    "",
    "Hosts:",
    ...CLI_HOSTS.map((host) => `  ${host.hostId}`),
    "",
    "Top-level commands:",
    "  status",
    "  report",
    "  doctor",
    "  visual",
    "  mode <conservative|normal|aggressive>",
    "  settings details <on|off>",
    "  stabilizer ...",
    "  reduction ...",
    "  eviction ...",
    "  context",
    "  use <host>",
    "  use <host> session <session-id>",
    "",
    "Examples:",
    "  lightrsi report",
    "  lightrsi openclaw doctor",
    "  lightrsi claude-code doctor",
    "  lightrsi openclaw session 123e4567-e89b-12d3-a456-426614174000 report",
    "  lightrsi use openclaw",
  ].join("\n");
}
