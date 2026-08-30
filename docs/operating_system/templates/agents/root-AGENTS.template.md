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

Use only these template profiles:

- `low`: lower-cost profile for bounded, low-complexity, low-risk work.
- `normal`: default profile for ordinary complexity and risk.
- `high`: high-capability profile for material complexity, ambiguity, or risk.
- `xhigh`: highest-capability profile for deep reasoning, complex multi-step work,
  or demanding validation tasks.

Profile order: `xhigh > high > normal > low`.
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
For DeepAgents, use user-local `dcode-project`; it derives ignored project role
views from `agents/*.toml` and local provider endpoint and credentials. Do not track
`.deepagents/`, invent provider fallback, runtime state, or cleanup commands.
DeepAgents auto-loads this root `AGENTS.md` and discovers `.agents/skills` as
project skills. It does not auto-load `.agents/rules`; those are generated
platform-adapter views. For a detailed rule outside this root prompt, name and
read its canonical `docs/operating_system/rules/*.md` source in bounded task
scope. Do not duplicate rules in `.deepagents/AGENTS.md`.
DeepAgents setup rejects user-local `.deepagents/.mcp.json`; keep direct
DeepAgents MCP configuration absent so Codex remains sole MCP authority.
Current launcher forces `--no-mcp`, binds DeepAgents to selected Git root, and
does not project Codex MCP servers, approval, sandbox, profile, or thread
settings. It gives native DeepAgents fixed launcher-owned built-ins: filesystem
tools plus `git` and `py` shell commands. Task input cannot widen this set.
Codex controller owns MCP calls and passes only validated
`codex.mcp.handoff.v1` facts through user-local `dcode-project` handoff files.
`--mcp-select` narrows provenance only. DeepAgents task launch requires
`dcode-project --role <low|normal|high|xhigh>`; launcher resolves the selected
canonical source model while top-level Codex model remains controller default.
For bounded external delegation, `project-delegate` selects Tura from the same
tracked profile definitions and user-local config. Native Codex remains controller for
MCP, approval, Git, verification, and acceptance; Tura receives one bounded
task, fixed Git root, native `--sandbox`, fresh session id, and opaque JSONL.
`dcode-project` remains the explicit DeepAgents path and does not route through
Tura. Tura production routing stays `Tura -> LightRSI -> 9router -> provider`
through `TURA_PROVIDER_CONFIG`; no direct-provider fallback exists.
Do not pass raw `--stdin` or pipe task text to `dcode-project`; only validated
`--handoff-file` launches create DeepAgents stdin. DeepAgents built-in file tools
receive exact native file-tool root in every bounded task. On Windows it looks
like `/Users/<user>/repos/<repo>`; append repository-relative paths to that
root. Never guess `/workspace/...` or use Windows drive syntax. Read only named
source, test, and text files with filesystem tools; never read database, binary,
archive, or runtime artifacts. For SQLite evidence, use launcher-authorized `py`
with stdlib `sqlite3` read-only URI mode. Run `py` directly; do not prefix it
with `cd`, shell operators, or wrappers. For `py -c`, use one expression; never
use `;`. Ask for repository-relative `path:line` evidence. When a task needs an
acceptance decision, require `PASS`, `FAIL`, or `BLOCKED` first. Do not assume
interpreter, web, or MCP access; if a task needs unavailable capability, return
`BLOCKED`.
Name `low`, `normal`, `high`, or `xhigh` in bounded DeepAgents `task`
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

## Front-End Work

For material UI, UX, accessibility, responsive-layout, or visual-design work, use `ui-ux-pro-max` when available and target platform fits its scope. Existing project design-system sources remain canonical. Reuse existing components and design tokens, prefer semantic native controls, and verify affected states, keyboard access, focus, contrast, responsive behavior, reduced motion, and supported themes.

When work crosses frontend behavior and backend contracts or routes, use `skill-full-stack-integration`. Matching `*.integration.md` notes own temporary contract-to-UI mapping, unresolved mismatches, and acceptance evidence, not transport schemas. Canonical schemas, generated clients, backend routes, and tests establish current behavior. Report conflicts and affected owners before implementation.

When `browser.test` is available, use it for repeatable user flows, accessibility snapshots, viewport checks, and screenshots. `browser.diagnose` is not available yet. Browser evidence does not replace committed regression tests.

Skip skill for copy-only edits, mechanical selector changes, or isolated nonvisual logic. If unavailable, follow existing product design system and `docs/operating_system/rules/frontend-ui-rule.md`; do not block safe local fix.

## Code Intelligence

Use native code tools for current files and small local changes, Serena for exact symbols and references, `semble_codebase_search` for unknown-location code discovery, and `ast_grep_preview` for structural preview when available. Use private read-only GitNexus only when available and broad flow or impact remains unknown. Use DeepWiki only for advisory orientation in unfamiliar external GitHub repositories. Do not query multiple tools for the same fact by default. Source and tests win every conflict; unavailable tools never block safe source-first work.

- Serena runs with `--context codex --project-from-cwd`, `no-memories`, and `no-onboarding`. Never commit `.serena/` state.
- GitNexus remains optional and private-only. Limit use to `query`, `context`, `impact`, and `api_impact`; check freshness before high-trust impact or refactor use; never make refresh a universal completion gate.
- For DeepWiki, use `read_wiki_structure` before focused `ask_question`; use `read_wiki_contents` only when full generated documentation is required. Hand off to local source and Serena before implementation, and to GitNexus before broad impact or refactoring decisions. Treat unknown-freshness output as advisory and verify against pinned upstream source.
- Tests and CI own enforcement. `docs/architecture.md` and ADRs own durable architecture intent.
- Detailed policy: `docs/operating_system/tooling/code-intelligence-tools.md`.
