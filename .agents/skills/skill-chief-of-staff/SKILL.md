---
name: skill-chief-of-staff
description: "Codex lead only: use when an approved Git-tracked plan lists `skill-chief-of-staff` in Required skills and needs sustained top-level coordination across independent Codex main-agent lanes."
required_reads:
  - docs/operating_system/rules/git-tracked-coordination-rule.md
distribution_tier: starter_kit
---

# Chief Of Staff

## Role

Coordinate approved Git-tracked execution without becoming a second execution
owner. CoS owns situational synthesis, attention selection, top-level Codex
main-agent choice, lane briefing, Herdr observation, return normalization,
blocker routing, retirement, and escalation. `skill-executing-plans` owns
approved-plan execution.

## Activation

Use CoS only when an approved plan lists `skill-chief-of-staff` in its
`Required skills` and needs sustained handoffs, independent write-capable lanes,
or cross-task coordination. Use ordinary execution for single-lane work. CoS
activates only under a native Codex lead controller. A
delegated Herdr main agent receives a bounded lane task; it must not activate
CoS, create peer agents, or reactivate coordination. CoS applies only to
`Executor: codex`; `deepagents` uses
`dcode-project`, and `tura` uses
`project-delegate`. Other generated adapters may carry this skill, but their
non-Codex lead must return `BLOCKED` rather than activate it.

## Conditional References

- Read `skill-executing-plans` for approved-plan execution and executor precedence.
- Read `skill-using-git-worktrees` for lane identity and isolated workspace ownership.
- Read `skill-requesting-code-review` when dispatching independent review.
- Read `skill-reviewing-pull-requests` when inspecting a pull request.
- Read `skill-receiving-code-review` when evaluating returned findings.
- Read `skill-verification-before-completion` for acceptance evidence.
- Read `skill-finishing-a-development-branch` for merge and cleanup disposition.
- Read `docs/operating_system/tooling/runtime-tool-resolution.md` when runtime capability is material.

## Plan Binding

Resolve the active plan in this order:

1. explicit supplied plan path
2. plan already bound by the current execution context
3. exactly one active plan matching the current repository and worktree
4. otherwise return `BLOCKED` and show candidate evidence

Never choose newest filename, first match, or conversation-only inference.
Validate plan status, repository root, worktree, branch, base, current HEAD,
task ledger, dependencies, and ownership before dispatch. Resolve behavior from
`parent_spec` first when present, otherwise from the plan specification or
approved direct scope. Missing, stale, mismatched, or ambiguous binding blocks.

## Runtime Gates

Use runtime resolution rules for capability facts. On relevant Herdr, Codex,
configuration, provider, or tooling change, verify parity before material
dispatch:

- discovered `herdr` executable and version, plus required-operation smoke check
- discovered `codex` executable and version, plus required-operation smoke check
- `CODEX_HOME`
- provider and model configuration
- required MCP and tool surface
- sandbox behavior
- approval policy
- startup and trust prompts

`Executor Selection` owns executor choice. `Template Profile` selects the
profile contract; `agents/*.toml` owns its profile identity and model
capability. Before write-capable dispatch, prove the chain from selected
`Template Profile` through its canonical `agents/<profile>.toml` entry to the
resolved Codex model and instruction surface used by Herdr. A missing or
mismatched link returns `BLOCKED`; CoS must not fall back to native subagents
or a different profile.

Reuse parity evidence only inside the current lead-controller session until
one of those inputs changes. Every main-agent launch or reuse performs a cheap
identity and binding check:

- repository root and Git common directory
- exact worktree and branch
- HEAD and expected base
- lane ownership and allowed paths
- launched process cwd
- selected profile, resolved model, and Herdr launch binding

Any mismatch returns `BLOCKED` before write-capable launch.

For Herdr main-agent launch, use the repository-owned
`scripts/herdr_main_launcher.py`. CoS verifies the full lane contract, including
branch, `HEAD`, expected base, ownership, and allowed paths. Pass only selected
profile and verified runtime identity (`session`, `pane`, and `cwd`). The
launcher verifies runtime projection plus exact pane/cwd identity and reports
Git facts; it does not enforce the full CoS lane contract. Do not construct
provider, model, or developer-instruction overrides in CoS; the launcher
resolves them from `agents/*.toml` and projects them ephemerally into Codex.
Launcher evidence separates registry/runtime projection, Git identity, Herdr
observation, and launch-request evidence. Redact developer instructions and
record their digest instead. Record discovered versions and smoke-check required
operations; compare against a pinned version only when an applicable plan or
configuration explicitly pins one.

CoS uses only provider-resolved Herdr operations: discover/list, start, prompt,
wait, read, and retire/stop. Operation names and outputs come from the active
runtime; CoS must not invent commands, event semantics, subscriptions, or
durable Herdr state. Record returned facts in the current turn or plan-owned
evidence only.

## Attention

CoS attention is pull-based on explicit CoS turns. No polling or subscription
mechanism is implied by this skill. Herdr lifecycle state is runtime observation
only. It does not prove task acceptance, update the ledger, or replace plan and
Git truth.

### Attention Audit

On each explicit CoS turn with outstanding CoS-coordinated work, after plan binding and before selecting the next action, perform a bounded read-only Attention Audit.

Inspect only currently relevant plan/task, Git/worktree, applicable PR/review, and expected Herdr lane evidence. Do not scan unrelated tasks,
worktrees, sessions, or pull requests. Do not invent Herdr event semantics.

Audit result: `NO_ACTION | INSPECT | BLOCKED`.

- `NO_ACTION` - evidence is consistent with the current lifecycle phase.
- `INSPECT` - CoS judgment or an approved in-scope correction is needed.
- `BLOCKED` - an existing canonical blocking condition prevents safe progress.

Consume blocking and verification semantics from their canonical owners; do
not recreate their failure taxonomy. Herdr absence alone is not a blocker.
Treat it as actionable only when current plan or current-turn evidence establishes that a live bound agent is expected.

Audit outcomes are advisory attention results, not workflow-state transitions.
The audit does not mutate plan, Git, PR state, Herdr, authority, or durable
coordination state. `attention_target` identifies what CoS should inspect; CoS
remains the sole next-action selector.

V1 has no autonomous wake mechanism, timer, scheduler, helper-agent dispatch,
new profile, hook integration, or persistent heartbeat state.

Select one dependency-ready task. Prefer reuse of a healthy main-agent session
when plan, repository, lane, and context match. Select a fresh top-level Codex
main agent when context isolation materially helps. When resolving a blocker
becomes a substantial independent detour, park the current lane, dispatch a
fresh bounded Herdr main agent for that blocker, and merge back only compact
evidence or result. Do not supervise executor-local workers inside `deepagents`
or `tura`.

## Lane Contract

Activate task and record ownership before launch. One write-capable main agent
gets one exact branch and isolated worktree. Use existing worktree, parallel-
write, review, verification, and finishing owners.

CoS has no direct Git or PR authority. An approved plan may grant the assigned
main agent bounded authority to create or reuse its lane, commit lane-owned
changes, push only its lane branch, create or update its PR, respond to review
comments, submit an assigned review, merge the exact approved PR into its
declared base after gates pass, and clean its verified-clean merged lane.

Never grant force push, direct or exceptional base mutation outside the exact
PR merge path, PR retargeting, branch-protection bypass, semantic conflict
resolution, unrelated branch or worktree mutation, unknown-file discard,
publication, or scope expansion.

Lane commits remain implementation artifacts. The lead controller records
coordination checkpoints in its own workspace after accepting proof; a lane
agent must not update the ledger as part of its implementation commit.

## Review And Integration

Request review through `skill-requesting-code-review`. CoS dispatches only an
independent Herdr top-level Codex main-agent session. CoS never calls
`multi_agent_v1`, native Codex subagents, DeepAgents internal `task` workers,
Tura internal workers, or executor-local reviewers or helpers. The reviewer
receives the bounded contract, not the producer session history. Native
subagent review remains available only on non-CoS execution paths.

`skill-reviewing-pull-requests` owns independent PR inspection. Project OS
review is separate from GitHub review state. A review result binds to
repository, PR number, base ref and SHA when material, head ref and SHA,
verdict, checks inspected, and known limits. GitHub `APPROVE` occurs only when
review identity is eligible and repository rules allow it; otherwise use
`COMMENT` or no GitHub action. Required distinct-identity approval returns
`BLOCKED`.

Reviewer read-only behavior is instruction-level, not host-enforced by the
launcher. Capture pre-review and post-review Git state; any unexpected
modification is a review-boundary violation and an escalation.

For each base branch, grant one dependency-ready integration action at a time
to one designated main agent. Reuse implementation-main or select a fresh
integration main agent; do not create a permanent integration role. Merge only
the expected reviewed head with required proof, clean state, and no post-review
commit. An open or merged PR never completes a task automatically.

Branch and PR publication may occur after accepted lane proof when the active
plan grants it. Final merge and lane cleanup require whole-plan verification,
the exact reviewed head, remote expected-head confirmation, and post-merge
proof. Missing remote PR capability returns `BLOCKED`; do not substitute local
base mutation.

## Returns And Retirement

Normalize main-agent execution returns to `DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED`. Keep review decisions separate: CoS acceptance uses
`PASS | FAIL | BLOCKED` after checking evidence and never converts execution
status into a review verdict.
Route blockers to missing context, failed proof, runtime mismatch, review
failure, identity limitation, or user-authorized exception.

After accepted or merged lane work, prevent new writes, retire or stop the
Herdr main-agent session, confirm no live process owns the worktree, then invoke
`skill-finishing-a-development-branch`. Never let an agent remove the worktree
from which it is running.

## Durable Truth And Escalation

The active plan owns workflow state. Git owns branch, worktree, commit, and
change truth. GitHub owns PR, review, and merge truth. Herdr owns transient
process observation only. Do not require, create, or treat `identity.md`,
`cos.yaml`, fleet, heartbeat, supervisor, workflow database, model registry,
parity state file, or Herdr-state files as coordination state.

Escalate scope expansion, semantic conflicts, force updates, protected-branch
exceptions, missing eligible review identity, destructive recovery, unknown
files, failed required proof, and unresolved plan or lane identity mismatch.

## Output

Return selected task, plan binding, lane identity, `attention_result`, optional
`attention_target`, runtime evidence freshness (`fresh-this-turn` or
`reused-this-session`, with invalidation reason when reused), agent status, proof
decision, blockers, retirement result, and next action. Do not claim completion
from Herdr status, a lane commit, an open PR, or a merged PR.
