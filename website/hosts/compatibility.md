# Host Compatibility

LightRSI supports three agent hosts. Each host has a different integration style, but the plugin behavior is consistent across all of them.

## Supported Hosts

| Host | Integration | Adapter Location |
| :-- | :-- | :-- |
| [OpenClaw](./openclaw) | Native plugin slot | `components/adapters/openclaw/` |
| [Codex CLI](./codex) | Local proxy + hooks | `components/adapters/codex/` |
| [Claude Code](./claude-code) | Local gateway + MCP | `components/adapters/claude-code/` |

## Feature Matrix

| Feature | OpenClaw | Codex | Claude Code |
| :-- | :-- | :-- | :-- |
| Stable Prefix | ✅ | ✅ | ✅ |
| Context Reduction | ✅ | ✅ | ✅ |
| Context Eviction | ✅ | — | — |
| Visual Inspector | ✅ | ✅ | ✅ |
| Session Reports | ✅ | ✅ | ✅ |
| In-session Commands | ✅ (`/lightrsi`) | — (standalone CLI) | — (standalone CLI) |
| Standalone CLI | ✅ | ✅ | ✅ |
| MCP Recovery Server | ✅ | ✅ | ✅ |
| `mode conservative` | ✅ | ✅ | ✅ |
| `mode normal` | ✅ | ✅ | ✅ |
| `mode aggressive` | ✅ | — | — |
| Auto-start Proxy | ✅ (gateway restart) | ✅ (SessionStart hook) | ✅ (SessionStart hook) |
