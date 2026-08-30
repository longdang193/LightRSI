---
name: skill-executing-plans
description: Use when executing an approved implementation plan or resuming partially completed planned work.
required_reads: []
distribution_tier: starter_kit
---
# Executing Plans

## Role

Execute an approved implementation plan against current repository truth, preserve unrelated work, and verify each material task before advancing.

This skill owns plan execution. It does not own design decisions, planning structure, final completion claims, Git safety rules, debugging technique, or parallel-lane coordination.

## Preconditions

Before editing, confirm:

- an approved implementation plan or explicit approved task sequence exists
- behavioral and interface decisions needed for the next task are settled
- workspace path, creation mechanism, branch or detached state, base branch, base commit, and current HEAD are understood
- staged, unstaged, untracked, and unrelated user changes are understood and preserved
- required credentials, dependencies, and external services for the next task are available, or the plan identifies a safe fallback
- for Git-tracked coordinated work, static Coordination State and task ledger match current Git evidence before editing; do not recover progress from thread or session state

If the plan has a blocking design gap, stop and return it to `skill-spec-drafting` or `skill-writing-plans`. Do not invent design during execution.

## Conditional References

Read only what the current task needs:

- the implementation plan in full before execution starts
- `docs/operating_system/rules/git-tracked-coordination-rule.md` when the plan
  selects Git-tracked coordination
- linked specification sections governing the active task
- `skill-plan-document-reviewer` when a costly or high-risk plan has not received readiness review
- `skill-using-git-worktrees` when isolation materially reduces risk
- `skill-subagent-driven-development` when approved tasks are separable, same-session sequential delegation is useful, and per-task commits are authorized
- `skill-deepagents-executing-plans` when the plan selects DeepAgents and bounded
  delegated execution materially benefits the active Git-tracked task
- `docs/operating_system/planning/planning-dispatch.md` when task executor
  selection is unclear or the plan mixes `codex`, `deepagents`, and `tura`
- `skill-dispatching-parallel-agents` when two or more lanes have disjoint write ownership
- `skill-systematic-debugging` after unexpected failures or unexplained behavior
- `skill-test-driven-development` for non-trivial behavior changes or bug fixes
- governance or publication rules only when those boundaries are in scope
- configured MCP memory only when active executor exposes it and task touches a known reusable workflow or repeats a recorded failure mode; follow `docs/operating_system/rules/agent-memory-rule.md`

When plan selects `deepagents`, its executor choice does not project Codex MCP
tools, approval, sandbox, or shell policy. Current `dcode-project` forces
`--no-mcp`. Keep task scope and Git acceptance executor-neutral; call required
MCP through Codex and pass only validated `codex.mcp.handoff.v1` facts to
DeepAgents.

When an active task selects `tura`, use the explicit `project-delegate` adapter.
When it selects `deepagents`, use `dcode-project`. Executor selection does not
transfer Git coordination, acceptance, or required Codex-owned capabilities.

Do not load every linked document or skill by default.

## Evidence Capability

State minimum capability and required evidence before selecting a tool. Prefer
native source inspection, search, diffs, and tests; resolve unmet capabilities
through `docs/operating_system/tooling/runtime-tool-resolution.md`. Source and
tests remain authoritative, and unavailable optional tooling never weakens
mandatory proof.

Before modifying a shared symbol, route, validator, generator, or orchestration function, inspect its direct consumers and affected tests. Fix root cause at the narrowest shared owner.

## Execution Process

### 1. Establish Execution State

1. Read the full plan and any approved specification governing it.
2. Inspect workspace path, creation mechanism, branch or detached state, base branch and commit, current HEAD, repository status, and existing diffs.
3. Read workflow state from the plan, then reconcile it against Git and accepted
   proof. Plan owns workflow state; Git proves repository reality. Block on
   mismatch instead of silently inferring another task state from files.
4. Record preserved invariants and explicit out-of-scope work.
5. Identify generated outputs, publication surfaces, or local mirrors that derive from canonical files in scope.

Do not reset, clean, overwrite, or reformat unrelated user work. Do not create a stash as routine execution mechanism. Pre-existing or explicitly authorized lane-related stashes are reconciled during branch finishing.

### 2. Review Plan Readiness

Before the first edit, check:

- named files and symbols still exist
- commands still match current repository tooling
- task order respects real dependencies
- each task has proof strong enough to support its exit claim
- generated files are outputs, not proposed edit targets
- no task duplicates behavior already implemented elsewhere

For a small correctable mismatch, update the plan and continue. For changed scope, unresolved design, unsafe deletion, or missing acceptance criteria, stop for plan or specification revision.

### 3. Select Next Action

For Git-tracked coordination, the lead changes plan status from `proposed` to
`active` before activating the first task.

Choose the smallest unblocked action from approved scope:

1. prerequisite inspection
2. focused failing check or reproducible baseline when behavior changes
3. canonical source edit
4. focused verification
5. dependent documentation or generated refresh
6. task status update

Before dispatch, read the active task ledger `Executor` and `Template Profile`
values. For `codex`, execute inline lead-controller work directly when the
profile is `none`; when a fixed profile is selected for delegated work, use the
active native Codex subagent capability only when CoS is not selected. When the
approved plan lists `skill-chief-of-staff` in `Required skills`, keep
this skill as the execution owner and allow CoS to select only a Herdr-
supervised top-level Codex
main agent after plan, runtime parity, lane identity,
and profile-binding gates pass; CoS must not fall back to native subagents.
CoS must not call `multi_agent_v1`, native Codex subagents, DeepAgents internal
`task` workers, Tura internal workers, or executor-local reviewers or helpers.
`Executor Selection` owns executor choice, while `Template Profile` and
`agents/*.toml` own profile/model capability; Herdr launch must prove the same
resolved binding. Use `dcode-project` for `deepagents` and `project-delegate` for `tura`;
do not infer executor from profile rank or task-function name, and
do not let a profile select an executor.

Keep exactly one local task active unless parallel execution is explicitly justified. Do not invent adjacent cleanup merely because it is nearby.

### 4. Execute One Task

For each task:

1. inspect owning source and direct consumers
2. confirm smallest root-cause change
3. add or update the smallest useful check for non-trivial logic
4. edit canonical files only
5. remove superseded behavior when replacement is proven
6. run focused verification immediately
7. inspect diff for accidental scope growth
8. update plan task state only after Git and required proof support the planned transition

A task is complete only when its requested output exists, preserved behavior remains intact, and task-local verification passes.

### 5. Handle Divergence

Plans guide execution; current source and tests expose reality.

When execution differs from the plan:

- correct stale file paths, command names, or harmless ordering directly in the plan
- record a necessary implementation substitution and why it preserves approved behavior
- return to planning when the change affects scope, architecture, interfaces, invariants, acceptance criteria, or user-visible behavior
- never silently skip a task because implementation became inconvenient
- never weaken a validator or test merely to make execution pass

### 6. Handle Failures

After a failed command:

1. capture exact command, exit code, and relevant error
2. determine whether failure is introduced, pre-existing, environmental, or unrelated
3. use `skill-systematic-debugging` when cause is not obvious
4. fix introduced regressions before continuing dependent work
5. stop after repeated failure when progress requires user input, credentials, external state, or design change

Do not rerun unchanged failing commands without a new hypothesis.

### 7. Keep Truth Surfaces Aligned

Update only surfaces affected by changed behavior or contracts:

- code, configuration, tests, and validators own executable truth
- specifications own approved behavior and invariants
- plans own implementation tasks and verification history
- governance and workflows own repository method
- generated adapters, indexes, starter output, or publication mirrors derive from canonical sources

Regenerate only outputs whose canonical inputs changed. Do not require documentation updates when behavior and maintained contracts remain unchanged.

### 8. Verify The Active Task

Run verification in increasing scope for the task being completed:

1. original reproduction or focused test
2. tests nearest changed code
3. affected validator, build, or integration command
4. generated refresh only when canonical inputs changed
5. inspect task diff for accidental scope growth

Fresh output must support the task-local completion claim. A partial check proves only its tested scope.

### 9. Reconcile Plan Progress

After each task:

- compare its exit criteria with repository evidence
- mark completed items only when proof exists
- record legitimate divergence, blockers, or deferrals
- leave failed or incomplete work open
- select the next smallest unblocked task

Do not set the plan to `completed` from this skill merely because implementation edits are finished.

### 10. Hand Off For Completion Verification

When all required plan tasks appear complete:

1. inspect final repository status and changed files
2. record workspace path, mechanism, branch or detached state, base commit, current HEAD, and working-tree state
3. ensure plan task state matches repository evidence
4. invoke `skill-verification-before-completion`
5. let that skill run fresh final proof, reconcile outcomes, tasks, deviations, and repository state, then set final plan status only when it returns `verified`

Create a local checkpoint commit only when active plan `Commit policy` explicitly
preauthorizes verified per-task checkpoints. The lead creates it after accepting
task proof and updating the task ledger, so implementation and accepted workflow
state share one checkpoint. An exact active-plan lane grant may authorize lane
push, PR create/update, assigned review action, exact approved PR merge, and
post-retirement cleanup. Branch or PR publication may follow accepted lane
proof; final merge and cleanup require whole-plan verification. Exceptional or
destructive actions still require explicit user authorization.

## Handoff

When execution must continue in another task or session, leave a compact handoff in the active plan or user response containing:

- last completed task
- current repository state and active task
- exact changed files
- verification already run and current failures
- next smallest unblocked action
- blockers or required decisions

Do not create a persistent context-pack system or duplicate source truth for ordinary handoff.

## Stop Conditions

Stop and request direction when:

- approved scope is ambiguous in a way that changes behavior
- a required destructive action lacks authorization
- user work conflicts with the planned edit
- required credentials, access, or external state are unavailable
- repeated verification failures need a design decision
- the plan no longer matches approved specification or current architecture

Continue source-first when optional analysis tools are unavailable.

## Red Flags

- editing before reading the full plan
- trusting either plan state or repository evidence without reconciling both;
  block on mismatch
- implementing unresolved design choices
- changing generated output instead of canonical source
- broad refactoring during a bounded task
- skipping focused verification until the end
- treating old test output as current proof
- hiding failed checks behind a successful unrelated command
- claiming completion with required tasks still open
- creating new orchestration, lineage, or handoff layers

## Integration

- `skill-writing-plans` produces executable plans.
- `skill-plan-document-reviewer` checks readiness before costly execution.
- `skill-using-git-worktrees` optionally establishes isolated workspace identity.
- `skill-subagent-driven-development` specializes this method with sequential fresh implementers and per-task review.
- `skill-dispatching-parallel-agents` coordinates independent concurrent write lanes and their fan-out/fan-in method.
- `skill-systematic-debugging` owns failure diagnosis.
- `skill-test-driven-development` owns behavior-change proof during implementation.
- `skill-disposable-artifact-cleanup` may audit task-owned disposable artifacts; invoke its Cleanup Mode only through completion verification.
- `skill-verification-before-completion` produces final evidence result.
- `skill-finishing-a-development-branch` performs authorized Git disposition after verified result.
