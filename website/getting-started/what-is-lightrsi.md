# What is LightRSI

LightRSI is a **modular runtime for recursive improvement in long-running LLM agents**. It provides the shared lifecycle, state, safety, observability, and host integration needed to build an improvement capability once and run it across OpenClaw, Codex, Claude Code, and future hosts. The current implementation focuses on context and agentic memory.

## LightRSI vs. TokenPilot

A common point of confusion: LightRSI and TokenPilot are not the same thing.

| | LightRSI | TokenPilot |
| :-- | :-- | :-- |
| **What it is** | A recursive-improvement runtime and platform | A preset that runs on LightRSI |
| **Role** | Loads, manages, and executes plugins | Provides cache-aware context management |
| **Scope** | Platform-wide: plugins, adapters, CLI | One specific capability: reducing token usage |
| **Status** | Active development | Stable — the first official plugin |

LightRSI provides the reusable runtime boundary; TokenPilot supplies one concrete policy bundle for cache-efficient context management.

## What Problems It Solves

- **Long sessions get expensive**. As agent sessions grow, every turn carries more context, which means more tokens and higher costs.
- **Context is repetitive**. Much of what gets sent to the model each turn is identical to the previous turn — wasteful if not cached.
- **Tool output is noisy**. Large tool responses can pollute future turns with irrelevant data.
- **Sessions don't prune themselves**. Without eviction, old context accumulates until sessions hit limits or become too slow.

LightRSI addresses these through its plugin model. TokenPilot, the first plugin, implements the runtime policies: stable-prefix rewriting, context reduction, and lifecycle-aware eviction.

## What It Doesn't Solve

- **Short, single-turn interactions**. If your sessions are always one-shot, there is nothing for caching or eviction to optimize.
- **Model quality or accuracy**. LightRSI doesn't change model behavior — it changes what context gets sent to the model.
- **All memory problems**. Long-term memory is an experimental feature area; TokenPilot focuses on the current session's context window.

## Relationship to the Paper

The [TokenPilot paper](https://arxiv.org/abs/2606.17016) describes the cache-efficient context management technique. LightRSI is the platform that hosts TokenPilot as its first plugin, and will host additional plugins in the future.

## Next Steps

- [Quick Start](/getting-started/quick-start) — get running in under 5 minutes
- [Core Concepts](/platform-concepts/core-runtime) — understand the platform architecture
- [TokenPilot Overview](/plugin-catalog/tokenpilot/overview) — dive into the featured plugin
