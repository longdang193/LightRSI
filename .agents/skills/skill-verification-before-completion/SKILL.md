---
name: skill-verification-before-completion
description: Use when implementation appears complete and fresh evidence is required before final status or branch-finishing handoff.
required_reads: []
distribution_tier: starter_kit
---
# Verification Before Completion

## Role

Prove whether implementation is complete. Reconcile approved scope, current repository state, tests, maintained contracts, and generated outputs before setting final plan status or handing work to branch finishing.

This skill owns completion evidence and closure readiness. It does not commit, pull, rebase, merge, push, create pull requests, publish, delete branches, or remove worktrees.

## Inputs

Receive from `skill-executing-plans`:

- active plan and linked specification when they exist
- workspace path and creation mechanism
- branch name or detached HEAD
- base branch and base commit when known
- current HEAD
- staged, unstaged, untracked, and preserved unrelated changes
- task-local verification already run
- known failures, deferrals, and blockers

If required implementation remains, return to `skill-executing-plans`.

## Conditional References

Read only what supports current claims:

- active plan and completion criteria
- linked specification acceptance criteria and preserved invariants
- affected validators, tests, schemas, generated procedures, and maintained documentation
- fresh rendered or browser evidence for material visual changes, following `docs/operating_system/rules/frontend-ui-rule.md` and resolving browser capability through `docs/operating_system/tooling/runtime-tool-resolution.md` when available; cover relevant viewports, supported themes, affected states, keyboard use, focus, contrast, and reduced motion
- stateful-route evidence for in-scope deep links, refresh, browser Back/Forward, failed mutations, retry, duplicate submission prevention, and optimistic rollback
- audit rule only when its failure trigger applies
- publication rules only when reporting publication readiness
- configured MCP memory only after meaningful retries, debugging, or reusable failure discovery when active executor exposes it; under DeepAgents, use validated Codex handoff facts and store lessons through Codex after fresh evidence confirms them

Do not require retired architecture-sync scripts, persistent context packs, or missing reconciliation prompts.

## Evidence Rule

No completion claim without fresh evidence from command output or direct inspection that proves claim.

Old output, confidence, plan checkboxes alone, code review, agent summaries, and partial tests are not completion proof.

## Verification Process

### 1. Confirm Verified State Candidate

Record exact candidate state:

- workspace path
- native or manual worktree mechanism
- branch or detached state
- current HEAD
- base branch and base commit when known
- staged diff
- unstaged diff
- untracked files in scope
- unrelated changes intentionally preserved

Verification applies only to this recorded state. Later content-changing commit hooks, edits, rebase, conflict resolution, merge, generated refresh, or base update invalidate affected evidence.

### 2. Define Completion Claims

List concrete claims requiring proof:

- requested behavior exists
- original defect no longer reproduces when applicable
- preserved behavior still works
- specification acceptance criteria are satisfied
- all required plan tasks are complete
- required maintained contracts are aligned
- generated outputs match changed canonical inputs
- no known required work remains

Do not use one broad claim such as “everything works.”

### 3. Reconcile Plan And Specification

For every required task and criterion classify:

- proven complete
- incomplete
- blocked
- deferred with explicit approval
- not applicable with reason

Do not require raw `- [ ]` count to equal zero. Optional, historical, deferred, and not-applicable items may remain when disposition is explicit.

Use existing planning and template validators when planning artifacts changed. Do not duplicate required-section parsing inside skill. Required maintained-contract updates are implementation scope when named by the plan; verification checks alignment but does not rewrite a contract to make proof pass. The lead controller accepts the reconciled result and performs durable plan/spec status transitions.

### 4. Map Claims To Evidence

| Claim | Minimum evidence |
|---|---|
| bug fixed | original reproduction or regression test passes |
| behavior implemented | focused behavioral test or executable demonstration |
| tests pass | named fresh test command exits successfully |
| build succeeds | named fresh build command exits successfully |
| validator clean | affected validator exits successfully |
| generated output current | canonical sync or check reports no drift |
| requirements met | every required criterion reconciled |
| docs aligned | affected maintained owner inspected or validated |
| external behavior works | live or external evidence, not local inference |
| performance improved | identical before/after workload and environment, named metric, variance or tail evidence, and correctness checks |
| performance budget met | fresh configured benchmark, budget, or monitoring evidence passes |
| backend behavior complete | direct backend boundary, important business/failure paths, final state or side effects, fresh automated output, plus contract, real-dependency, representative-operation trace, or performance proof when applicable |
| frontend verification complete | applicable rendered or browser evidence, affected states, keyboard and focus behavior, accessibility, responsive containers, themes, and console result |
| end-to-end journey complete | cross-boundary journey evidence covering setup, user actions, transport, visible result, failure or retry behavior, and relevant navigation state |
| frontend/backend integration complete | backend behavior evidence, canonical contract check when applicable, focused frontend tests, verified browser flow, and fulfilled sidecar removed or narrowed to an explicit blocker |

### 5. Run Focused Proof

Run first:

1. original reproduction or regression test
2. tests nearest changed behavior
3. affected validator, formatter, type checker, build, or integration check

Read full output, exit code, failure count, and skipped checks.

For browser-verified work, record the browser operation used, routes, viewports or containers, interactions exercised, result findings, issues corrected, and any unverified states. Browser evidence does not replace committed regression tests.

### 6. Run Required Broad Proof

Select broader checks from changed scope:

- repository contracts after governance, schema, validator, planning, or agent-runtime changes
- full tests after cross-cutting behavior changes
- generated adapter drift after canonical agent-source changes
- starter-kit build and validation after starter-distributed changes
- publication dry run after publication-owned changes
- live checks when claim depends on external state
- `git diff --check` before verified result

Do not run every repository command for a local, non-behavioral edit.

### 7. Inspect Repository State

Inspect:

- final changed-file list and diff
- staged, unstaged, and untracked files
- accidental edits outside approved scope
- generated files changed without canonical inputs
- canonical inputs changed without required generated refresh
- stale references, merge markers, temporary artifacts, or unresolved lane-related stashes

Do not require unrelated historical stashes to be removed.

### 8. Handle Failed Evidence

When required proof fails:

1. report exact command or inspection
2. include relevant output and file reference
3. classify failure as introduced, pre-existing, environmental, external, or unknown
4. return introduced or unknown implementation failures to `skill-executing-plans` and `skill-systematic-debugging`
5. keep plan status non-completed

A successful unrelated command does not cancel failed required proof.

### 9. Set Plan Status

Set plan status to `completed` only when:

- every required implementation outcome is proven satisfied
- every required task and task-local verification item is proven complete
- every approved deferral is recorded and no longer treated as required current scope
- required focused and broad checks pass
- maintained and generated truth surfaces are aligned
- no unresolved required task, failed required check, stale status, or unrecorded scope deviation remains
- no task remains active and no required blocker remains unresolved
- task ledger, branch, base, `HEAD`, worktrees, and accepted proof reconcile
- no unresolved parallel writer lane or out-of-scope change remains

Return `verified` with evidence when these conditions pass. The lead controller,
not a delegated validator, performs the durable plan-status transition. A
checked box is progress state, not completion proof.

Plan `completed` means implementation and verification are complete. It does not mean branch merged, pushed, published, or cleaned.

When a completed plan has an active `parent_spec`, the lead controller also marks
that specification `completed` after verification proves the implementation
against its contract. Plans with no `parent_spec` do not imply a specification
status transition. Completed and superseded specifications remain historical
and are not revised in place.

### 10. Produce Verification Result

Return exactly one result:

- `verified`: required implementation and evidence complete; branch finishing may be offered
- `incomplete`: required work remains within approved scope
- `blocked`: progress requires user decision, access, external state, or resolution outside current skill

For `verified`, include:

- workspace path and mechanism
- branch or detached state
- verified HEAD
- verified staged, unstaged, and untracked in-scope state
- base branch and base commit when known
- verification commands and results
- approved deferrals and residual risks
- explicit handoff to `skill-finishing-a-development-branch`

For `incomplete` or `blocked`, include:

1. failed claim or criterion
2. exact file and section or command
3. evidence
4. smallest required fix or unblock condition

## Authorization Boundary

Verification makes Git closure eligible. It does not authorize:

- commit
- fetch or pull
- branch creation
- rebase
- merge
- push
- pull request creation or update
- publication
- branch deletion
- worktree removal or pruning
- stash creation, apply, pop, or drop

## Red Flags

- claiming success before command completes
- relying on old or partial output
- treating raw checkbox count as executable truth
- marking plan complete with required work open
- ignoring skipped or environment-dependent checks
- saying docs align without inspecting affected owners
- performing Git mutation from verification skill
- handing off without exact verified repository state
- requiring retired architecture or context-pack systems

## Integration

- `skill-using-git-worktrees` provides workspace identity when isolation is used.
- `skill-executing-plans` performs implementation and task-local verification.
- `skill-systematic-debugging` investigates failed proof.
- `skill-backend-verification` provides task-local direct backend evidence independent of frontend availability.
- `skill-performance-optimization` defines performance workloads, metrics, targets, and comparison evidence.
- `skill-full-stack-integration` defines cross-boundary contract, browser evidence, and sidecar lifecycle; runtime tool resolution remains owned by `docs/operating_system/tooling/runtime-tool-resolution.md`.
- `skill-disposable-artifact-cleanup` validates and removes explicitly authorized task-owned disposable artifacts before the final verified snapshot; this skill decides retention dependencies and reruns affected proof but does not delete files itself.
- `skill-finishing-a-development-branch` performs explicitly authorized Git disposition after `verified` result.
