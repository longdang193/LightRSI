---
template_id: implementation-plan
target_globs:
- docs/superpowers/plans/*.md
required_sections:
- Goal
- Implementation Outcomes
- Task Breakdown
- Verification
- Completion Criteria
required_frontmatter:
  artifact_type: plan
  template_id: implementation-plan
  contract_version: "1"
  status: proposed
  layer: change
distribution_tier: starter_kit
---

# Implementation Plan Template

## Goal

<what this plan must deliver>

## Implementation Outcomes

Use this section for final implementation outcomes only.
Do not restate task-by-task execution details or local verification steps here.

### <deliverable 1>

Describe one concrete implementation outcome this plan must deliver, including changed surfaces, expected behavior, and verification intent.

### <deliverable 2>

Describe another concrete implementation result this plan must deliver, such as test coverage, documentation alignment, or downstream handoff readiness.

## Execution Approach

- Mode: `inline sequential | subagent-ready | parallel-capable`
- Coordination: `git-tracked | none`
- Default task executor: `codex | deepagents | tura` (optional; Codex default; each Git-tracked task ledger `Executor` value is authoritative for that task; current DeepAgents launcher uses no MCP, so required MCP work stays with Codex and passes validated handoff facts)
- Required skills: `<exact skill names or none>`
- Isolation: `<current workspace | optional worktree>`
- Commit policy: `<verified per-task checkpoint commits preauthorized | no commits during execution>`
- Preauthorized local actions: `<edits, declared checks, configured MCP reads, approved workspace isolation, bounded DeepAgents execution>`
- User-approval actions: `<push, merge, publication, external writes, destructive recovery, discard, cleanup; exact bounded lane exceptions must be stated in task Authority>`
- Parallel ownership: `<disjoint files/symbols or none>`
- Sequential fallback: `<ordered fallback when parallel work is unsafe>`

## Coordination State

Required when `Execution Approach > Coordination` is `git-tracked`. Omit for
ordinary uncoordinated execution. One lead controller owns this section and
task ledger. Git owns workspace and change evidence; executor thread state
never becomes repository state.

- Coordination owner: `single lead controller`
- Coordination schema: `2`
- Branch: `<target branch>`
- Base commit: `<commit>`
- Expected workspace: `<clean or named preserved changes>`
- Next action: `<one dependency-ready action>`
- Blockers: `<none or concrete blocker>`

`contract_version: 1` marks the modern plan contract. Completed plans without
this marker remain historical compatibility artifacts. `Coordination schema: 1`
marks compatible Git-tracked coordination. `Coordination schema: 2` additionally
requires completed task sections and final verification checklists to be fully
checked, preventing ledger state from outrunning Markdown evidence. Versioned
completed plans require terminal task states and recorded proof. Post-
verification branch disposition may remain in `Next action`.

| Task | State | Workspace | Executor | Depends On | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Task 1 | `pending` | current | `codex` | none | `<command>` | pending |

Allowed states: `pending`, `active`, `blocked`, `completed`. `inline sequential`
and `subagent-ready` modes permit one active task. `parallel-capable` mode may
have multiple active tasks only in current dependency-ready wave with proven
independence and declared ownership. One lead controller remains sole ledger
writer. When `Commit policy` preauthorizes it, completed task changes and ledger
update share one checkpoint commit after task-local proof. Git owns checkpoint
identity: derive it from the commit containing the latest ledger transition;
never copy that commit SHA into the plan. An active plan may preauthorize an
assigned lane main agent to commit and push its exact lane, create or update
its PR, perform an assigned review action, merge the exact approved PR into its
declared base after gates, and clean the retired lane. Direct or exceptional
base mutation, force push, retargeting, protection bypass, semantic conflict
resolution, destructive recovery, discard, and unrelated cleanup still need
explicit user authorization.

Task ledger `Executor` values are `codex`, `deepagents`, or `tura`. A task value
overrides the optional plan default. Executor choice does not select profile;
`Template Profile` and optional `Validator Profile` remain independent.

## Task Breakdown

Use `Task` for directly executable implementation slices.
Use `Wave` only when plan truly needs orchestration across multiple related tasks.

Within each task:
- `Purpose` owns bounded outcome
- `Task Function` names current open-ended function without mapping it to a profile
- `Template Profile` records one controller-selected discovered profile plus selection basis for delegated work, or `none (lead controller)` for inline controller work; when CoS uses Herdr, the selected profile must match `agents/*.toml`, the resolved Codex model, and Herdr launch evidence
- `Validator Profile` records an optional separate validator and its selection basis
- `Specification Coverage` maps approved requirements or direct scope
- `Required Skills` names only methods needed for this task
- `Files And Symbols` owns exact touched surfaces
- `Dependencies` owns prerequisites and prior task requirements
- `Authority` owns task-local preauthorized actions and escalation boundary
- `Steps` owns execution sequence
- `Verification` owns task-local proof
- `Exit Criteria` owns task completion gate

For material backend tasks, name direct boundary, important success/failure behavior, final state or side effects, rollback/idempotency, real dependencies, contract evidence, and representative-operation trace mechanism by applicability. Frontend/backend tasks also name final specification, prototype reference when material, canonical contract owner, integration sidecar, browser flow, and sidecar removal condition.

Prefer one smallest valuable vertical capability per task. Do not create isolated frontend and backend phases when neither can prove user-visible capability independently.

Do not duplicate final artifact verification commands here unless a command is truly both task-local and final.

### Task 1: <short task title>

**Purpose:**
- <bounded outcome this task delivers>

**Task Function:**
- <task-specific function; do not select from a fixed taxonomy>

**Template Profile:**
- Controller-selected: `<none (lead controller) | discovered profile>`
- Selection basis: <reasoning depth, ambiguity, scope, risk, and cost>

**Validator Profile (optional):**
- Controller-selected: `<none | discovered profile>`
- Selection basis: <validation>
- Select independently from the executor profile; no profile-rank relationship is required.
- Use literal `<none>` when no validator is assigned; otherwise replace it with a discovered profile name.

**Specification Coverage:**
- <requirement, decision, invariant, or approved direct scope>

**Required Skills:**
- `<skill-name>` or `none`

**Files And Symbols:**
- Inspect: `<path>:<symbol>`
- Modify: `<path>:<symbol>`
- Verify: `<path>`

**Dependencies:**
- <upstream dependency, source-first fact, or prior task result>

**Authority:**
- Preauthorized local actions: <subset of plan-level actions>
- Stop for: <scope or base changes; external or destructive action; none>

**Steps:**
- [ ] Step 1: <first bounded action>
- [ ] Step 2: <second bounded action>
- [ ] Step 3: <verification-aligned follow-up>

**Verification:**
- [ ] `<command, assertion, or inspection target>`
- Expected: <observable result>

**Exit Criteria:**
- <what makes this task done>

### Task 2: <short task title>

**Purpose:**
- <bounded outcome this task delivers>

**Task Function:**
- <task-specific function; do not select from a fixed taxonomy>

**Template Profile:**
- Controller-selected: `<none (lead controller) | discovered profile>`
- Selection basis: <reasoning depth, ambiguity, scope, risk, and cost>

**Validator Profile (optional):**
- Controller-selected: `<none | discovered profile>`
- Selection basis: <validation>
- Positive `rank` values define order only among ranked profiles; unranked profiles are explicit-only and non-orderable.
- Select executor and validator profiles independently from their bounded task contracts; no profile-rank relationship is required.

**Specification Coverage:**
- <requirement, decision, invariant, or approved direct scope>

**Required Skills:**
- `<skill-name>` or `none`

**Files And Symbols:**
- Inspect: `<path>:<symbol>`
- Modify: `<path>:<symbol>`
- Verify: `<path>`

**Dependencies:**
- Task 1 complete
- <any additional dependency>

**Authority:**
- Preauthorized local actions: <subset of plan-level actions>
- Stop for: <scope or base changes; external or destructive action; none>

**Steps:**
- [ ] Step 1: <first bounded action>
- [ ] Step 2: <second bounded action>
- [ ] Step 3: <verification-aligned follow-up>

**Verification:**
- [ ] `<command, assertion, or inspection target>`
- Expected: <observable result>

**Exit Criteria:**
- <what makes this task done>

## Verification

Use this section for final artifact-level verification only.
Do not copy every task-local proof here.

- <final command>

## Completion Criteria

The plan is ready for completion verification when:

1. every required implementation outcome is satisfied
2. every required task and task-local verification item is complete
3. plan deviations, substitutions, blockers, and deferrals are recorded
4. changed code, configuration, tests, validators, documentation, and generated outputs are reconciled with current repository truth
5. final verification commands are identified and runnable

The plan may be marked `completed` only when `skill-verification-before-completion`:

1. runs fresh final verification
2. confirms completion criteria against repository evidence
3. finds no unresolved required task, failed required check, stale status, or unrecorded scope deviation
4. returns `verified`; the lead controller then updates plan status

A checked box records progress; it is not proof by itself.
