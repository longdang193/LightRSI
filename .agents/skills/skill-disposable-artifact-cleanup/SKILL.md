---
name: skill-disposable-artifact-cleanup
description: Use when a completed or interrupted workflow leaves task-owned disposable files or directories that need safe audit or cleanup.
required_reads:
- docs/operating_system/rules/command-execution-rule.md
distribution_tier: starter_kit
---

# Disposable Artifact Cleanup

## Role

Audit and remove disposable artifacts created by the current task.

This skill owns candidate validation, retention checks, exact-path cleanup,
and post-cleanup inspection. It does not own Git disposition, branches,
worktrees, stashes, executor runtime state, publication, or persistent project
knowledge.

## Lifecycle

- Audit mode may run during execution.
- Cleanup requires the producing workflow to have finished using the artifact.
- Verification decides whether an artifact is still needed for proof, debug,
  recovery, or handoff.
- Cleanup runs before the final `verified` snapshot, then affected proof runs
  again.
- Verification, not this skill, emits the final `verified` result.

## Ownership Proof

A path is eligible only when all applicable checks establish:

1. exact normalized absolute path
2. producing task or tool
3. path recorded in current task-local state or a validated handoff
4. workflow no longer needs the path
5. no active verification, debugging, recovery, or handoff depends on it
6. no user-created, persistent, credential, backup, database, or upload data
7. repository path is not tracked or staged
8. cleanup scope is exactly the recorded file or task-owned directory

Filename similarity, age, location, generated appearance, or Git ignore status
does not prove ownership. Missing or stale ownership evidence means preserve.

Do not persist machine-local absolute paths in Git-tracked plans merely for
cleanup. If task-local state or validated handoff no longer contains ownership
evidence, preserve the artifact.

## Candidate Sources

Repository candidates:

- exact paths declared or resolved by the producing workflow
- Git-reported untracked paths, treated as review candidates only until
  producer ownership is proven
- exact producer-owned ignored paths

External temporary candidates:

- exact paths declared by the producing workflow or validated handoff
- no discovery scan of `/tmp`, `C:\tmp`, `%TEMP%`, or `$TMPDIR`

Never sweep, age-sweep, pattern-sweep, enumerate-for-deletion, or recursively
clean a shared temporary root.

Prefer one task-scoped directory under the platform temporary root. A directory
name alone is not ownership proof.

## Protected

Preserve:

- unknown or unrelated untracked paths
- tracked and staged files
- user data and persistent state
- credentials, environment files, databases, backups, and uploads
- active verification, debugging, recovery, or handoff evidence
- nested repositories
- paths containing symlinks, junctions, or other reparse points unless their
  safety is explicitly established
- generated output still needed for validation, diff inspection, publication,
  copying, debugging, or completion evidence
- executor-local runtime state without an owning cleanup procedure

## Audit Mode

Do not mutate files. Report for each candidate:

- exact normalized path
- producing task or tool
- purpose
- ownership evidence
- lifecycle and retention dependency
- repository or external classification
- result: eligible, preserve, or blocked

Do not turn a Git-reported untracked path into an eligible candidate without
producer evidence.

## Cleanup Mode

Cleanup requires explicit authorization for the named task-owned candidates or
an approved task that names those candidates. Recursive delete or move still
follows `command-execution-rule.md`.

Before removal:

1. re-resolve each exact path
2. confirm ownership and retention checks still pass
3. confirm scope did not broaden
4. block symlinks, junctions, and reparse points unless explicitly handled

Remove only approved exact files or task-owned directories. Do not call
`git clean`, delete a repository root, or delete a shared temporary root.

After removal, report removed, preserved, and blocked paths. Inspect repository
state and rerun affected verification before the final verified snapshot.

## Producer Contract

When creating external temporary output, retain its exact normalized absolute
path in current task-local state or a validated handoff. Do not put machine-
local paths in Git-tracked plans. Omitted paths remain preserved.

## Integration

- `skill-executing-plans` may invoke this skill in Audit Mode only.
- `skill-verification-before-completion` identifies retention dependencies and
  reruns affected proof; it does not perform deletion.
- `skill-finishing-a-development-branch` owns Git disposition and Git-managed
  branch, worktree, and stash cleanup after `verified`.
