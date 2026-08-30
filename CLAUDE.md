<!--
CONSUME-ONLY STARTER KIT FILE

Origin: project-OS-starter.
Factory adapter and runtime tooling are not included in this starter kit.
Downstream projects own direct edits to this file.
-->

# Project Agent Instructions

This file is repo-wide instruction layer. More specific directory instructions override it.

## Core Rules

- Keep changes aligned with owning code, documentation, and configuration layers.
- Read scoped `AGENTS.md` files before modifying files under their directories.
- Treat source code and tests as authoritative when documentation or analysis tools disagree.
- Update tests and documentation when behavior or contracts change.
- Never expose private governance, credentials, agent memory, or internal tooling through public publication.
- For generated agent surfaces, edit canonical sources, then run required sync and verification commands.

## Subagent Routing

Discover profiles from `agents/*.toml`. Positive `rank` values identify ranked
profiles; specialized and unranked profiles may be added without entering rank
ordering.

Profiles with positive `rank` form an ordered capability relation. Profiles
without `rank` are unranked and explicit-only; they are not lower or higher
than ranked profiles. Profile identity, rank, and model come from the registry;
specialized profiles may use another name and model.
In validator-executor setups, select the executor and validator profiles
independently based on their respective bounded task contracts. A validator may
use a lower, equal, or higher profile than the executor when that profile can
reliably complete the validation task. Select the lowest profile that can
reliably complete each contract.

Template profile and task function are separate. Task function is open-ended and
defined by current task contract; it may include debugging, research, plan
review, design exploration, plan writing, implementation, validation,
orchestration, or another required function. Never maintain a fixed mapping from
functions to profiles.

When spawning a subagent:

- Select the template through the platform's agent-type selector; task names only label work.
- Use a fresh-context fork when selecting a different agent type.
- Never override the template's model or reasoning effort.
- Do not select unnamed or other agent types.
- Subagents must not spawn other agents unless explicitly requested.

Select profile from required reasoning depth, ambiguity, scope, risk, and cost.
Use lowest profile that can reliably complete current task contract. If scope or
risk grows beyond selected profile, stop and delegate again using suitable
profile. Function name alone never determines profile.

## Native Personal-Local Work

Ordinary trusted one-user work follows `native-personal-local` in
`docs/operating_system/procedures/personal-local-worktree-procedure.md`:
native Git plus selected local executor: Codex, DeepAgents, or Tura. Executor and
profile selection are independent. Codex is safe default when plan omits executor
or delegated benefit is unclear. Follow
`docs/operating_system/planning/planning-dispatch.md` for advisory selection.
Reuse a clean checkout for small reversible work; use a native Git worktree only
when existing worktree guidance selects isolation.
Git owns workspace identity, change evidence, and authorized branch disposition.
For DeepAgents, use user-local `dcode-project`; it derives ignored profile views
from `agents/*.toml` and local provider endpoint and credentials. Do not track
`.deepagents/`, invent provider fallback, runtime state, or cleanup commands.
DeepAgents auto-loads this root `AGENTS.md` and discovers `.agents/skills` as
project skills. It does not auto-load `.agents/rules`; those are generated
platform-adapter views. Codex remains MCP, approval, Git, verification, and
acceptance controller; delegated runtimes receive only validated handoffs and
bounded task contracts. Do not bypass configured provider routes or invent
direct-provider fallback. For launcher details, file-root conventions, and
runtime-specific restrictions, read
`docs/operating_system/procedures/personal-local-worktree-procedure.md`.
Do not duplicate rules in `.deepagents/AGENTS.md`.
Name a discovered profile in bounded DeepAgents `task`
delegation; do not use `dcode --agent` or `dcode -r` for project coordination.
Use `skill-deepagents-executing-plans` when an approved Git-tracked plan is
executed through DeepAgents with bounded delegated work.

Git-tracked coordinated work follows
`docs/operating_system/rules/git-tracked-coordination-rule.md`: Git owns
workspace and repository state; the active plan owns workflow state; one lead
controller updates coordination state; runtime thread or session state is never
the recovery source.

## Project Design Rules

### Use SSOT

Each fact, rule, setting, or policy should have one main source.

Do not store the same information in several places. Other parts of the project should read from the main source instead of copying it.

### Build Reusable Components

Do not create a new solution for every similar case.

Create shared components, functions, and rules that can be reused in different parts of the project.

### Follow the Principle of Permanence

Extend systems in a way that preserves as many existing properties, rules, contracts, and valid behaviors as possible.

Example:

If a component initially supports light mode and is later extended to support dark mode, dark-mode support should not require a separate component or change the component’s existing behavior. The same component contract should remain valid, while theme-specific values are supplied through configuration.

### Maintain Symmetry

Similar or opposite cases should use the same structure and logic.

Examples:

- light mode and dark mode
- day mode and night mode
- enable and disable
- import and export
- create and delete
- forward and reverse

Do not build two separate systems when one shared system can support both cases.

Represent the difference through:

- configuration
- parameters
- themes
- data
- shared strategies

Example:

Light mode and dark mode should use the same UI components. Only the theme values should change.

### Avoid Unnecessary Special Cases

Before adding separate logic, ask:

> Is this case truly different, or can the existing general solution handle it?

Prefer one consistent system that works for all equivalent cases.

## Agent Memory

Use configured MCP Memory Server only when current work can benefit from reusable project knowledge and active executor exposes it. Fetch memory for shared workflows, known invariants, recurring failures, resumed work, or high-risk changes. For DeepAgents, Codex controller performs required memory calls and passes only validated handoff facts. Store only verified, reusable lessons; never store transient progress, guesses, secrets, personal data, or facts already obvious from authoritative sources.

Memory informs work but never overrides explicit instructions, source code, tests, ADRs, or current governance. If memory tools are unavailable, continue source-first without recreating repository-file memory.

Detailed policy: `docs/operating_system/rules/agent-memory-rule.md`.

## Backend Work

For every material backend behavior change, use `skill-backend-verification` whether or not a frontend exists. Prove behavior through direct boundary tests, important success and failure paths, final state or side effects, and fresh automated output. Add contract, real-dependency, representative-operation trace, or performance evidence only when applicable. Frontend and browser evidence never substitute for backend proof.

## Frontend Work

For material frontend or accessibility implementation, follow `docs/operating_system/rules/frontend-ui-rule.md`. For material visual or UX judgment, follow the explicitly selected applicable design skill. Explicitly selected `impeccable` satisfies its overlapping visual/UX-design scope; do not invoke overlapping design skills for another opinion by default. Existing project design-system sources remain canonical. Reuse existing components and design tokens, prefer semantic native controls, and verify affected states, keyboard access, focus, contrast, responsive behavior, reduced motion, and supported themes.

When work crosses frontend behavior and backend contracts or routes, use `skill-full-stack-integration`. Matching `*.integration.md` notes own temporary contract-to-UI mapping, unresolved mismatches, and acceptance evidence, not transport schemas. Canonical schemas, generated clients, backend routes, and tests establish current behavior. Report conflicts and affected owners before implementation.

When browser-interaction capability is available, use it for repeatable user
flows, accessibility snapshots, viewport checks, and screenshots. Browser
evidence does not replace committed regression tests. Resolve capability through
`docs/operating_system/tooling/runtime-tool-resolution.md`.

Skip skill for copy-only edits, mechanical selector changes, or isolated nonvisual logic. If unavailable, follow existing product design system and `docs/operating_system/rules/frontend-ui-rule.md`; do not block safe local fix.

## Runtime Capability Resolution

Project OS owns capability requirements, authority and data boundaries, evidence
requirements, fallback, and stop conditions. Active executor resolves required
capabilities to currently available tools within existing permissions.

Prefer native or configured capabilities. Discover tools only for unmet
capabilities. Resolve one primary provider per capability question, smoke-check
unfamiliar providers, and never downgrade mandatory evidence to source
inspection. Source, tests, contracts, and runtime systems remain authoritative.

Do not install, connect, authenticate, or widen data access without approval.
Do not assume provider names, MCP availability, permission settings, or result
shapes across executors. Read `docs/operating_system/tooling/runtime-tool-resolution.md`
when runtime capability selection is material.
