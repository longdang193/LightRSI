# Repository Governance

## Purpose

Define durable ownership boundaries for private development, reusable agent methods, planning artifacts, generated runtime surfaces, starter-kit output, and curated public publication.

## Repository Roles

### Private Source Repository

`project-OS-starter` is development source of truth. It may contain internal governance, planning history, private analysis tools, generated provider adapters, and publication tooling.

### Starter Kit

`generated_exports/project-OS-starter-kit` is generated consume-only output.
Build it from `repo_config/starter-kit-manifest.json`; do not author changes
directly in generated output or maintain a separate sibling kit copy.

When this document is shipped in the starter kit, downstream projects own their
adopted root instructions, documentation, skills, configuration, and tests.
Private factory maintenance, adapter generation, and starter rebuild workflows
remain upstream concerns and are not downstream operating instructions.

### Public Repository

Public repository receives curated product-facing output through publication procedure. It is not a mirror of private repository.

## Ownership Layers

- `AGENTS.md`: repo-wide agent baseline.
- `docs/operating_system/rules/`: hard invariants.
- `.agents/skills/`: reusable methods with enough operational detail to execute correctly.
- `docs/operating_system/prompt_templates/`: reusable invocation wording.
- `docs/operating_system/planning/`: planning artifact selection and advisory executor/profile selection.
- `docs/operating_system/publication/`: publication policy and rewrite guidance.
- `docs/operating_system/procedures/`: maintainer commands and runbooks.
- `repo_config/`: actively consumed repository, starter-kit, adapter, planning-schema, and publication configuration.
- `agents/*.toml`: canonical agent-profile registry; owns profile identity, provider, model, optional rank, compatibility, description, and instructions.
- code, tests, configuration, and validators: executable truth.

Do not duplicate one behavior across several layers. References do not justify preserving an otherwise dead layer.

## Skill Governance

A skill owns one reusable method. Description exists for discovery; body contains full method, inputs, ordered steps, guardrails, outputs, and verification.

- Keep specialized high-use methods when consolidation would remove important detail.
- Merge only genuinely overlapping activation surfaces.
- Do not replace substantive bodies with short routing summaries.
- Keep mandatory `required_reads` only when skill cannot function correctly without that source.
- Use conditional reads for optional templates, governance, or tooling.
- Remove metadata without an active runtime or validator consumer.

Canonical planning and delivery skills are:

- `skill-spec-drafting`: author behavioral and interface specifications.
- `skill-writing-plans`: convert approved design into executable tasks.
- `skill-plan-document-reviewer`: review specification and plan readiness.
- `skill-using-git-worktrees`: create optional isolated workspace and record workspace identity.
- `skill-executing-plans`: execute approved plan tasks with task-local proof.
- `skill-disposable-artifact-cleanup`: validate and remove exact task-owned disposable artifacts before the final verified snapshot.
- `skill-verification-before-completion`: reconcile final scope and produce verified, incomplete, or blocked result.
- `skill-finishing-a-development-branch`: perform explicitly authorized Git disposition and safe Git-managed branch/worktree cleanup.

## Planning Ownership

- Approved user scope or issues may own intent.
- Brainstorming reports optionally own exploratory options, trade-offs, recommendations, and unresolved questions.
- Specifications own approved behavior, interfaces, decisions, invariants, acceptance criteria, and validation intent.
- Plans own ordered implementation tasks, exact files, commands, dependencies, execution approach, parallel-safe lanes, shared-write controls, required skills, and verification.
- Each implementation plan has at most one owning specification through `parent_spec`; a coherent cross-cutting change belongs in one specification, while independent specifications receive independent plans.
- Wayfinding maps own only provisional decision frontiers for explicit multi-session discovery; one writer maintains each map, while specifications and plans own promoted truth and execution details.
- Execution skills own implementation; verification and branch-finishing skills own evidence and authorized Git disposition.
- Validators validate artifacts that exist; they do not require a planning ladder.

No artifact is required merely to connect two other artifacts. Create only the
smallest artifact needed for safe execution. Local, reversible, design-clear
work may move directly from approved intent to execution and verification.

No persistent planning-lineage generator is required. Historical completed
plans remain evidence, not active instructions.

## Git-Tracked Coordination

Git-tracked multi-task work uses the active plan plus Git as durable recovery
state. Runtime threads, agent sessions, and temporary progress artifacts never
become repository coordination authority.

Canonical policy:
`docs/operating_system/rules/git-tracked-coordination-rule.md`.

## Generated Surfaces

Canonical sources are edited directly; generated surfaces are regenerated.

- `.agents/skills/` is canonical skill source.
- `docs/operating_system/rules/` and rules are canonical governance sources.
- `generated_agents/` contains provider packaging.
- `.agents/rules/` is generated from canonical rules for supported local runtimes.
- `generated_exports/project-OS-starter-kit/` is disposable starter output.

If generated output conflicts with canonical source, fix source or mapping and regenerate. Never maintain both manually.

## Runtime Capability Resolution

Project OS owns capability requirements, authority and data boundaries, evidence
requirements, fallback, and stop conditions. Active executors resolve those
capabilities to currently available tools within existing permissions. Read
`docs/operating_system/tooling/runtime-tool-resolution.md` for the resolver
boundary; domain tooling docs own domain-specific capability and evidence needs.
Source, tests, contracts, and runtime systems remain authoritative.

## Agent Memory

Configured MCP Memory Server stores verified reusable lessons outside repository when active executor exposes it. Under `dcode-project`, Codex handles required memory calls and passes validated handoff facts. Use it conditionally for recorded invariants, recurring failures, resumed work, or known operational constraints. Memory never overrides source, tests, ADRs, current governance, or explicit instructions.

Canonical policy: `docs/operating_system/rules/agent-memory-rule.md`.

## Publication Boundary

- Private repository remains source of truth.
- Build public export in disposable location.
- Publish only allowlisted content.
- Exclude private governance, MCP memory data and backups, local tool state, credentials, internal audits, and private generated indexes.
- Run dry-run verification and inspect export before push.
- Push only with explicit authorization.

Detailed policy lives in `docs/operating_system/publication/public-repo-publication-policy.md`. Procedure lives in `docs/operating_system/procedures/publication-procedure.md`.

## Configuration Governance

Keep only configuration with an active consumer. `repo_config/` currently owns:

- `planning_artifact_schema.yaml`
- `publication-config.json`
- `starter-kit-manifest.json`
- `switchyard-routing.toml`

Runtime settings for a particular adopted project belong in that project, not in this starter factory unless shipped behavior actively consumes them.

## Validation and Closeout

Use `scripts/validate_repo_contracts.py` as canonical repository contract command. Run focused checks first, then broad checks appropriate to changed scope.

When changing agent sources or generated adapter ownership:

1. validate metadata
2. regenerate all adapters
3. verify adapter drift
4. rebuild and validate starter kit
5. run publication dry run when boundary-sensitive content changed
6. search for stale paths and deleted names
7. run `git diff --check`

Completion claims require fresh evidence. Do not weaken validators to preserve deleted architecture or arbitrary inventory targets.
