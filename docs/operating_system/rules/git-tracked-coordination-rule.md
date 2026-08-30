---
name: git-tracked-coordination
description: Define durable coordination ownership for Git-tracked multi-task work.
alwaysApply: true
required_reads: []
distribution_tier: starter_kit
---

# Git-Tracked Coordination Rule

For Git-tracked coordinated work:

- Git owns workspace identity, branch, base ancestry, `HEAD`, history,
  worktrees, and actual repository changes.
- The active implementation plan owns task order, dependencies, active task or
  wave, required proof, blockers, and next action.
- Plan `Coordination State` and task ledger are the static coordination SSOT.
- One lead controller is the sole writer of coordination state.
- When coordinated execution begins, the lead changes plan status from
  `proposed` to `active` before activating the first task.
- Runtime threads, agent sessions, DeepAgents task state, Codex task IDs,
  `dcode -r`, temporary todos, and memory are never repository coordination
  state.
- Resume only by reconciling plan plus Git.
- Block on plan/Git mismatch, unknown checkpoint, invalid active-task state,
  out-of-scope changes, unresolved blockers, or unsafe workspace identity.
- Same-workspace writers execute sequentially.
- Concurrent writers require isolated Git worktrees, disjoint write ownership,
  and a dependency-ready wave.
- A write-capable main-agent lane uses one exact branch and isolated worktree.
  The active plan may grant that agent bounded lane authority for lane commits,
  lane push, PR create/update, assigned review action, the exact approved PR
  merge into its declared base after gates, and post-retirement cleanup.
- Lane commits are implementation artifacts, not coordination checkpoints. The
  lead remains the sole ledger writer and creates a checkpoint in the lead
  workspace only after accepting proof and updating the ledger. A lane commit
  cannot mark its task complete or change coordination state.
- Integration targeting one base branch is serialized. The lead grants one
  dependency-ready integration action at a time to one designated main agent.
  Merge requires the expected reviewed head, required proof, clean state, and
  no post-review lane commit. Direct or exceptional base mutation, force push,
  PR retargeting, protection bypass, semantic conflict resolution, unrelated
  mutation, and destructive recovery remain explicitly user-authorized.
- Before worktree cleanup, retire the associated main-agent process and confirm
  no live process owns that path. The active agent never removes its own
  worktree.
- Task completion requires declared proof accepted by the lead controller.
- The lead creates an authorized checkpoint commit only after accepting task
  proof and updating the task ledger in the same checkpoint.
- If the plan, base, dependencies, accepted behavior, or relevant
  implementation changes, reconcile coordination state and rerun affected
  proof before proceeding.

Agents execute work; the controller coordinates work; the plan records workflow
state; Git records repository state. No runtime session is required for
recovery.
