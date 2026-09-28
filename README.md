<p align="center">
  <img src="./figs/LightRSI_logo.png" alt="LightRSI logo" width="220">
</p>

<p align="center">
  <strong>Compact, recoverable context management for long-running AI coding agents.</strong>
</p>

> [!IMPORTANT]
> **Independent fork of [zjunlp/LightRSI](https://github.com/zjunlp/LightRSI).**
>
> This repository retains the upstream LightRSI/TokenPilot foundation but
> intentionally diverges in context admission, Context Cleaner behavior,
> session recovery, provider integration, and runtime lifecycle.
>
> Looking for the original project or research results? Start with
> [zjunlp/LightRSI](https://github.com/zjunlp/LightRSI).

<p align="center">
  <img src="https://img.shields.io/badge/Framework-LightRSI-black" alt="framework">
  <img src="https://img.shields.io/badge/Maintenance-Independent%20Fork-orange" alt="independent fork">
  <img src="https://img.shields.io/badge/Hosts-OpenClaw%20%7C%20Codex%20%7C%20Claude%20Code-green" alt="hosts">
  <img src="https://img.shields.io/badge/Features-Compact%20%7C%20Cleaner-blue" alt="features">
  <img src="https://img.shields.io/badge/Package%20Manager-pnpm-informational" alt="pnpm">
  <img src="https://img.shields.io/badge/License-MIT-brightgreen" alt="license">
</p>

<span id='fork'/>

## 🌿 What This Fork Is

AI coding agents repeatedly process large test logs, file contents, and other
tool outputs during long sessions. That increases token usage and provider cost
even when much of the information is no longer needed.

It retains the upstream TokenPilot runtime, then adds fork-specific context controls and operational hardening for long-running coding-agent sessions.

Its core product is **two-stage context control**: compact new oversized observations before they enter active context, then release selected historical occurrences only when the agent supplies explicit evidence.

In a paired live evaluation of 120 requests, Compact processing reduced input
tokens by **60.91%** and estimated provider cost by **35.11%** versus processing
the same sessions with full, uncompressed tool outputs.

This is **not** a drop-in superset. Read the labels below as a scope boundary:

- **Fork-specific:** Compact admission, agent-directed occurrence release, durable history and recovery, and fork-owned host/transport hardening.
- **Inherited upstream:** TokenPilot's stabilizer, reduction, and eviction capabilities, plus the shared LightRSI runtime and host integration model.
- **Upstream reference:** TokenPilot/LightRSI research benchmarks and papers. They are not measurements or claims about this fork.

> **In short:** Compact admission reduces oversized observations before they enter
> active context. Context Cleaner lets the agent release specific old messages and
> tool outputs when they are no longer useful.

| Capability | Origin in this repository | User-facing value |
| :-- | :-- | :-- |
| TokenPilot stabilizer, reduction, and eviction | Inherited upstream foundation, maintained and integrated here | Smaller, more cache-friendly sessions |
| Compact admission | Fork-specific recoverable admission for eligible oversized observations | Reduce context before it grows, with exact recovery when needed |
| Context Cleaner | Fork-specific agent-directed occurrence-release path built around explicit evidence | Remove obsolete history without hidden deletion decisions |
| Session lifecycle | Fork-specific journaling, replay, restart recovery, and watchdog hardening | Continue long sessions after interruptions |
| Host and provider integration | Fork-specific hardening of transport compatibility, status/doctor/report surfaces, and recovery tooling | Keep configured providers and host workflows usable |
| Benchmarks and papers | Upstream reference material unless explicitly marked fork-specific | Compare against original research without confusing provenance |

See [Upstream Heritage & Attribution](#citation) for inheritance, research,
and endorsement boundaries.

### Why use this fork?

- **Reduce before context:** compact oversized tool output before it consumes future turns.
- **Recover instead of guessing:** retain exact original evidence behind compact representations.
- **Release deliberately:** let the agent select historical occurrences, then validate and record the release.
- **Keep sessions operational:** preserve provider identity while adding forwarding, replay, health, and restart recovery.

<span id='fork-workflow'/>

### 🧭 Current Fork Workflow

The interactive workflow covers request intake, context admission, provider
forwarding, session history, restart recovery, and health inspection. Agent-directed
historical release remains a separate Cleaner path.

<p align="center">
  <img src="./docs/diagrams/forked-lightrsi.workflow.svg" alt="Forked LightRSI workflow" width="100%">
</p>

[Open the interactive workflow](./docs/diagrams/forked-lightrsi.workflow.html) · [View the Archify source](./docs/diagrams/forked-lightrsi.workflow.json)

<span id='compact-context'/>

## 📦 Compact, Recoverable Context

Coding agents regularly produce large tool outputs: compiler errors, test logs,
file contents, search results, and command output. Repeating those full
observations on later requests increases context size and provider cost.

Compact admission reduces eligible observations before they enter active
context, while retaining the original content for exact recovery.

1. A tool produces an observation.
2. For eligible large outputs, LightRSI prepares a shorter representation and
   preserves the original before omitting information.
3. The AI receives the compact representation and a recovery reference.
4. Stable admitted history survives supported continuation and restart paths.
5. The agent retrieves the original when omitted evidence is needed.

Compact admission handles new observations. Context Cleaner handles historical
information that has become obsolete and releases only occurrences selected by
the active agent after safety validation.

<span id='context-cleaner'/>

## 🧹 Agent-Directed Context Cleaner

Long-running coding agents accumulate completed investigations, obsolete tool output, and intermediate context that no longer contributes to the current task.

This fork replaces Codex's live task-first Cleaner workflow with agent-directed, session-scoped occurrence pruning.

Here, an **occurrence** means one specific message, tool result, or related context item.

- **One decision owner:** the active agent selects what is no longer useful; Cleaner does not independently estimate task completion or select context for removal.
- **Exact release:** each operation targets explicitly identified occurrences rather than broad task-level deletion.
- **Deterministic safety:** fingerprints, protected items, retained findings, affected tool relationships, and execution evidence constrain removal.
- **Durable continuation:** lifecycle and dispatch state, journals, claims, epochs, and receipts support consistent application and recovery.

TokenPilot optimizes how context is carried. Context Cleaner executes an agent's explicit decision to release context.

<span id='engineering-contributions'/>

## 🛠️ Fork-Specific Changes

| What changed | Problem solved | Practical impact |
| :-- | :-- | :-- |
| Added stable, recoverable Compact admission | Large tool outputs repeatedly consume active context | Lower input usage and estimated provider cost on the evaluated workload |
| Redesigned Codex Context Cleaner around agent-authorized occurrence release | Competing task-estimation and selection owners | Exact context release with deterministic safety checks |
| Hardened provider forwarding and Responses compatibility | Provider routes and payload variations | More reliable interoperability |
| Implemented durable session history and recovery | Runtime interruptions and continuation | Committed context decisions survive restart |
| Strengthened Windows daemon and runtime lifecycle | Manual recovery after install or restart | Safer, lower-touch daily operation |
| Built cache telemetry and reproducible A/B benchmarks | Unknown token, latency, and cache behavior | Evidence-based optimization |

Evidence: [`components/packages/features/cleaner`](./components/packages/features/cleaner), [`components/adapters/codex`](./components/adapters/codex), [`components/adapters/codex/tests`](./components/adapters/codex/tests), [`components/adapters/codex/scripts/benchmark-context-cleaner.ts`](./components/adapters/codex/scripts/benchmark-context-cleaner.ts), and [`docs/superpowers/plans/2026-09-22-context-cleaner-benchmark-plan.md`](./docs/superpowers/plans/2026-09-22-context-cleaner-benchmark-plan.md).

<span id='fork-validation'/>

## 🧪 How We Validate It

This fork includes targeted regression tests and benchmarks for Compact
admission, Codex forwarding, occurrence release, session continuation, recovery,
and cache behavior.

Cleaner validation covers cumulative continuation, repeated releases, retained
context, and proxy restart. Performance measurements capture forwarded payload
size, provider-reported usage when available, and request timing.

### Compact Admission — Live Full-Output Comparison

The same three sessions were evaluated with full tool outputs and with Compact
admission enabled. The evaluation used three seeds, 20 continuation turns per
seed and configuration, and 120 provider requests total through `9Router` using
the `combo-normal` model.

| Metric | Full tool output | Compact | Result |
| :-- | --: | --: | :-- |
| Provider requests | 60 | 60 | Same workload |
| Input tokens | 8,255,954 | 3,227,188 | **60.91% lower** |
| Estimated provider cost | $1.545276 | $1.002771 | **35.11% lower** |
| Quality-gate runs | 3/3 | 3/3 | Passed |
| Tool-call closure | 60/60 | 60/60 | Passed |

Per-seed estimated cost savings were **76.99%**, **27.75%**, and **20.44%**.
The variation indicates that benefit depends on session content and context
characteristics.

Both configurations passed all three seeded quality evaluations, including all
six critical-fact checks and 120 tool-call closure checks. Proxy restart was
exercised after turn 10 in every run, but this benchmark does not independently
assert restart correctness. Passing these gates does not establish universal
answer-quality equivalence.

These results apply only to this workload, model, provider, and pinned pricing
assumptions. They do not establish universal savings across models, providers,
coding tasks, or session lengths. See the [sanitized benchmark record](./docs/benchmarks/full-compact-live-evaluation.md)
for pricing assumptions, provenance, and limitations.

### Historical Context Release — Separate Experiment

Historical occurrence release was evaluated independently from Compact
admission. In an earlier 20-pair live Keep/Release comparison, release reduced
input tokens by 0.25% but increased estimated marginal provider cost by 11.07%.
The tested releases disrupted prompt-cache reuse enough to offset their token
savings. This result does not contradict Compact admission: the two experiments
change context at different stages.

LightRSI therefore treats historical release as an agent-authorized operation,
not as an assumed cost optimization.

See [`docs/benchmarks/impact-report.md`](./docs/benchmarks/impact-report.md) for
the historical measurement scope and limitations.

### Upstream reference results

Inherited TokenPilot research results remain documented in
[Upstream Reference Results](#experimental-results). They are not measurements of
this fork.

Existing fork-specific benchmark scripts live under [`components/adapters/codex/scripts`](./components/adapters/codex/scripts) and [`components/packages/features/stabilizer/scripts`](./components/packages/features/stabilizer/scripts). The Compact live result is summarized in the [sanitized benchmark record](./docs/benchmarks/full-compact-live-evaluation.md).

See the benchmark scripts under [`components/adapters/codex/scripts`](./components/adapters/codex/scripts)
and the recorded results under [`docs/superpowers/plans`](./docs/superpowers/plans).

---

<span id='components'/>

## 🧩 Core Runtime Paths

These paths describe what this fork ships today. Ownership labels distinguish
fork work from the upstream foundation.

| Path | Purpose | Ownership |
| :-- | :-- | :-- |
| Compact admission | Reduce new oversized observations while preserving originals for recovery | Fork-enhanced |
| Context Cleaner | Release exact historical occurrences selected by the agent | Fork redesign |
| TokenPilot stabilizer, reduction, and eviction | Core context-management foundation | Upstream-derived |
| Session and recovery runtime | Preserve decisions and continuity across supported restarts | Fork-enhanced |

<span id='contents'/>

## 📑 Table of Contents

* <a href='#fork'>🌿 What This Fork Is</a>
* <a href='#fork-workflow'>🧭 Current Fork Workflow</a>
* <a href='#compact-context'>📦 Compact, Recoverable Context</a>
* <a href='#context-cleaner'>🧹 Agent-Directed Context Cleaner</a>
* <a href='#engineering-contributions'>🛠️ Fork-Specific Changes</a>
* <a href='#fork-validation'>🧪 How We Validate It</a>
* <a href='#installation'>🔧 Installation</a>
* <a href='#quickstart'>⚡ Quick Start</a>
* <a href='#visual-results'>🖼️ Visual Results</a>
* <a href='#architecture'>🏗️ Fork Architecture</a>
* <a href='#experiments'>🧪 Experiment Reproduction</a>
* <a href='#commands'>💡 Commands</a>
* <a href='#experimental-results'>📚 Upstream Reference Results</a>
* <a href='#citation'>📄 Upstream Heritage & Attribution</a>
* <a href='#contributing'>🤝 Contributing</a>
* <a href='#contributors'>🎉 Upstream Contributors</a>
* <a href='#related-works'>📚 Related Works</a>
* <a href='#community'>💬 Community</a>

<span id='installation'/>

## 🔧 Installation

### 1. Prepare the Repository Once

Clone the repository and build the shared packages. Use Node.js `22.19.0` or newer:

```bash
git clone https://github.com/longdang193/LightRSI.git
cd LightRSI
corepack enable
pnpm install
pnpm build
pnpm lightrsi:build
pnpm lightrsi:install
```

### 2. Pick Your Host

Open the host you want and run the default install commands.

<details>
<summary><strong>OpenClaw</strong></summary>

<br>

Default install:

```bash
pnpm component:install:tokenpilot:openclaw
```

This installs the current TokenPilot OpenClaw adapter, updates `~/.openclaw/openclaw.json`, enables the plugin, switches `plugins.slots.contextEngine` to `layered-context`, applies the default `normal` mode, and tries to restart the OpenClaw gateway automatically.

If your OpenClaw home or config path is not under the default `~/.openclaw`, set:

```bash
export LIGHTRSI_OPENCLAW_HOME="/path/to/openclaw-home"
export OPENCLAW_CONFIG_PATH="/path/to/openclaw.json"
```

Then run the same install command again:

```bash
pnpm component:install:tokenpilot:openclaw
```

</details>

<details>
<summary><strong>Codex CLI</strong></summary>

<br>

Default install:

```bash
pnpm --dir components/adapters/codex run build
pnpm --dir components/adapters/codex run install:codex
```

This keeps your current active Codex provider name, reroutes that provider through the local TokenPilot proxy, writes `~/.codex/tokenpilot.json`, registers hooks in `~/.codex/hooks.json`, registers the shared `tokenpilot_memory_fault_recover` MCP server, and creates the standalone `lightrsi` CLI entrypoint at `~/.local/bin/lightrsi`.

If your Codex config files are not under the default `~/.codex`, set:

```bash
export CODEX_CONFIG_PATH="/path/to/config.toml"
export CODEX_HOOKS_CONFIG_PATH="/path/to/hooks.json"
export TOKENPILOT_CODEX_CONFIG="/path/to/tokenpilot.json"
```

Then run the same install flow:

```bash
pnpm --dir components/adapters/codex run build
pnpm --dir components/adapters/codex run install:codex
```

If `lightrsi` is not found after install, make sure `~/.local/bin` is on your `PATH`.

</details>

<details>
<summary><strong>Claude Code</strong></summary>

<br>

Default install:

```bash
pnpm --dir components/adapters/claude-code run build
pnpm --dir components/adapters/claude-code run install:claude-code
```

This updates `~/.claude/settings.json` for local gateway routing, writes `~/.claude/tokenpilot.json`, registers the shared `tokenpilot_memory_fault_recover` MCP server in `~/.claude/.claude.json`, installs a `SessionStart` hook that auto-starts the local gateway on first use, and preserves existing Claude files as `.tokenpilot.bak` backups before rewriting.

If your Claude Code files are not under the default `~/.claude`, set:

```bash
export CLAUDE_CODE_SETTINGS_PATH="/path/to/settings.json"
export CLAUDE_CODE_MCP_CONFIG_PATH="/path/to/.claude.json"
export TOKENPILOT_CLAUDE_CODE_CONFIG="/path/to/tokenpilot.json"
```

Then run the same install flow:

```bash
pnpm --dir components/adapters/claude-code run build
pnpm --dir components/adapters/claude-code run install:claude-code
```

If `lightrsi` is not found after install, make sure `~/.local/bin` is on your `PATH`.

</details>

<span id='quickstart'/>

## ⚡ Quick Start

Pick your host and open the matching one-pass setup below.

<details>
<summary><strong>OpenClaw</strong></summary>

<br>

1. Start or restart OpenClaw.
2. Open a session with a `lightrsi/<model>` model such as `lightrsi/gpt-5.4-mini`.
3. Run:

```text
/lightrsi status
```

You should see a status block similar to:

- plugin entry enabled
- config enabled
- mode `normal`
- context engine slot `layered-context`
- stabilizer enabled
- reduction enabled

For a fuller runtime summary, run:

```text
/lightrsi report
/lightrsi doctor
/lightrsi visual
/lightrsi mode normal
```

`/lightrsi doctor` is the quickest integration self-check for the current OpenClaw adapter surface. `/lightrsi visual` opens the local visual inspector for stability, reduction, and eviction snapshots. `/lightrsi mode <conservative|normal|aggressive>` switches preset runtime behavior.

You can also use the standalone CLI outside OpenClaw:

```bash
lightrsi openclaw status
lightrsi openclaw report
lightrsi openclaw doctor
lightrsi openclaw visual
lightrsi openclaw mode normal
```

</details>

<details>
<summary><strong>Codex CLI</strong></summary>

<br>

The current Codex path uses the standalone CLI plus Codex hooks.

1. Run the Codex install flow shown above.
2. Start Codex normally.
3. If Codex asks you to review or trust the installed TokenPilot hooks, approve them.
4. Open a new Codex session so `SessionStart` can verify or restart the local proxy.
5. In another terminal, verify the adapter:

```bash
lightrsi codex status
lightrsi codex doctor
lightrsi codex report
lightrsi codex mode normal
lightrsi codex reduction status
lightrsi codex stabilizer target user
```

Expected first-run shape:

- `lightrsi codex doctor` reports `proxy healthy: yes`
- `lightrsi codex status` shows `stabilizer` and `reduction` enabled
- after a few turns, `lightrsi codex report` no longer says `No TokenPilot session stats yet.`

### Context Cleaner

Codex supports agent-directed occurrence release. Inspect a session, release exact
occurrences with approved evidence, then check or cancel the operation:

```bash
lightrsi codex clean --inspect <session-id>
lightrsi codex clean --session <session-id> --release <occurrence-evidence.json>
lightrsi codex clean --status <plan-id>
lightrsi codex clean --cancel <plan-id>
```

The active agent owns the release decision. LightRSI validates and records the
selection, then applies committed exclusions during later continuation.

The release file contains exact occurrence IDs, fingerprints, completion
evidence, and retained findings generated during inspection. Releases must target
the trusted active Codex session.

Install starts the local proxy immediately. If doctor still reports `proxy healthy: no`, use the manual fallback:

```bash
tokenpilot-codex status
tokenpilot-codex start
```


</details>

<details>
<summary><strong>Claude Code</strong></summary>

<br>

The current Claude Code path also uses the standalone CLI, but routes requests through a local Anthropic-compatible gateway and a shared MCP recovery server.

1. Run the Claude Code install flow shown above.
2. Start Claude Code normally.
3. Open a new Claude Code session so `SessionStart` can auto-start the local gateway.
4. In another terminal, verify the adapter:

```bash
lightrsi claude-code status
lightrsi claude-code doctor
lightrsi claude-code report
lightrsi claude-code mode normal
lightrsi claude-code reduction status
lightrsi claude-code stabilizer target developer
```

Expected first-run shape:

- `lightrsi claude-code doctor` reports `proxy healthy: yes`
- `lightrsi claude-code status` shows `stabilizer` and `reduction` enabled
- after a few turns, `lightrsi claude-code report` no longer says `No TokenPilot session stats yet.`

Like Codex, install success does not guarantee that the gateway is already healthy before the first real session triggers `SessionStart`.

</details>


<span id='visual-results'/>

## 🖼️ Visual Results

The screenshots below come from the built-in visual inspector opened with:

```text
lightrsi visual
```

<details>
<summary><strong>TokenPilot</strong> runtime effects</summary>

<br>

Stable-prefix view:

![TokenPilot stabilizer view](./figs/tokenpilot/stabilizer.png)

Reduction view:

![TokenPilot reduction view](./figs/tokenpilot/reduction.png)

Eviction view:

![TokenPilot eviction view](./figs/tokenpilot/eviction.png)

</details>

<span id='architecture'/>

## 🏗️ Fork Architecture

The architecture below describes this fork's current `main` branch. It should
not be assumed to match upstream LightRSI.

At a high level:

- `components/packages`
  - shared foundation and independently composable feature packages
- `components/presets`
  - verified feature combinations such as TokenPilot
- `components/adapters`
  - host-specific integration, install surfaces, runtime hooks, and product registration
- `components/products`
  - shared CLI, Visual launcher, and MCP recovery surfaces

```text
LightRSI/
├── components/
│   ├── packages/
│   │   ├── foundation/           # contracts, runtime, host, history, artifact, product infrastructure
│   │   └── features/             # cleaner, stabilizer, reduction, eviction, and memory
│   ├── presets/
│   │   └── tokenpilot/           # Stabilizer + Reduction + Eviction composition contract
│   ├── adapters/
│   │   ├── openclaw/             # OpenClaw adapter
│   │   ├── codex/                # Codex CLI adapter
│   │   └── claude-code/          # Claude Code adapter
│   └── products/
│       ├── cli/                  # shared lightrsi CLI and browser visual launcher
│       └── mcp/                  # shared memory_fault_recover MCP server
├── docs/                         # Public-facing notes and smoke helpers for the current runtime path
├── website/                      # Documentation site
└── README.md
```

TokenPilot is now a preset rather than a source-code parent directory. Each adapter explicitly binds the preset and contributes host discovery metadata; the shared CLI and Visual surface consume those registrations.

<span id='experiments'/>

## 🧪 Experiment Reproduction

Benchmark tasks, runners, profiles, and analysis are maintained in the separate [TokenPilot experiment repository](https://github.com/Xubqpanda/TokenPilot). LightRSI contains the runtime and plugin platform; it no longer vendors the experiment harness.

Experiment entrypoints:

- [TokenPilot reproduction guide](https://github.com/Xubqpanda/TokenPilot/blob/main/README.md)


<span id='commands'/>

## 💡 Commands

Use the basic commands first, then the session-aware and advanced ones when you need them.

Shared standalone CLI patterns:

```bash
lightrsi report
lightrsi visual
lightrsi use openclaw
lightrsi use codex session <session-id>
lightrsi context
lightrsi <host> session <session-id> report
```

- `lightrsi report` shows the latest available report across hosts
- `lightrsi visual` opens the shared browser visual and lets you switch hosts and sessions
- `lightrsi use <host>` sets the default host for hostless CLI commands
- `lightrsi use <host> session <session-id>` pins the default session for later `report` and `visual`
- `lightrsi context` shows the current default host, pinned session, and remembered config target
- `lightrsi <host> session <session-id> report` reads one specific session directly

Pick your host for the command surface below.

<details>
<summary><strong>OpenClaw</strong></summary>

<br>

Inside an OpenClaw session:

```text
/lightrsi status
/lightrsi report
/lightrsi doctor
/lightrsi visual
/lightrsi mode normal
/lightrsi stabilizer target developer
/lightrsi reduction mode balanced
/lightrsi eviction on
/lightrsi help
```

Outside OpenClaw, the standalone CLI supports the same host directly:

```bash
lightrsi openclaw status
lightrsi openclaw report
lightrsi openclaw doctor
lightrsi openclaw visual
lightrsi openclaw mode normal
lightrsi openclaw session <session-id> report
```

Useful OpenClaw-only controls:

- `mode aggressive` enables the most aggressive runtime policy preset
- `eviction ...` controls lifecycle-aware context eviction
- `settings details on` expands status output with more runtime detail
- `stabilizer ...` and `reduction ...` let you tune prefix stabilization and observation reduction directly

</details>

<details>
<summary><strong>Codex CLI</strong></summary>

<br>

Use the standalone CLI:

```bash
lightrsi codex status
lightrsi codex report
lightrsi codex doctor
lightrsi codex visual
lightrsi codex session <session-id> report
lightrsi codex reduction status
lightrsi codex stabilizer target developer
lightrsi codex mode normal
lightrsi codex reduction mode balanced
lightrsi codex help
```

Useful Codex controls:

- `stabilizer on|off` toggles stable-prefix rewriting
- `stabilizer target <developer|user>` chooses where dynamic context is attached
- `reduction on|off` toggles observation reduction
- `reduction mode <light|balanced>` switches between lighter and stronger trimming
- `reduction pass toolPayloadTrim off` disables one specific reduction pass

</details>

<details>
<summary><strong>Claude Code</strong></summary>

<br>

Use the standalone CLI:

```bash
lightrsi claude-code status
lightrsi claude-code report
lightrsi claude-code doctor
lightrsi claude-code visual
lightrsi claude-code session <session-id> report
lightrsi claude-code reduction status
lightrsi claude-code stabilizer target developer
lightrsi claude-code mode normal
lightrsi claude-code reduction mode balanced
lightrsi claude-code help
```

Useful Claude Code controls:

- `stabilizer on|off` toggles stable-prefix rewriting
- `stabilizer target <developer|user>` chooses where dynamic context is attached
- `reduction on|off` toggles observation reduction
- `reduction mode <light|balanced>` switches between lighter and stronger trimming
- `reduction pass toolPayloadTrim off` disables one specific reduction pass

</details>


<span id='experimental-results'/>

## 📚 Upstream Reference Results (Not Fork Measurements)

PinchBench and Claw-Eval results belong to the original LightRSI/TokenPilot research implementation. They are not measurements of this fork.

- [Original LightRSI research and results](https://github.com/zjunlp/LightRSI)
- [TokenPilot reproduction guide](https://github.com/Xubqpanda/TokenPilot/blob/main/README.md)
- [Fork-specific validation](#fork-validation)

The fork's controlled Compact workload is documented above with its own scope, quality gates, and limitations.
<span id='citation'/>

## 📄 Upstream Heritage & Attribution

This repository is independently maintained and is not maintained or endorsed
by the upstream LightRSI authors.

**Inherited upstream:** LightRSI runtime foundation, TokenPilot concepts and
research, and portions of host integration and documentation.

**Fork-specific:** Compact admission changes, occurrence-based Context Cleaner,
durable session and restart behavior, provider/runtime hardening, and
fork-specific telemetry and evaluation.

Please cite the original authors' papers when using the underlying LightRSI and
TokenPilot research.

```bibtex
@article{xu2026tokenpilot,
  title={TokenPilot: Cache-Efficient Context Management for LLM Agents},
  author={Xu, Buqiang and Xue, Zirui and Chen, Dianmou and Fu, Chenyang and Wu, Chiyu and Huang, Caiying and Jiang, Chen and Fang, Jizhan and Deng, Xinle and Chen, Yijun and others},
  journal={arXiv preprint arXiv:2606.17016},
  year={2026}
}

@inproceedings{fang2025lightmem,
  title={LightMem: Lightweight and Efficient Memory-Augmented Generation},
  author={Jizhan Fang and Xinle Deng and Haoming Xu and Ziyan Jiang and Yuqi Tang and Ziwen Xu and Shumin Deng and Yunzhi Yao and Mengru Wang and Shuofei Qiao and Huajun Chen and Ningyu Zhang},
  booktitle={The Fourteenth International Conference on Learning Representations},
  year={2026},
  url={https://openreview.net/forum?id=dyJ0GWpjJB}
}

```

<span id='contributing'/>

## 🤝 Contributing

We welcome bug fixes, host adapter improvements, onboarding fixes, tests, and documentation updates, see [CONTRIBUTING.md](./CONTRIBUTING.md) for more details.

<span id='contributors'/>

## 🎉 Upstream Contributors

<a href="https://github.com/zjunlp/LightRSI/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=zjunlp/LightRSI" />
</a>

These credits refer to original LightRSI contributors. See the [fork history](https://github.com/longdang193/LightRSI/commits/main) for fork-specific maintenance and contributions.

<span id='related-works'/>

## 📚 Related Works

### LightMem Series
This fork originates from ZJUNLP's LightRSI project and the broader LightMem research series, which address context bloat, excessive token consumption, and low cache utilization for long-running LLM agents:
- [LightMem](https://github.com/zjunlp/LightMem) — A lightweight and efficient memory management framework designed for Large Language Models and AI Agents
- [LightMem-Ego](https://github.com/zjunlp/LightMem-Ego) — A lightweight streaming multimodal memory system for everyday-life assistance
### Other Related Projects

- [LLMLingua-2](https://github.com/microsoft/LLMLingua) — Token-level prompt compression
- [SelectiveContext](https://github.com/liyucheng09/Selective_Context) — Self-information-based context reduction
- [Pichay](https://github.com/fsgeek/pichay) — Demand paging for LLM context windows
- [MemoBrain](https://github.com/qhjqhj00/MemoBrain) — Executive memory for long-horizon reasoning agents
- [AgentSwing](https://github.com/Alibaba-NLP/DeepResearch) — Adaptive parallel context management routing for web agents
- [MemOS](https://github.com/MemTensor/MemOS) — Memory operating system for LLM agents
- [Headroom](https://github.com/chopratejas/headroom) — Compresses everything when AI agent reads

<span id='community'/>

## 💬 Community

- **Upstream LightRSI Discord:** [Discord](https://discord.gg/gHdVfWz3) — upstream setup help, debugging, feedback, and user discussion
- **This fork:** GitHub Issues — reproducible bugs, feature requests, and integration regressions
