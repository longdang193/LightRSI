---
name: skill-using-git-worktrees
description: Use when isolated workspaces materially reduce risk for feature, parallel, or high-impact planned work.
required_reads: []
distribution_tier: starter_kit
---
# Using Git Worktrees

## Role

Create or reuse an isolated workspace when isolation is selected. Prefer platform-native worktree support. Use manual Git worktrees only when native support is unavailable.

This skill owns workspace isolation and identity. It does not own implementation, commits, branch finishing, merge decisions, push, or cleanup after completion.

## When To Use

Use isolation when:

- work is high-impact or difficult to reverse
- current checkout contains unrelated changes
- multiple independent lanes need disjoint write ownership
- branch comparison or safe integration benefits from separate workspaces

For a write-capable Herdr main-agent lane, isolation is mandatory even when
ordinary local work could safely reuse the current checkout.

Skip isolation for small, local, reversible work when current checkout is safe and user has not requested a worktree.

## 1. Detect Current Workspace

Before creating anything, inspect:

```powershell
git rev-parse --show-toplevel
git rev-parse --git-dir
git rev-parse --git-common-dir
git rev-parse --show-superproject-working-tree
git branch --show-current
git status --short --branch
git worktree list --porcelain
```

Classify current state:

- primary checkout
- linked worktree on named branch
- linked worktree at detached HEAD
- submodule rather than worktree
- externally managed isolated workspace

If already in suitable isolated workspace, reuse it. Do not create nested worktree.

## 2. Obtain Isolation Consent

Use an explicit approved-plan lane grant, user instruction, or repository
instruction when available. Otherwise ask before creating worktree. A plan
grant applies only to the exact named repository, branch, worktree, and lane.

Worktree creation may create branch and filesystem state. Do not create it merely because skill exists.

## 3. Choose Creation Mechanism

Order:

1. platform-native worktree tool
2. existing repository worktree procedure
3. manual `git worktree add` fallback

Do not use manual Git fallback when native tool owns workspace lifecycle.

## 4. Choose Location

For manual project-local worktrees:

1. honor explicit configured location
2. reuse existing `.worktrees/` or `worktrees/`
3. otherwise prefer `.worktrees/`

Verify location is ignored:

```powershell
git check-ignore -q .worktrees
git check-ignore -q worktrees
```

If selected directory is not ignored:

1. propose smallest `.gitignore` change
2. apply only with authorization when required
3. verify `git check-ignore`
4. do not commit automatically

Commit remains separate explicitly authorized action.

## 5. Create Manual Worktree

Only when native support is unavailable and creation is authorized:

```powershell
git worktree add <path> -b <lane-branch>
```

Before creation confirm:

- path is inside intended location
- branch name does not already exist unexpectedly
- target path does not contain user files
- base commit or branch is correct

Do not force, delete, prune, reset, or overwrite to make creation succeed.

## 6. Establish Workspace Identity

Record:

- absolute worktree path
- creation mechanism: native or manual
- branch name or detached HEAD
- base branch and base commit when known
- current HEAD
- repository remote when relevant
- pre-existing working-tree changes

This identity is passed to `skill-executing-plans`, then verification and branch finishing.

## 7. Prepare Project

Inspect repository-native setup instructions. Run only setup required for planned work.

Do not install dependencies, alter lockfiles, or change environment configuration without scope and authorization.

## 8. Verify Baseline

Run smallest baseline checks needed to distinguish pre-existing failures from introduced regressions.

If baseline fails:

- record exact command and failure
- classify known pre-existing versus unexplained
- ask before continuing when failure undermines planned verification

Do not claim clean baseline from partial or old output.

## Handoff

Provide execution skill:

- workspace path and mechanism
- branch or detached state
- base branch and commit
- current HEAD
- baseline commands and results
- preserved unrelated changes
- restrictions on commit, push, merge, and cleanup

For a write-capable Herdr lane, also record launched process cwd and confirm it
matches the exact worktree before writes begin.

## Cleanup Boundary

This skill does not remove worktree. Cleanup requires confirmation that no live
main-agent process owns the path.

`skill-finishing-a-development-branch` owns cleanup after verified Git disposition and explicit authorization. It must use native cleanup for native-created workspace and `git worktree remove` only for manually created worktree.

## Stop Conditions

Stop when:

- target path contains user files
- selected branch is already checked out elsewhere unexpectedly
- worktree metadata is inconsistent
- directory is not ignored and authorization to change `.gitignore` is unavailable
- baseline failure prevents trustworthy execution
- creation requires force, reset, deletion, or destructive recovery

## Red Flags

- requiring worktree for every task
- creating nested worktree
- confusing submodule with linked worktree
- using manual Git when native tool owns workspace
- committing `.gitignore` automatically
- installing dependencies automatically
- creating branch from wrong base
- deleting worktree directory directly
- cleaning worktree before verified branch disposition
