# Packaging Plugins

TokenPilot uses a **pnpm workspace** within the LightRSI monorepo.

Build commands from [CONTRIBUTING.md](https://github.com/zjunlp/LightRSI/blob/main/CONTRIBUTING.md):

| Command | Purpose |
| :-- | :-- |
| `pnpm install` | Install all workspace dependencies |
| `pnpm build` | Build all shared packages in the workspace |
| `pnpm lightrsi:build` | Build the standalone CLI surface |
| `pnpm lightrsi:install` | Install the CLI entrypoint globally |

Adapter install scripts:

| Host | Install Command |
| :-- | :-- |
| OpenClaw | `pnpm component:install:tokenpilot:openclaw` |
| Codex CLI | `pnpm --dir components/adapters/codex run install:codex` |
| Claude Code | `pnpm --dir components/adapters/claude-code run install:claude-code` |

## Related Pages

- [Testing Plugins](/plugin-development/testing) — verifying builds
- [Build Your First Plugin](/plugin-development/build-your-first-plugin) — getting started
