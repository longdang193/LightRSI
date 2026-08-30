---
name: skill-finishing-a-development-branch
description: Use after fresh completion verification when an explicitly authorized Git disposition is needed for a branch or worktree.
required_reads: []
distribution_tier: starter_kit
---
# Finishing A Development Branch

## Role

Finish verified development work through one explicitly selected Git disposition: commit, push branch and create or update pull request, local fast-forward merge, keep workspace unchanged, or discard with destructive confirmation.

This skill owns Git reconciliation and Git-managed branch/worktree cleanup after verification. It does not implement remaining work, decide product behavior, publish curated output, clean task-owned disposable artifacts, or weaken failed checks.

## Preconditions

Require a fresh accepted task-proof handoff for branch or PR publication, and a
fresh `verified` result from `skill-verification-before-completion` before final
merge or cleanup. The evidence must contain:

- workspace path and creation mechanism
- branch or detached state
- verified HEAD
- verified staged, unstaged, and untracked in-scope state
- base branch and base commit when known
- verification commands and results
- approved deferrals and residual risks

If verification is missing, stale, incomplete, or blocked, stop.

## Delegated Executor Boundary

When verified work used DeepAgents or another delegated executor:

- Treat executor output as claims. Require current Git evidence and the verified
  handoff from `skill-verification-before-completion` before disposition.
- Never stage executor-local runtime state, `.deepagents/`, credentials,
  provider bindings, or user-local handoff artifacts. Canonical in-scope
  repository configuration such as `agents/*.toml` remains eligible.
- `BLOCKED`, `FAIL`, missing proof, or workspace mismatch prevents completion
  disposition. Preserve current changes and return the required controller
  decision.
- This skill does not launch, resume, or clean executor runtime state. Run only
  repository-declared generated-surface checks required by the verified handoff.

## Authorization Rule

Verification makes closure actions eligible. For an assigned lane, an explicit
active-plan lane grant selects bounded lifecycle actions. User authorization
remains required for exceptional or destructive actions.

Do not commit, fetch, pull, create branch, rebase, merge, push, create or update pull request, apply or drop stash, delete branch, prune metadata, or remove worktree without explicit authorization for that action. An active approved plan may grant an assigned main agent bounded authority for its exact lane: branch/worktree creation or reuse, lane commits, lane push, PR create/update, assigned review action, exact approved PR merge into declared base after gates, and cleanup after retirement and clean-state proof. Direct or exceptional base mutation, force push, PR retargeting, branch-protection bypass, semantic conflict resolution, unrelated branch/worktree mutation, destructive recovery, unknown-file discard, and merging another lane remain user-authorized.

Never infer a file is “superseded.” Before reconciliation can remove or overwrite
content, show every overlapping file with hashes and diff summary, then require an
explicit per-file disposition: **restore**, **reconcile**, **keep current**, or
**delete**. Unknown files default to **preserve**. Never drop a stash or run `git clean`
before disposition approval.

## 1. Reconfirm Repository State

Inspect without mutation:

```powershell
git rev-parse --show-toplevel
git rev-parse --git-dir
git rev-parse --git-common-dir
git branch --show-current
git rev-parse HEAD
git status --short --branch
git remote -v
git worktree list --porcelain
git stash list
```

Compare current state with verified handoff.

Invalidate affected verification when any of these changed content or integration result:

- file edit after verification
- generated refresh after verification
- commit hook modifying files
- rebase
- conflict resolution
- merge
- base branch update affecting integration
- stash apply or pop affecting lane files

Rerun required checks before proceeding after invalidation.

## 2. Classify Workspace

Identify:

- primary checkout or linked worktree
- native-managed or manually created worktree
- named lane branch or detached HEAD
- base branch and worktree where base is checked out
- clean, staged, unstaged, and untracked state
- lane-related versus unrelated stashes
- remote and upstream configuration

Do not assume `main`, `origin`, named lane branch, clean tree, or same-worktree base checkout.

## 3. Resolve Detached HEAD

If work is at detached HEAD:

1. identify verified commits and working-tree changes
2. propose branch name and base
3. require explicit branch-creation authorization
4. create branch before commit, push, pull request, or merge

Do not leave verified commits reachable only by detached HEAD.

## 4. Reconcile Uncommitted Work

If verified in-scope changes are uncommitted:

1. show exact staged, unstaged, and untracked scope
2. preserve unrelated changes
3. use the active plan lane grant when present; otherwise request commit authorization and message
4. stage only approved files
5. commit
6. inspect hook output and repository state
7. rerun affected verification if hooks changed content

Do not use broad staging when unrelated changes exist.

## 5. Present Closure Options

Present only eligible options:

1. **Push branch and create or update pull request**
2. **Merge locally with fast-forward only**
3. **Keep branch and worktree unchanged**
4. **Discard branch or worktree** with explicit destructive confirmation
5. **Direct push to base branch** only when user explicitly requests it and repository policy permits

State exact branch, base, remote, worktree, commits, required network actions, and cleanup consequence for each option.

Do not choose option for user.

## 6. Push Branch And Pull Request Path

After explicit selection and an applicable active-plan lane grant or explicit
user authorization:

1. confirm named branch and committed verified state
2. confirm remote target
3. request network authorization when required
4. push lane branch
5. create or update pull request when the active lane grant allows it and support exists
6. record branch, remote, commit SHA, and pull-request result
7. keep the lane process and worktree available for review fixes and integration
8. after whole-plan verification, review acceptance, and expected-head confirmation, retire the lane main-agent process, confirm no live process owns the worktree, then remove it only when cleanup is granted and safe

Do not merge local base first when pull request path is selected.

For remote PR integration, re-read provider PR state immediately before merge.
Verify PR number, base ref, head ref, expected head SHA, required checks,
review identity, and mergeability. Merge through the provider's PR operation by
that exact PR and expected head. If remote head or base differs, stop with
`reconciliation-required`; never replace remote PR merge with direct base
mutation. After merge, verify remote base head and record the result before
cleanup.

## 7. Local Fast-Forward Merge Path

After explicit selection:

1. locate worktree where base branch is checked out
2. verify base worktree is clean
3. compare verified base commit with current base
4. fetch or update base only with explicit network authorization
5. rerun required integration checks if base changed materially
6. merge from base worktree:

```powershell
git -C <base-worktree> merge --ff-only <lane-branch>
```

7. if fast-forward fails, stop with `reconciliation-required`
8. rerun required post-merge checks on base worktree
9. push base only with separate explicit authorization; exact approved PR merge is the only plan-granted base write

Never run `git checkout main` blindly inside lane worktree.

## 8. Reconciliation Required

When fast-forward is impossible or conflicts exist, report:

- lane branch and commit
- base branch and commit
- divergence cause
- exact conflicting or overlapping files when known
- smallest resolution option

Before rebase, merge, conflict resolution, stash apply or pop, reset, checkout
restore, worktree cleanup, or deletion, collect and show evidence for every
overlapping file, including tracked, untracked, ignored, conflict, and stash-only
files:

- path and source state: base, lane, current worktree, index, untracked, or stash ID
- blob or content hashes for each available source
- concise diff summary and diff stat for each differing source pair

Use read-only evidence commands as applicable:

```powershell
git diff --name-status <base>...<lane>
git diff --stat <base>...<lane>
git diff --summary <base>...<lane>
git diff --name-status
git diff --cached --name-status
git ls-files --others --ignored --exclude-standard
git stash show --name-status <stash-id>
git stash show --stat <stash-id>
git rev-parse <ref>:<path>
git hash-object -- <path>
```

Require explicit disposition for each listed file:

- **restore**: name exact source ref or stash version to restore
- **reconcile**: name intended combined result; stop for semantic choice
- **keep current**: preserve current worktree or index version
- **delete**: require explicit destructive confirmation for that path

Preserve every file without approved disposition. Identical names, matching paths,
timestamps, partial overlap, or later commits never prove a file is superseded.

Allowed proposals:

- rebase lane onto base
- bounded non-fast-forward merge with justification
- revise implementation before integration

Require explicit approval before rebase, semantic conflict resolution, or non-fast-forward merge. Do not auto-resolve semantic conflicts.

After approved resolution, rerun affected verification before merge or push.

## 9. Stash Policy

Do not create stash by default. Never use stash-and-forget.

When explicitly authorized lane-related stash is used or pre-existing lane stash must be reconciled, record:

- stash entry ID
- reason and owned files
- apply or pop result
- resolved files
- verification rerun result
- whether lane-related stash remains

Never run `git stash drop`, `git stash clear`, or `git stash pop` before every
affected file has approved disposition. Prefer `git stash apply` until disposition
approval and verification complete. Never run `git clean` before disposition approval.

Unrelated historical stashes remain untouched. Closure is blocked only by unresolved lane-related stash.

## 10. Keep Path

When user selects keep:

- make no Git mutation
- report verified branch or detached state
- report workspace path and mechanism
- report commits and uncommitted state
- report next authorized action needed

## 11. Discard Path

Discard is destructive. Before action:

1. list exact commits, files, branch, and worktree affected
2. confirm nothing must be preserved
3. obtain explicit destructive confirmation
4. use native cleanup for native-managed workspace
5. use Git branch and worktree commands only for manually managed workspace

Never recursively delete worktree directory directly. Never discard unrelated changes or stashes.

## 12. Worktree Cleanup

Cleanup occurs only after selected Git disposition is complete, the lane main
agent is retired, no live process owns the worktree, and exact cleanup
authorization exists through the active plan or explicit user authorization.

- native-created workspace: use native cleanup tool
- manually created worktree: use `git worktree remove <path>` after clean-state confirmation
- stale metadata: use `git worktree prune` only after verifying entry is genuinely stale and authorization exists

Do not remove current active worktree, dirty worktree, unpushed required commits, or workspace needed for open reconciliation.

## 13. Final Closure Report

Report:

- selected action
- branch, base, remote, and worktree
- commit SHAs before and after action
- commit, push, pull-request, merge, or keep result
- pre-action and post-action verification commands and results
- stash reconciliation when applicable
- cleanup performed or intentionally deferred
- remaining risks and blockers
- final result: `closed`, `kept`, or `blocked`

## Stop Conditions

Stop when:

- verified state no longer matches repository
- required implementation remains
- unrelated dirty state blocks safe action
- base worktree is dirty
- branch is checked out elsewhere unexpectedly
- fast-forward is impossible
- conflict resolution needs semantic choice
- detached HEAD lacks approved branch destination
- network, credentials, or repository policy blocks selected action
- lane-related stash remains unresolved
- overlapping file lacks approved disposition
- destructive confirmation is missing

## Red Flags

- automatically merging or pushing after verification
- assuming base branch is `main`
- assuming remote is `origin`
- checking out base inside lane worktree without topology inspection
- pushing base when pull-request path was selected
- using stash to hide dirty state
- inferring a file is superseded
- dropping a stash or running `git clean` before per-file disposition approval
- deleting worktree directory directly
- cleaning native-managed workspace with manual Git commands
- treating publication as branch finishing
- skipping post-integration verification

## Integration

- `skill-using-git-worktrees` provides workspace identity and creation mechanism.
- `skill-executing-plans` completes implementation tasks.
- `skill-verification-before-completion` produces required `verified` handoff.
- publication remains owned by repository publication workflow.
