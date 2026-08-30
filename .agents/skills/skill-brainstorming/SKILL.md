---
name: skill-brainstorming
description: Use when exploring or defining non-trivial behavior before implementation.
distribution_tier: starter_kit
---
# Brainstorming Ideas Into Designs

<HARD-GATE>
Do NOT write code or implement anything before:
1. design is presented
2. user explicitly approves
</HARD-GATE>

## Role

This skill produces design artifacts only.

## Conditional References

- For unresolved material visual direction, interaction design, responsive behavior, or accessibility behavior, follow `docs/operating_system/rules/frontend-ui-rule.md`. If `impeccable` is explicitly selected, use it without also invoking overlapping design skills; otherwise preserve existing `ui-ux-pro-max` eligibility. Skip design-skill invocation for text-only design questions.
- Read `docs/operating_system/planning/planning-dispatch.md` to choose the smallest truthful planning tier.
- Read `docs/operating_system/templates/brainstorming-detailed-report-template.md` only when user requests a saved detailed brainstorming report.
- Read `docs/operating_system/governance/repo-governance.md` only when ownership or publication boundaries are in scope.
- If guidance conflicts with current source or tests, current executable truth wins.

## Artifact Boundaries

- Brainstorming owns problem exploration, options, trade-offs, recommendations, assumptions, and unresolved questions.
- When approved direction still needs prototype validation, hand off to `skill-spec-drafting` and `docs/operating_system/templates/draft-specification-template.md`; do not create a second permanent brainstorming or UI-intent artifact.
- Approved behavior, interfaces, decisions, and invariants belong in specifications.
- Exact tasks, sequencing, dependencies, and execution approach belong in implementation plans.

## Evidence Capability

State minimum capability and evidence before selecting a tool. Prefer native
source, tests, and repository inspection. Resolve unmet capabilities through
`docs/operating_system/tooling/runtime-tool-resolution.md`; optional tool
failure never blocks safe source-first design, but never replaces mandatory
evidence.

## Brainstorming Process

<MUST-DO>
1. Establish context:
   - confirm objective, affected users, constraints, and known evidence
   - inspect relevant source, tests, and maintained documentation
   - separate observed facts from assumptions
   - ask only questions that could change option selection
2. Define the core problem:
   - state one primary problem
   - distinguish root causes from symptoms
   - identify the consequence of leaving the problem unchanged
   - stop and route to specification or planning when the design is already settled
3. Generate two or three materially different viable options:
   - include the smallest viable change and status quo when credible
   - reject options that violate known invariants or duplicate existing mechanisms
   - do not create alternatives that differ only in naming or document structure
4. Compare every option using the same criteria:
   - expected impact
   - complexity and maintenance cost
   - compatibility with the existing system
   - risks and reversibility
   - evidence or validation still needed
   - conditions where the option fits best
5. Recommend one direction:
   - explain why it wins against the alternatives
   - state accepted trade-offs
   - list assumptions and unresolved questions
   - prefer consolidated behavior; preserve special cases only when operationally necessary
   - keep the recommendation design-level, without file-by-file implementation sequencing
6. Present the current situation, core problem, options, comparison, recommendation, unresolved questions, and immediate next decision.
7. Ask the user to approve, revise, or reject the recommendation.
8. Do not create a report by default. If the user requests a detailed report:
   - scaffold with `.\\scripts\\new_brainstorming_report.ps1 -ReportId <report_id>`
   - write report to `docs/superpowers/plans/brainstorming/<report_id>/report.md` using `docs/operating_system/templates/brainstorming-detailed-report-template.md`
   - link supporting files directly only when they materially help
9. Restate accepted recommendations in approved direct scope or a specification; do not treat the report as design truth.
10. Request approval before implementation planning when a plan is needed. Direct approved scope may proceed without a saved spec or plan when the change is local, reversible, and design-clear.
</MUST-DO>

## Output Paths

- specs -> `docs/superpowers/specs/`
- detailed brainstorming reports -> `docs/superpowers/plans/brainstorming/<report_id>/report.md`

## Guardrails

- Keep this skill focused on design decisions.
- Avoid duplicating lifecycle policy text already defined in templates/validators.
- Do not auto-generate detailed report unless user explicitly asks for it after brainstorming output.
