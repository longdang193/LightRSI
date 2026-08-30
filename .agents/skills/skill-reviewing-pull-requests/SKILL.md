---
name: skill-reviewing-pull-requests
description: Use when an independent agent must inspect a pull request and return head-bound technical review evidence.
required_reads: []
distribution_tier: starter_kit
---

# Reviewing Pull Requests

## Role

Inspect one pull request independently and return a technical verdict bound to
the exact reviewed head. This skill owns PR inspection and review evidence. It
does not implement fixes, merge, delete branches, remove worktrees, or decide
task acceptance.

## Inputs

Require repository, PR number, base ref, head ref, expected head SHA, approved
scope, preserved invariants, and required checks. If base or head identity is
missing or ambiguous, return `BLOCKED`.

## Review Contract

Before inspection, verify repository identity, PR number, base ref and SHA when
material, head ref and SHA, and current PR head. If current head differs from
expected head, reject stale evidence and return `BLOCKED` until review reruns.

Inspect the exact diff, changed-file scope, tests, required checks, security or
data-loss risks, and approved deviations. Do not infer approval from CI alone.
Record known limits and unverified claims.

Return one Project OS verdict:

- `PASS`: no blocking finding within approved scope
- `FAIL`: finding requires correction or rerun
- `BLOCKED`: identity, access, required proof, or review prerequisite is unavailable

Evidence must include repository, PR number, base ref and SHA when material,
head ref and SHA, verdict, checks inspected, findings, approved deviations,
and known limits. New commits invalidate prior review evidence.

## GitHub Review State

Project OS review is separate from GitHub review state. Submit GitHub
`APPROVE` only when reviewer identity is eligible, differs from PR author when
required, and repository rules allow the approval to count. Otherwise submit
`COMMENT` or no GitHub action. Required distinct-identity approval returns
`BLOCKED`; do not create another account to satisfy this skill.

## Boundaries

Use `skill-requesting-code-review` for dispatch and
`skill-receiving-code-review` for feedback evaluation. Do not mutate the PR
branch, push commits, merge, delete branches, or remove worktrees. A review
does not complete a task or update the active plan ledger.

## Output

Return the structured review evidence, exact reviewed head SHA, Project OS
verdict, optional GitHub review action result, and rerun condition when head
changes.
