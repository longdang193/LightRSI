---
name: skill-spec-drafting
description: Use when a problem, approved direction, or diagnosed defect needs a precise behavioral and design specification before implementation planning.
distribution_tier: starter_kit
---
# Spec Drafting

## Role

Turn an understood problem, approved direction, or diagnosed root cause into an implementation-independent specification that explains why change is needed, what behavior is required, and how design-level boundaries satisfy it.

This skill owns specification reasoning and artifact creation. It does not explore unresolved options indefinitely, write implementation tasks, execute code, or claim implementation complete.

## When To Use

Use when:

- behavior, interface, data contract, state transition, migration, or invariant must be defined before implementation
- brainstorming has produced an approved direction needing precise contract
- debugging has identified root cause and required corrected behavior must be specified
- cross-cutting or expensive-to-reverse work needs agreement before planning

Skip when change is local, reversible, design-clear, and safely executable without specification.

## Inputs

Possible inputs include:

- user request, problem statement, or feature idea
- approved brainstorming recommendation
- debugging reproduction, root cause, and regression boundary
- existing code, tests, configuration, schemas, interfaces, and maintained docs
- repository governance or publication constraints when in scope
- external system state from relevant native tools or MCP exposed by active executor; under DeepAgents, use validated Codex handoff facts

Treat brainstorming as exploratory evidence until accepted decisions are restated in specification. Treat debugging symptom separately from verified root cause.

## Artifact Boundaries

Specification owns:

- problem and desired outcome
- required observable behavior
- scope and non-goals
- interfaces, data contracts, state transitions, defaults, errors, and compatibility
- design decisions and ownership boundaries
- invariants, edge cases, acceptance criteria, and validation intent

Implementation plan owns exact files, task order, commands, dependencies, rollout steps, and execution waves.

## Draft To Final Lifecycle

- Use `docs/operating_system/templates/draft-specification-template.md` when behavior, UI intent, or state transitions still need prototype validation.
- Save draft under final `docs/superpowers/specs/*.md` path with `template_id: draft-specification` and `status: proposed`.
- Keep assumptions, open questions, prototype reference, and findings in same file while design remains unsettled.
- After explicit approval, complete every explicitly applicable post-approval input before promotion. Keep the draft `status: proposed` while required Design Export or other approved inputs remain incomplete. Then replace draft content in place with `docs/operating_system/templates/detailed-specification-template.md`, set `template_id: detailed-specification` and `status: active`, and preserve accepted prototype evidence and approved deferrals.
- Do not keep parallel permanent draft/final files. Git history preserves draft state.
- For material backend behavior, define verification claims using `docs/operating_system/rules/backend-verification-rule.md`; frontend proof never replaces backend proof.
- Spec status is `proposed` while behavior or design remains unsettled, `active` for the approved contract under implementation, `completed` after implementation is verified against that contract, and `superseded` when a newer specification replaces it. Revise only `proposed` or `active` specifications; use completed or superseded specifications as historical baseline evidence for new work.

### Promotion Mapping

Promotion is a semantic rewrite, not a heading-only rename. Preserve material draft evidence in the detailed specification:

| Draft evidence | Detailed destination |
|---|---|
| verified facts | `Current State and Evidence` |
| accepted behavior | `Required Outcomes` or `Requirements and Behavioral Contract` |
| rejected behavior | `Constraints and Alternatives` |
| resolved questions | `Design Decisions` |
| confirmed assumptions | `Current State and Evidence` or `Design Analysis` |
| approved deferrals | `Design Analysis` or `Design Decisions`, with approval, owner, rationale, and trigger |
| prototype findings, UX approval, and Design Export evidence | `Prototype and Validation Evidence` |

Unresolved questions that change required behavior or design block `status: active`. Non-blocking deferrals require durable approval evidence and an owner or trigger.

## Evidence Gathering

### Tool Selection

- State minimum capability and required evidence before selecting a tool.
- Prefer native tools for direct file inspection, local search, configuration, tests, and repository state.
- Resolve unmet code, external-service, database, model, report, or platform capabilities through `docs/operating_system/tooling/runtime-tool-resolution.md`.
- Under DeepAgents, Codex supplies validated handoff facts within the existing permission boundary.
- Do not query every tool by default. Source and tests remain authoritative; unavailable optional tools never replace mandatory evidence.

### Evidence Discipline

For material claims, capture:

| Question | Evidence | Source | Confidence | Specification implication |
|---|---|---|---|---|
| <what must be known> | <observed fact> | <file, test, tool, or system> | high / medium / low | <decision or open question> |

Separate:

- verified fact
- assumption
- unresolved question
- design implication

Do not paste raw tool output into specification. Convert evidence into concise current-state facts, decisions, constraints, and proof targets.

## Specification Process

### 1. Establish Problem And Goal

Define:

- current problem or opportunity
- affected users, systems, or maintainers
- evidence problem exists
- consequence of no change
- desired outcome
- observable success

If problem framing or alternatives remain unclear, return to `skill-brainstorming`. If defect root cause remains unclear, use `skill-systematic-debugging`.

### 2. Inspect Current State And Baseline

Inspect smallest evidence set needed to understand:

- current behavior and ownership
- requested behavior compared with current behavior
- existing interfaces and contracts
- working and failing paths
- consumers and dependencies
- canonical and generated surfaces
- affected maintained contracts, specifications, and ownership boundaries
- applicable native or existing repository capabilities
- constraints imposed by compatibility, security, accessibility, performance, publication, or external systems
- for material front-end scope, guidance from the selected applicable design skill under `docs/operating_system/rules/frontend-ui-rule.md`, plus explicit responsive, theme, accessibility, and affected-state acceptance criteria

Do not design from guessed repository behavior.

When modifying existing behavior, inspect current source, tests, configuration,
schemas, and maintained documentation before defining the post-change contract.
Reconcile affected scope and ownership in this specification, and capture only
concise baseline/change context rather than duplicating evidence or normative
requirements.

### 3. Define Scope And Non-Goals

State:

- included behavior
- affected actors and boundaries
- intentionally unchanged behavior
- explicit non-goals
- admissible cases
- compatibility expectations

Keep one specification coherent. Split unrelated behavior into separate specifications rather than creating one umbrella document.

### 4. Define Required Outcomes

Each required outcome must be observable:

```markdown
### Outcome: <name>

- affected actor or system:
- required result:
- success condition:
```

Avoid vague outcomes such as “improve architecture” or “support future extensibility.”

### 5. Define Requirements And Behavioral Contract

For each material requirement define:

```markdown
### Requirement: <name>

- trigger or actor:
- preconditions:
- required behavior:
- output or state change:
- failure behavior:
- observable acceptance:
```

When relevant also define:

- inputs and outputs
- identity and data grain
- schemas and interfaces
- state transitions
- defaults and validation
- errors, retries, idempotency, ordering, cancellation, and fallback
- boundary conversions

Two implementers should not derive conflicting external behavior from same specification.

### 6. Resolve Design Decisions

For every material design choice record:

```markdown
### Decision: <name>

- context:
- selected approach:
- rationale:
- alternatives considered:
- accepted trade-offs:
- affected owners and boundaries:
```

Prefer existing repository mechanisms and native capabilities when they satisfy requirement. Preserve special cases only when semantic difference is explicit and necessary.

Design-level how belongs here. File-by-file implementation sequencing does not.

### 7. Define Invariants And Edge Cases

State what must always remain true.

Cover applicable cases:

- empty and minimal input
- normal and large input
- duplicate, missing, malformed, or unsupported data
- retry, cancellation, timeout, partial failure, and concurrency
- migration and mixed-version state
- generated-source consistency
- security and accessibility boundaries

Equivalent cases should use equivalent rules and one authoritative owner.

### 8. Define Compatibility, Migration, And Risk

When existing behavior changes, specify:

- old and new behavior
- compatibility boundary
- migration or backfill requirement
- rollout and rollback behavior
- deprecation or consumer impact
- material risks and mitigations

Do not defer required migration decisions to implementation plan.

### 9. Define Acceptance And Validation

For every required outcome and behavior provide observable acceptance:

```markdown
### Acceptance Criterion: <claim>

- setup or precondition:
- action:
- expected result:
- failure condition:
- proof method:
- expected evidence:
```

Specification owns proof intent. Implementation plan later owns exact commands and execution order.

### 10. Resolve Open Questions

Before approval:

- answer questions that change required behavior or design
- mark approved deferrals explicitly
- remove assumptions already disproved by evidence
- ensure no unresolved choice is hidden as implementation detail

### 11. Write Canonical Artifact

Only after reasoning is complete:

1. choose draft template only when prototype validation remains; otherwise use detailed template after behavior approval and all applicable post-approval inputs are complete
2. save once to `docs/superpowers/specs/YYYY-MM-DD-HH-MM-<topic>-spec.md`
3. use frontmatter satisfying `repo_config/planning_artifact_schema.yaml`
4. select truthful layer and targets
5. keep required sections non-empty
6. promote draft in place after approval rather than creating second file
7. run template and planning validators

Format records specification; it does not replace specification reasoning.

## Frontmatter

```yaml
---
layer: intent | operating_system | change
artifact_type: spec
status: proposed | active | completed | superseded
template_id: draft-specification | detailed-specification
name: <short-spec-name>
targets:
  - <canonical or affected path>
related_features:
  - <feature_id>
related_stages:
  - <stage_id>
---
```

Use only applicable optional metadata. Do not add metadata without active consumer.

## Review And Handoff

1. Present draft findings or detailed specification and unresolved approved deferrals.
2. Request explicit approval; when draft exists, resolve applicable post-approval inputs, then promote the same file to detailed active specification.
3. For cross-cutting, data-sensitive, operational, starter/public-sync, or expensive-to-reverse specifications, use `skill-plan-document-reviewer` before approval or planning handoff.
4. After detailed specification is active, hand off to `skill-writing-plans`.
5. `skill-executing-plans` starts only after executable plan or explicit approved task sequence exists.
6. `skill-verification-before-completion` later proves acceptance and completion criteria.
7. `skill-finishing-a-development-branch` owns authorized Git disposition after verified implementation.

## Red Flags

- starting with template headings before understanding problem
- treating feature idea as approved requirement
- treating symptom as root cause
- copying tool output instead of deriving specification facts
- defining implementation tasks in specification
- vague requirements without observable acceptance
- interfaces missing errors, defaults, or compatibility
- acceptance criteria disconnected from requirements
- speculative abstraction or custom behavior without need
- empty required sections or unresolved decisions hidden as “later”

## Related Skills

- `skill-brainstorming`: clarify problem, options, and recommendation.
- `skill-systematic-debugging`: establish reproducible symptom and root cause.
- `skill-plan-document-reviewer`: review specification correctness and readiness.
- `skill-writing-plans`: convert approved specification into executable tasks.
- `skill-executing-plans`: implement approved plan.
- `skill-verification-before-completion`: prove required behavior and completion.
- `skill-finishing-a-development-branch`: perform authorized Git closure.
