# Repository Structure

The LightRSI repository is organized around the plugin platform and its components.

```text
LightRSI/
├── components/
│   ├── adapters/                # Host-specific integration
│   │   ├── openclaw/            #   OpenClaw native plugin adapter
│   │   ├── codex/               #   Codex CLI proxy + hooks adapter
│   │   ├── claude-code/         #   Claude Code gateway + MCP adapter
│   │   └── deepseek-harness/    #   DeepSeek Harness compatibility adapter
│   ├── products/
│   │   ├── cli/                 #   Shared lightrsi CLI
│   │   └── mcp/                 #   Shared MCP recovery server
│   ├── presets/
│   │   └── tokenpilot/          #   TokenPilot composition preset
│   └── packages/
│       ├── foundation/          #   Shared contracts and runtime primitives
│       └── features/            #   Reduction, eviction, cleaner, memory, stabilizer
├── docs/                        # Public-facing notes and helpers
├── website/                     # This documentation site
├── figs/                        # Images for README
└── README.md
```

Benchmark tasks, runners, profiles, and analysis are maintained in the separate [TokenPilot experiment repository](https://github.com/Xubqpanda/TokenPilot).

## Key Directories

| Directory | Purpose |
| :-- | :-- |
| `components/packages/foundation/kernel/` | Types, interfaces, events — the contract layer |
| `components/packages/foundation/runtime-core/` | Plugin execution engine |
| `components/packages/features/` | Stateful processing and policy features |
| `components/adapters/` | One adapter per host |
| `components/products/cli/` | The `lightrsi` CLI |
| `components/products/mcp/` | Shared MCP server |

## Workspace

The repository uses pnpm workspaces. See `pnpm-workspace.yaml` for the full list.

## Next

- [Local Development](/development/local-development)
- [Build and Test](/development/build-and-test)
- [Contributing](/development/contributing)
