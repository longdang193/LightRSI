---
name: skill-refactoring-assessment
description: Use when assessing what code, configuration, tests, schemas, documentation, dependencies, infrastructure, or module boundaries should be refactored before specification, planning, or implementation.
required_reads: []
distribution_tier: starter_kit
---
# Refactoring Assessment

## Role

Determine why refactoring is justified, what bounded changes deserve priority, and which directly related skill should own next stage.

This skill produces an evidence-backed refactor assessment. It does not edit code, draft a specification, write an implementation plan, execute a backlog, perform final verification, or finish a Git branch.

## Scope Contract

Establish before assessment:

- repo or module boundaries
- key files and folders
- constraints and preserved behavior
- non-goals
- available evidence and tool freshness

If scope is missing, infer smallest useful scope from request and repository evidence. State material assumptions.

## Conditional References

Read only references needed for current assessment:

- `docs/operating_system/tooling/runtime-tool-resolution.md` when a code, flow, impact, or external-repository capability is needed beyond native source inspection
- `docs/operating_system/rules/audit-evidence-mandate-rule.md` when user requests an audit or evidence suggests a qualifying incident
- `docs/operating_system/templates/audit-report-with-evidence-template.md` only when a formal audit bundle is required
- `skill-brainstorming` when desired behavior or design direction remains unclear
- `skill-spec-drafting` when behavior, interfaces, schemas, defaults, compatibility, or invariants require a decision contract
- `skill-writing-plans` when design is settled but execution needs ordered tasks
- `skill-test-driven-development` before a bounded behavior-preserving patch
- `skill-executing-plans` only after a plan is approved
- `skill-dispatching-parallel-agents` only when selected actions have disjoint write ownership
- `skill-verification-before-completion` after implementation
- `skill-finishing-a-development-branch` only after fresh verification and explicit Git authorization

Formal audit ceremony is conditional. Ordinary refactor assessment requires traceable evidence, not an audit bundle.

## Questions

### Why Refactor?

Identify demonstrated cost or risk:

- correctness defects or risky edge cases
- maintenance drag, change amplification, or unclear ownership
- duplicated behavior or configuration drift
- inconsistent interfaces, schemas, defaults, naming, or lifecycle rules
- obsolete code, assumptions, dependencies, documentation, or infrastructure
- weak tests or missing executable contracts
- performance or resource waste supported by measurements or credible evidence

Do not justify refactoring with aesthetics alone. Link each rationale to repository evidence and affected behavior, consumer, or maintenance outcome.

Use formal `audit-report-with-evidence` only for an explicit audit request or trigger defined by `audit-evidence-mandate-rule.md`.

### What Should Be Refactored?

Assess relevant debt surfaces: code, architecture and module boundaries, tests and fixtures, dependencies, configuration and schemas, documentation, infrastructure, and automation.

Map equivalent concepts and current implementations. Detect:

- **drift:** equivalent concepts have diverged
- **contradiction:** names, rules, defaults, schemas, or behavior conflict
- **obsolete:** dead branches, stale helpers, deprecated assumptions, unused fields, config, dependencies, docs, or scripts
- **hidden duplication:** different-looking logic serves same purpose
- **missing contract:** shared behavior belongs in a type, schema, enum, fixture, constraint, validator, or test
- **edge case:** inconsistency can create bugs, invalid artifacts, data loss, security risk, accessibility failure, or bad UX

For each finding, identify exact evidence, impacted files or symbols, behavior and invariants to preserve, smallest normalization target, symmetry model, and recommendation: `keep`, `simplify`, `merge`, `delete`, `replace`, `grandfather`, or `patch`.

Do not preserve complexity because another document references it. Trace active consumers first.

### How Should It Proceed?

Classify each action as `high`, `medium`, or `low` risk. Avoid false-precision scores.

For each action provide:

- action ID and rationale
- impacted files or symbols
- preserved invariants
- required tests or contracts
- dependency ordering
- compatibility or migration needs
- deprecation or removal path when applicable
- rollback or containment for medium- or high-risk work

Route rather than perform next stage:

| Condition | Next owner |
|---|---|
| Small, bounded, behavior-preserving patch | `skill-test-driven-development`, then direct implementation |
| Unresolved behavior, interface, schema, default, compatibility, or invariant | `skill-spec-drafting` |
| Settled design with multi-step execution | `skill-writing-plans` |
| Approved implementation plan | `skill-executing-plans` |
| Independent actions with disjoint write ownership | `skill-dispatching-parallel-agents` |
| Completed implementation | `skill-verification-before-completion` |
| Verified work needing authorized Git disposition | `skill-finishing-a-development-branch` |

Use `skill-brainstorming` before specification when desired behavior remains unresolved.

### How Will It Be Verified?

Define validation intent without claiming implementation proof:

- focused tests for preserved behavior and regressions
- schema, type, lint, static, or contract checks where they own executable truth
- symmetry checks across equivalent cases
- negative tests for risky edge cases
- migration or compatibility checks
- performance measurements only when optimization is part of rationale
- broader verification required after implementation

Prefer existing tests and validators. Recommend new executable contract only when no current owner can enforce invariant.

## Evidence Capability

Use smallest available capability that answers question: native search, file
inspection, diffs, and tests for bounded evidence; symbol, discovery, flow, or
impact capabilities only when the question requires them. Resolve selection
through `docs/operating_system/tooling/runtime-tool-resolution.md`.

Treat stale or advisory analysis as non-authoritative. Source code,
configuration, tests, schemas, validators, and current runtime evidence remain
authoritative.

## Assessment Method

1. Define scope, constraints, non-goals, and preserved behavior.
2. Collect source-first evidence and identify active consumers.
3. Map equivalent concepts across scoped surfaces.
4. Group symptoms under root-cause findings.
5. Define SSOT normalization target, symmetry model, and invariants.
6. Propose bounded actions ordered by risk and dependency.
7. Define validation intent and migration safety.
8. Select exactly one eligible next action and route it to owning skill.

## Output Contract

### A) Executive Refactor Thesis

State why change is justified, proposed SSOT, symmetry target, and invariants that must not regress.

### B) Findings Matrix

| ID | Category | Evidence | Impact | Preserve | Recommendation |
|---|---|---|---|---|---|

Use categories: `drift`, `contradiction`, `obsolete`, `hidden duplication`, `missing contract`, or `edge case`.

### C) Prioritized Refactor Actions

For each action include ID, rationale, impacted files, risk, required tests or contracts, dependency order, migration needs, and rollback or containment where applicable.

### D) Validation Plan

List executable checks needed after implementation. Distinguish focused regression proof from broader completion verification.

### E) Selected Next Action

Select one action. State:

- what to refactor or patch next
- why it is eligible now
- owning next-stage skill
- why alternatives are not yet eligible

End here. Do not execute action or expand full backlog into a specification or implementation plan.

## Guardrails

- Rules own hard invariants; skills own reusable methods.
- Code, configuration, schemas, tests, and validators own executable truth.
- Prefer deletion, native capability, and existing owners over new abstraction.
- Do not create a new orchestration, registry, lifecycle, or metadata layer.
- Do not mix assessment with implementation.
- Do not require mandatory reads that are only occasionally useful.
- Do not recommend broad rewrites when bounded normalization preserves behavior.
- Do not select multiple next actions.
- End with what to refactor or patch next, not an executed backlog.
