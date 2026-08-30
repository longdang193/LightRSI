---
name: skill-deepagents-executing-plans
description: Use when executing an approved Git-tracked implementation plan through `dcode-project` where bounded DeepAgents delegation materially benefits execution. Extends `skill-executing-plans`; does not own durable coordination state.
required_reads:
  - .agents/skills/skill-executing-plans/SKILL.md
distribution_tier: starter_kit
---

# DeepAgents Plan Execution

## Role

Adapt executor-neutral plan execution to bounded DeepAgents work through
`dcode-project`. Git plus the active plan remain durable recovery state.

This skill governs the outer Codex lead controller. If loaded inside a bounded
DeepAgents task, do not assume lead-controller authority; follow only the
dispatched task contract and applicable worker or validator skills.

## Authority Model

- Codex is the lead coordination controller, sole writer of plan
  `Coordination State` and task-ledger state, MCP authority, and final Git
  acceptor.
- DeepAgents is an execution lead for one bounded active plan task.
- DeepAgents built-in `task` agents are bounded workers, readers, debuggers, or
  validators inside that assignment.
- DeepAgents runtime state and internal decomposition are ephemeral.
- DeepAgents must not select the next plan task, redefine dependencies or
  checkpoints, or mark global plan tasks complete.
- Agent output is a claim until Codex reconciles Plan plus Git and accepts
  required proof.

## Preconditions

Before dispatch, Codex must:

1. complete `skill-executing-plans` readiness and Plan-plus-Git reconciliation;
2. confirm exactly one eligible active task; the outer Codex controller owns
   any dependency-ready wave and dispatches each task separately;
3. verify workspace, branch, base ancestry, `HEAD`, status, and worktrees;
4. confirm task scope, write ownership, dependencies, required proof, and
   preserved existing changes;
5. block on unknown checkpoint, plan/Git mismatch, unresolved blocker,
   out-of-scope changes, or unsafe workspace identity.

## Launch Contract

Launch from repository root through user-local `dcode-project`:

```powershell
dcode-project --role <profile> -n "<bounded-task>"
```

When Codex-supplied MCP facts are required, use a validated user-local
`codex.mcp.handoff.v1` file with `--handoff-file`. Follow root `AGENTS.md` and
the personal-local procedure for complete launcher, flag, tool, path, and MCP
policy. Do not duplicate or override that policy here.

## Dispatch Contract

Each dispatch belongs to exactly one active plan task. One plan task may use
multiple evidence-recorded implementation, debugging, retry, or validation
attempts.

One `dcode-project` invocation equals one active plan task. Runtime-internal
decomposition never becomes plan-level coordination. Nested writers are allowed
only when dispatch explicitly permits them; they remain inside active task
workspace, authority, dependencies, and declared write ownership.

Every dispatch states:

- plan task ID and objective;
- exact workspace or worktree identity;
- exact scope, paths, and write ownership;
- satisfied dependencies;
- acceptance criteria and required proof;
- preserved existing changes;
- nested-delegation permission or prohibition;
- required result format and repository-relative `path:line` evidence.

The plan wins when a dispatch brief conflicts with plan state.

## Profile Selection

- Keep task function and profile separate.
- Select the lowest profile that can reliably complete the bounded contract.
- Positive `rank` values order only ranked profiles; unranked profiles are
  explicit-only and non-orderable.
- Select executor and validator profiles independently from their bounded
  contracts. A validator may be lower, equal, or higher than its executor when
  that profile can reliably complete the validation contract.
- Any discovered profile may execute or validate based on task fitness.
- Escalate only from task complexity, material risk, or failed-attempt evidence.

## Execution Topology

- Minimize agent count; do not instantiate a fixed role topology.
- Independent read-only assignments may run concurrently.
- Same-workspace writers remain sequential.
- Parallel writers require dependency-ready tasks, isolated Git worktrees, and
  disjoint write ownership.
- Concurrency permission comes from plan dependencies plus Git isolation, not
  runtime concurrency capability.
- Spawn a debugger only after evidence-backed failure.
- Spawn an independent validator only when validation materially benefits.
- Do not allow nested delegation unless the bounded dispatch explicitly permits
  it.
- A permitted nested writer does not create another plan task or coordination
  ledger entry.
- Read `skill-subagent-driven-development` only when its bounded delegation
  patterns fit the current task; do not inherit session-based coordination.

## Result Acceptance

Require `PASS`, `FAIL`, or `BLOCKED` first for decision-bearing work. After each
return, Codex must:

1. inspect current Git state and workspace identity;
2. inspect the diff against declared scope and preserved changes;
3. reject unexplained or out-of-scope changes;
4. run or independently confirm required proof;
5. reconcile plan, base, dependency, or acceptance changes;
6. update the plan task ledger only after acceptance;
7. select the next dependency-ready task only after durable state update.

Runtime success alone never completes a plan task.

## Failure And Retry

`BLOCKED`, `FAIL`, missing tools, missing paths, workspace mismatch, unexpected
Git state, or missing proof stops acceptance.

- Preserve useful partial changes when safe.
- Do not advance plan task state without accepted evidence.
- Record attempt evidence and blocker details under the active plan task.
- Reconcile Plan plus Git before retry, debugging, or escalation.
- Rerun affected proof after relevant implementation, plan, base, dependency,
  or acceptance changes.
- Never depend on DeepAgents or Codex thread/session recovery for repository
  coordination.

## Handoff

A replacement controller with no prior session must be able to recover
workspace, branch, base, `HEAD`, worktrees, changes, active task, dependencies,
blockers, last accepted proof, and next action from the active plan plus Git.
Otherwise return `BLOCKED` and reconcile before execution continues.

`skill-verification-before-completion` owns final verification.
`skill-finishing-a-development-branch` owns authorized Git disposition.
