---
name: skill-code-standards
description: Use when creating or modifying source code where consistency, type safety, naming, error handling, dependency discipline, or maintainability standards need explicit guidance.
required_reads: []
distribution_tier: starter_kit
---
# Code Standards

## Role

Apply reusable code-quality judgment across programming languages. Hard invariants remain owned by language rules, compiler settings, formatters, linters, schemas, tests, and CI.

This skill does not replace language-specific tooling or repository conventions. Inspect existing code and configuration before choosing syntax, commands, thresholds, or naming style.

## When To Use

Use for source-code creation or modification when work needs explicit standards for:

- types and data shapes
- names and public interfaces
- function and module boundaries
- error handling and resource cleanup
- dependency selection
- comments and documentation
- testability and verification

Skip when a formatter, generated-code owner, or narrow mechanical edit fully determines result.

## Ownership Boundaries

- rules own hard invariants
- formatters and linters own mechanical style
- compilers and type checkers own executable type constraints
- schemas and validators own data contracts
- tests own behavioral proof
- repository code owns established local patterns
- this skill owns implementation judgment between those controls

When repository convention conflicts with generic advice, preserve repository convention unless it violates correctness, security, data safety, or an explicit requirement.

## Standards Method

### 1. Read Existing Contracts

When compatibility depends on an unfamiliar external GitHub repository, resolve
an external-repository evidence capability through
`docs/operating_system/tooling/runtime-tool-resolution.md`. Pinned source
remains authoritative.

Before editing:

1. inspect applicable repository instructions
2. inspect adjacent code and tests
3. identify configured formatter, linter, compiler, type checker, and test runner
4. trace callers and consumers before changing a shared interface
5. distinguish canonical source from generated output

Do not invent a new standard when repository already has one.

### 2. Type And Data Safety

- Prefer precise types where they remove ambiguity.
- Model known shapes with native records, structs, data classes, typed mappings, tagged unions, enums, protocols, interfaces, or generics supported by language.
- Avoid untyped escape hatches unless boundary genuinely lacks stable shape.
- Narrow suppressions to exact diagnostic and explain non-obvious reason.
- Keep nullability, optional values, units, identity, and error states explicit.
- Validate untrusted input at trust boundary; do not scatter duplicate validation through internal functions.
- Preserve runtime behavior when task is type-only cleanup.

Use project-configured type checker. Do not prescribe a new checker or dependency merely to satisfy this skill.

### 3. Names And Interfaces

- Follow language and repository naming conventions.
- Use descriptive names that expose domain meaning, not implementation trivia.
- Name booleans as predicates where language convention supports it.
- Keep equivalent concepts named consistently across modules, schemas, tests, configuration, and docs.
- Avoid abbreviations unless standard in domain or repository.
- Keep public interfaces small, explicit, and stable unless change is approved.
- Prefer one canonical term over aliases that require translation.

English-only naming is not a universal invariant. Follow repository language policy and interoperability needs.

### 4. Functions And Modules

- Give each function one behavioral responsibility.
- Prefer early exits over deep nesting when behavior stays clear.
- Keep parameter lists understandable; group values only when they form a real domain concept.
- Extract shared logic only after active duplication or a shared invariant is demonstrated.
- Keep side effects visible and near owning boundary.
- Separate parsing, validation, transformation, persistence, and presentation when mixing them obscures failure behavior.
- Keep module boundaries aligned with ownership and change patterns, not arbitrary line counts.

Do not enforce universal limits such as maximum function length or parameter count. Complexity and cohesion matter more than fixed numbers.

### 5. Constants And Configuration

- Name values whose meaning, unit, policy, or reuse is not obvious.
- Keep truly local obvious literals local.
- Shared defaults and contracts need one canonical owner.
- Runtime-varying behavior belongs in existing configuration layer.
- Stable implementation details do not need configuration.
- Equivalent flows must consume same default rather than copy it.

### 6. Error Handling And Cleanup

- Never swallow errors.
- Catch specific failures only when adding context, translating at a boundary, retrying safely, providing an approved fallback, or performing cleanup.
- Preserve original cause when wrapping errors.
- Include actionable context without leaking secrets or sensitive data.
- Use native cleanup constructs for files, locks, transactions, processes, network connections, and temporary resources.
- Do not log and rethrow at every layer; choose one useful ownership boundary.
- Make partial failure, retries, idempotency, and rollback explicit where data or external effects are involved.

Logging is conditional, not mandatory for every catch. Some failures should propagate directly.

### 7. Comments And Documentation

- Prefer clear code and names over explanatory narration.
- Comment why a surprising constraint, workaround, safety control, or tradeoff exists.
- Remove comments that restate code or describe behavior no longer present.
- Update public API docs, schemas, examples, and operational docs when contract changes.
- Do not create documentation layer for behavior already expressed clearly by executable truth.

### 8. Dependencies And Native Features

Select first option that fully meets requirement:

1. no new mechanism
2. existing repository helper or pattern
3. standard library
4. native platform or language feature
5. already-installed dependency
6. minimum custom code

Add dependency only when maintained capability materially beats small local implementation and operational cost is justified.

### 9. Verification

For non-trivial behavior:

1. add or update smallest focused regression check
2. run configured formatter or format check for changed files
3. run configured linter, compiler, or type checker for affected scope
4. run targeted tests
5. run broader validation required by repository before completion

Do not claim quality from review alone. Fresh executable evidence owns completion.

## Review Checklist

- behavior and compatibility preserved unless explicitly changed
- trust-boundary input validated once
- types and data shapes express meaningful constraints
- equivalent concepts use equivalent names and structure
- shared defaults and invariants have one owner
- errors retain cause and useful context
- cleanup prevents resource or data loss
- no inactive abstraction, dependency, config, or duplicate helper added
- comments explain reasons rather than syntax
- focused verification covers non-trivial behavior

## Common Mistakes

- applying one language naming convention everywhere
- introducing fixed function-length or parameter-count rules without evidence
- requiring logging in every exception handler
- replacing compiler or linter configuration with prose
- adding a wrapper around standard library for hypothetical portability
- broad type suppression instead of modeling boundary
- refactoring unrelated code while making a focused change
- duplicating hard invariants already owned by rules or validators

## Guardrails

- Preserve security, accessibility, data safety, and explicit requirements.
- For material front-end work, follow `docs/operating_system/rules/frontend-ui-rule.md` and use the selected applicable design skill.
- For material backend behavior changes, follow `docs/operating_system/rules/backend-verification-rule.md` and use `skill-backend-verification` for direct proof independent of consumers.
- For explicit performance requirements or measured regressions, use `skill-performance-optimization`; do not invent universal budgets or optimize without comparable evidence.
- For frontend-to-backend contract wiring, follow `docs/operating_system/rules/frontend-backend-integration-rule.md` and use `skill-full-stack-integration`; colocated notes may map contracts to UI states but must not duplicate canonical transport schemas.
- Avoid speculative abstraction and configuration.
- Prefer smallest root-cause change in shared owner.
- Generated files follow generator; edit canonical source.
- Language-specific commands belong in repository config, rules, or language-focused skills, not this general skill.
