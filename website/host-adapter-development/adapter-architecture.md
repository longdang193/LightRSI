# Adapter Architecture

Host adapters are the integration layer between a specific coding-agent host and TokenPilot.

## Current Adapters

From [HOSTS.md](https://github.com/zjunlp/LightRSI/blob/main/components/adapters/HOSTS.md):

| Host | Status | Integration Mode | Install Surface |
| :-- | :-- | :-- | :-- |
| OpenClaw | production | bundled plugin + embedded runtime | `pnpm component:install:tokenpilot:openclaw` or `pnpm --dir components/adapters/openclaw run install:release` |
| Codex CLI | available | hooks + local Responses proxy + shared CLI | `pnpm --dir components/adapters/codex run build` then `pnpm --dir components/adapters/codex run install:codex` |
| Claude Code | available | gateway routing + observability hooks + shared CLI | `pnpm --dir components/adapters/claude-code run build` then `pnpm --dir components/adapters/claude-code run install:claude-code` |

## Adapter Responsibilities

From [adapters/README.md](https://github.com/zjunlp/LightRSI/blob/main/components/adapters/README.md):

Keep these inside the adapter:
- Host install and uninstall flow
- Host config mutation
- Request / response hook wiring
- Session and transcript bridging
- Host-specific command registration
- Runtime bootstrap and doctor checks
- Host-owned path resolution

## Shared Packages

Host-agnostic logic lives in shared packages under `components/packages/`:

| Package | Role |
| :-- | :-- |
| `packages/host-adapter/` | Host abstraction contracts and envelope bridge helpers |
| `packages/kernel/` | Shared contracts, events, and runtime-facing types |
| `packages/runtime-core/` | Host-agnostic reduction, recovery, and archive primitives |
| `packages/layers/*` | Policy, history, and memory logic |
| `packages/product-surface/` | Shared command semantics for the standalone CLI |

## Related Pages

- [Adapter Testing](./adapter-testing.md)
- [Adding a New Host](./adding-new-host.md)
- [Configuration Integration](./configuration-integration.md)
- [Hook and Proxy Integration](./hook-proxy-integration.md)
- [Adapter Playbook](https://github.com/zjunlp/LightRSI/blob/main/docs/adapter-playbook.md)
- [HOSTS.md](https://github.com/zjunlp/LightRSI/blob/main/components/adapters/HOSTS.md)
