---
name: skill-writing-plans
description: Use when an approved specification or direct approved scope needs an executable multi-step implementation plan.
distribution_tier: starter_kit
---
# Writing Plans

## Role

Turn an approved specification or direct approved scope into an executable plan
that another engineer or agent can follow without inventing design, paths,
symbols, task boundaries, or proof.

This skill owns implementation decomposition, dependency order, execution
approach, required skills, shared-write controls, and verification design. It
does not own unresolved product behavior, implementation itself, final
completion claims, or Git disposition.

## When To Use

Use this skill when work needs several ordered edits, spans multiple maintained
surfaces, carries meaningful migration or rollback risk, or needs a durable
handoff.

Do not create a plan for a local, reversible, design-clear change whose files,
edit, and proof are already obvious. Approved intent may move directly to
execution and verification.

## Inputs

- approved specification, or direct approved scope when no durable spec is needed
- current source, tests, configuration, validators, and maintained docs relevant to the change
- repository status and generated-surface boundaries
- known constraints, compatibility requirements, risks, and completion evidence

If behavior, interfaces, invariants, or acceptance criteria remain unresolved,
stop and use `skill-spec-drafting`.

## Conditional References

- Read the approved specification in full when one exists.
- Use `docs/operating_system/templates/implementation-plan-template.md` when saving a canonical plan.
- Read `docs/operating_system/rules/git-tracked-coordination-rule.md` when
  execution needs durable multi-task coordination or recovery.
- Read governance only when ownership, generation, publication, or repository boundaries affect execution.
- State minimum capability and required evidence before selecting a tool. Prefer native tools for local file mapping and source inspection; resolve unmet capabilities through `docs/operating_system/tooling/runtime-tool-resolution.md`. Do not query multiple tools for the same fact by default.
- Read related execution skills only when the chosen execution approach requires them.
- Name the selected applicable design skill only for tasks requiring material visual or interaction judgment, and include rendered viewport, theme, and accessibility proof for those tasks.
- Name `skill-performance-optimization` only for explicit performance requirements or measured regressions. Performance tasks must identify baseline command or evidence source, representative workload and environment, target metric, threshold owner, and regression proof.
- Name `skill-backend-verification` for material backend behavior. Identify direct boundary, important failures, final state or side effects, rollback/idempotency, material real dependencies, contract proof, and representative-operation trace mechanism by applicability.
- Name `skill-full-stack-integration` when a task crosses frontend behavior and backend contracts or routes. Identify matching sidecar, canonical contract owner, route impact, generated consumers, focused backend and frontend proof, browser flow, and sidecar removal condition.

Source and tests remain authoritative when documents or optional tools disagree.

Executor selection follows `docs/operating_system/planning/planning-dispatch.md`.
Executor and profile selection are independent. A plan may record an optional
default task executor, but each Git-tracked task records its authoritative
`codex`, `deepagents`, or `tura` executor in the task ledger. Use Codex when
controller authority is required or delegated benefit is unclear; use Tura or
DeepAgents only when task-specific evidence supports that choice.

When a plan names `deepagents` as executor, record only executor choice and
task role. Do not treat it as a tool-permission grant. Current `dcode-project`
forces `--no-mcp`; plan required MCP research or verification under Codex, then
pass only validated `codex.mcp.handoff.v1` facts to DeepAgents.

## Artifact Boundaries

- specification: approved behavior, interfaces, design decisions, invariants, acceptance criteria, and validation intent
- implementation plan: ordered tasks, dependencies, exact files and symbols, execution approach, required skills, shared-write controls, commands, and exit criteria
- execution skill: implementation and task-local proof
- verification skill: final evidence and plan reconciliation
- branch-finishing skill: explicitly authorized Git disposition

No artifact is required merely to connect two other artifacts.
Each plan keeps at most one `parent_spec`; do not invent `parent_specs` or a
second linkage system. Coordinate several affected outcomes through the plan's
task dependencies and ownership instead.

## Planning Process

### 1. Confirm Approved Scope

- identify requested outcome, preserved behavior, exclusions, and approval state
- separate required work from desirable follow-up
- stop if implementation would require an unapproved behavioral decision

### 2. Re-read The Specification

When a spec exists:

- map every requirement, invariant, interface, migration rule, and acceptance criterion
- identify explicit non-goals
- note open questions that block task design
- record which requirements need code, configuration, tests, docs, migration, generated refresh, or operational proof

### 3. Reconcile Approved Scope With Repository Truth

- locate exact files, symbols, callers, tests, commands, and generated consumers
- distinguish canonical inputs from generated outputs
- inspect existing helpers and patterns before proposing new code
- identify unrelated working-tree changes that execution must preserve
- confirm deletion targets have no active consumer
- for cross-boundary work, map frontend, backend, and shared-contract owners plus applicable evidence; omit non-applicable boundary classes

### 4. Define Implementation Outcomes

State concrete results, not activities. Each outcome should describe changed
behavior or maintained surfaces and how completion can be proven.

### 5. Choose Execution Approach

Select one:

- `inline sequential`: default; one executor owns ordered tasks
- `subagent-ready`: tasks have clear ownership and can be delegated independently
- `parallel-capable`: two or more lanes have disjoint write sets and no hidden ordering dependency

Select coordination separately:

- `none`: small reversible execution that does not need durable multi-task resume
- `git-tracked`: work requiring durable multi-task resume, delegated
  checkpoints, or parallel writers

For `git-tracked`, initialize Coordination State and task ledger before
execution. Record one coordination owner, branch and base expectations,
workspace ownership, dependencies, required proof, blockers, and next action.

Also state:

- required skills per task or lane
- optional default task executor and authoritative task-ledger executor per task
- required isolation: current workspace, task-specific isolated worktree, or
  per-writer isolated worktrees
- commit policy; checkpoint commits are created by the lead after acceptance
- shared files or symbols that force serialization
- sequential fallback when delegation or parallel execution is unavailable

Use existing owners instead of adding parallel-phase metadata: `Mode` and waves
own parallel grouping; task `Dependencies` and `Files And Symbols` own immutable
inputs; `Parallel ownership` and task paths own write ownership; dependency order
owns fan-in barrier; task and final `Verification` own post-fan-in validation.
This applies equally to Codex and DeepAgents execution.

Do not create a separate orchestration artifact. Plan owns this decision.

### 6. Build Dependency Order

Order tasks by executable truth:

1. prerequisite inspection or baseline proof
2. canonical contract or shared-owner change
3. direct consumers
4. focused tests and validators
5. dependent docs and generated outputs
6. broad verification and reconciliation

Do not schedule generated edits before canonical inputs. Do not split tasks only
to create artificial parallelism.

### 7. Right-Size Tasks

A task should produce one bounded, reviewable outcome with one clear exit gate.
For backend or frontend/backend work, prefer smallest valuable capability slice: contract when applicable, backend implementation, direct backend proof, consumer integration when present, representative trace when material, then slice verification.

Split a task when it:

- has more than one independent behavioral outcome
- mixes canonical changes with unrelated cleanup
- has multiple write owners
- cannot be verified with one coherent proof set
- contains a risky migration that deserves its own stop point

Merge tasks when they:

- touch the same owner and cannot pass independently
- repeat the same setup or verification
- separate a tiny code edit from its required test
- exist only to mirror document sections

Use waves only when several tasks share a real prerequisite. Do not use fixed
task counts or time quotas. Tasks in one wave must be mutually independent.
Dependent review or validation belongs in later wave after all required producer
tasks complete.

### 8. Write Task Contracts

Each task must include:

```markdown
### Task N: <bounded outcome>

**Purpose:**
**Task Function:**
**Template Profile:**
**Specification Coverage:**
**Required Skills:**
**Files And Symbols:**
**Dependencies:**
**Authority:**
**Steps:**
**Verification:**
**Exit Criteria:**
```

Name exact paths, symbols, commands, expected results, generated consumers, and
the authoritative executor for every Git-tracked task.
If a symbol does not yet exist, name its intended owner and contract. Steps
must be executable actions, not restated goals. Add task-level execution mode
only when it differs from the plan-level `Execution Approach`. `Authority` names
task-local preauthorized actions plus stop conditions for external, destructive,
or scope-changing actions. It never grants permissions beyond active Codex
configuration. `Task Function` is open-ended. `Template Profile` records
controller-selected discovered profile based on reasoning depth, ambiguity,
scope, risk, and cost; never define fixed function-to-profile maps. Positive
`rank` values order only ranked profiles; unranked profiles are explicit-only
and non-orderable. In validator-executor
setups, select executor and validator profiles independently from their bounded
task contracts. A validator may be lower, equal, or higher than its executor
when that profile can reliably complete validation. Select the lowest profile
that can reliably complete each contract; do not prohibit `xhigh` execution.

### 9. Define Verification Strategy

- task-local proof covers each bounded task
- final proof covers implementation outcomes and cross-task integration
- behavioral changes include focused regression proof
- backend behavior includes direct boundary, business/failure, state or side-effect, and fresh automated proof; contract, real dependency, trace, browser, and performance evidence remain applicability-based
- performance claims use identical before/after workloads and environments, named metrics, owned targets, and correctness checks
- generated surfaces refresh only when canonical inputs changed
- destructive or migration work includes rollback or stop conditions
- commands must exist in the current repository

### 10. Write The Canonical Plan

Default path:

- `docs/superpowers/plans/YYYY-MM-DD-HH-MM-<topic>-plan.md`

Minimum frontmatter:

```yaml
---
layer: intent | operating_system | change
artifact_type: plan
status: proposed | active | completed | superseded
template_id: implementation-plan
name: <short-plan-name>
parent_spec: docs/superpowers/specs/<file>.md # only when a spec exists
targets:
  - <path>
---
```

`layer`, `artifact_type`, and `status` are required. Use `parent_spec` only when
it resolves to a real owning spec. Use `targets` for cross-cutting work. Do not
invent extra planning metadata or intermediary artifacts.

### 11. Self-Review Once

After the full plan is written, review it with fresh eyes:

1. **Spec coverage:** For every requirement and section in the spec, point to a task that implements or proves it. Add missing tasks.
2. **Placeholder scan:** Search for red flags from `No Placeholders`. Replace each with exact content.
3. **Cross-task consistency:** Confirm paths, types, method signatures, property names, commands, and generated owners remain identical across tasks.
4. **Ownership:** Confirm canonical sources change before generated outputs and shared writes have one owner.
5. **Task sizing:** Split mixed outcomes and merge artificial fragments.

Fix issues inline. Do not run a second full self-review.

## No Placeholders

Do not leave:

- `TODO`, `TBD`, `placeholder`, or `fill later`
- `as needed`, `if necessary`, or equivalent undecided branches
- `relevant files`, `appropriate tests`, or unnamed owners
- `handle errors`, `update docs`, `etc.`, or other non-executable steps
- unresolved `<path>`, `<function>`, `<command>`, or template tokens

If information cannot be discovered, state the blocking decision and stop
instead of hiding uncertainty inside the plan.

## Review And Handoff

- use `skill-plan-document-reviewer` before costly, cross-cutting, migration-heavy, or handoff-heavy execution
- hand off approved plans to `skill-executing-plans`
- use `skill-using-git-worktrees` only when isolation materially reduces risk
- use `skill-dispatching-parallel-agents` only for disjoint write ownership
- final completion flows through `skill-verification-before-completion`, then optional `skill-finishing-a-development-branch`

The plan is ready for completion verification only when required outcomes,
tasks, task-local proof, deviations, and final commands are reconciled. A
checked box records progress; it is not proof. Only
`skill-verification-before-completion` may set final plan status to `completed`
after returning `verified`.

## Red Flags

- plan copies the specification instead of decomposing implementation
- tasks say what to achieve but not where or how to verify it
- later tasks rename symbols or types defined earlier
- generated outputs are edited as canonical sources
- parallel lanes share files or hidden prerequisites
- every task invokes every skill
- plan creates new orchestration, lineage, registry, or handoff layers
- completion depends on child documents rather than implementation evidence

## Guardrails

- No implementation code in this skill.
- Preserve unrelated user work.
- Prefer existing helpers, tests, and native repository commands.
- Keep smallest task set that fully covers approved scope.
