---
name: verification-closeout-prompt
description: Verify implementation completion and hand verified work to authorized branch finishing.
distribution_tier: starter_kit
---
# Verification And Closure Handoff Prompt

Compare current repository state with approved scope, required plan tasks, acceptance criteria, and preserved invariants. Run fresh focused and scope-required broad checks. Inspect changed files, generated drift, and unresolved required work.

Return exactly one result:

- `verified`: implementation and evidence complete; include exact workspace, branch or detached state, HEAD, working-tree state, commands, results, risks, and handoff to `skill-finishing-a-development-branch`
- `incomplete`: required implementation remains; name exact item and smallest fix
- `blocked`: user decision, access, external state, or reconciliation is required; name exact blocker

Do not commit, pull, rebase, merge, push, create pull request, publish, delete branch, or remove worktree from verification step. Verification makes closure actions eligible; user authorization selects action.
