---
name: skill-plan-document-reviewer
description: Use when a specification or implementation plan needs correctness and readiness review before approval, handoff, or costly execution.
distribution_tier: starter_kit
---
# Plan Document Reviewer

## Role

Review specifications and implementation plans the way code review reviews changes: findings first, risk first, evidence first, no style policing.

This skill detects incorrect, contradictory, underspecified, unprovable, overengineered, or execution-unsafe proposals. It does not author replacement documents, implement code, or claim completed behavior passes.

## When To Use

Use when:

- a specification or plan will drive real implementation
- another session, agent, team, or worktree will execute it
- work is cross-cutting, operational, data-sensitive, starter/public-sync, or expensive to reverse
- a flawed contract, task order, or validation strategy would create hidden risk

Skip for tiny, local, reversible tasks with settled behavior and obvious proof.

## Ownership Boundaries

- `skill-spec-drafting` creates approved behavior, interfaces, decisions, invariants, acceptance criteria, and validation intent.
- `skill-writing-plans` creates exact tasks, files, commands, dependencies, and task-local verification.
- this skill identifies readiness defects in those artifacts without silently rewriting them
- `skill-using-git-worktrees` optionally establishes isolated workspace identity
- `skill-executing-plans` discovers implementation reality and performs task-local proof
- `skill-verification-before-completion` runs final proof and produces verified, incomplete, or blocked result
- `skill-finishing-a-development-branch` owns authorized Git disposition after verified result
- `skill-requesting-code-review` initiates implementation-diff review; `skill-receiving-code-review` evaluates returned findings; neither reviews proposed documents

## Conditional References

- Read target specification or plan in full.
- Read linked specification when reviewing a plan.
- Read `docs/operating_system/rules/git-tracked-coordination-rule.md` when the
  plan declares or requires Git-tracked coordination.
- Inspect named source, tests, configuration, schemas, and scripts needed to verify material claims.
- Read `references/technical-review-checklist.md` when proposal has substantial software, API, data, analytics, ML, optimization, storage, integration, platform, starter, or publication implications.
- Search configured MCP memory only when active executor exposes it and proposal resembles a known reusable failure mode; follow `docs/operating_system/rules/agent-memory-rule.md`.
- Read governance only when ownership or publication boundaries are in scope.

Do not load every reference for every review.

## Evidence Capability

Use native tools for direct evidence and local search. Resolve symbol,
discovery, flow, or impact needs through
`docs/operating_system/tooling/runtime-tool-resolution.md` only when the
question requires them. Source and tests remain authoritative.

## Review Process

### 1. Establish Claimed Contract

Identify:

- goal and success criteria
- approved decisions and preserved invariants
- non-goals and admissible cases
- named files, interfaces, schemas, and generated surfaces
- task order and dependencies for plans
- validation claims and proposed proof

### 2. Verify Repository Evidence

Check material claims against current repository state:

- named files and symbols exist
- proposed owners are canonical rather than generated
- referenced commands and scripts exist
- shared mechanisms are reused where semantics match
- native or installed capabilities are considered before custom replacements
- likely consumers and collateral files are represented

Do not raise native-capability findings without identifying concrete supported capability and repository evidence.

### 3. Review By Root Cause

Review these universal areas:

1. goal, scope, non-goals, and admissible cases
2. contracts, identity, defaults, errors, retries, and fallbacks
3. consistency between requirements, examples, decisions, acceptance criteria, and plan tasks
4. ownership, SSOT, generated boundaries, symmetry, and reuse
5. execution order, prerequisites, integration, rollback, and handoff risk
6. validation quality, reproducibility, edge cases, and failure proof
7. unnecessary complexity, custom infrastructure, and speculative abstraction

Use only applicable conditional profiles from technical checklist. Group repeated symptoms under one root-cause finding.

### 4. Check Artifact Symmetry

For a specification:

- approved behavior is explicit without implementation sequencing
- interfaces and invariants are consistent across admissible cases
- acceptance criteria are observable and validation intent is executable
- unresolved design is not disguised as future implementation detail

For an implementation plan:

- plan implements approved specification without duplicating design analysis
- every task names concrete owners, dependencies, edits, and task-local proof
- generated outputs derive from named canonical inputs
- execution approach, dependency order, and shared-write ownership are explicit when they affect safe execution
- final verification can prove every completion criterion
- when coordination is `git-tracked`, a fresh lead controller with no prior
  session can recover workspace, branch, base, active task, dependencies,
  ownership, proof, blockers, and next action from plan plus Git alone
- exactly one coordination owner writes plan state; active writers obey mode,
  dependency, and worktree constraints

### 5. Classify Findings

Use one severity system:

- `P1`: blocks safe or correct approval or execution
- `P2`: material correctness, maintainability, ownership, or validation weakness
- `P3`: optional simplification or hardening

Do not inflate style preferences into findings.

### 6. Decide Readiness

Use one verdict:

- `not ready`: one or more P1 findings remain
- `ready with required fixes`: no P1, but P2 fixes are required before execution
- `implementation-ready`: no unresolved P1 or required P2 findings

Verdict does not change artifact frontmatter status automatically.

## Finding Format

For each important issue provide:

```markdown
### [P1|P2|P3] Finding title

**Problem:** Exact contradiction, omission, or unsafe assumption.

**Why it matters:** Correctness, execution, validation, or maintenance consequence.

**Evidence:** Exact document section plus repository evidence.

**Preserve:** Behavior or invariant that must remain.

**Smallest safe correction:** Keep, simplify, merge, delete, replace, or grandfather.
```

Add concrete example only when evidence needs illustration.

## Output Format

### Findings

List root-cause findings first, ordered by severity. If none, say so explicitly.

### Open Questions Or Assumptions

Include only unresolved items that affect safe approval or execution.

### Must-Fix Before Approval

List smallest required P1 and P2 corrections. Exclude optional improvements.

### Smallest Safe Version

Describe smallest end-to-end correction preserving correctness, SSOT, symmetry, native reuse, reproducibility, testability, and clear ownership. Do not rewrite unaffected scope. Provide full alternative design only when current proposal is fundamentally unsound.

### Review Verdict

State exactly one readiness verdict and short reason.

## Red Flags

- rewriting document instead of reviewing it
- repeating one root cause across several sections
- treating artifact metadata status as review verdict
- reviewing implementation diffs instead of proposed contract
- claiming tests or behavior pass before execution
- demanding every technical profile for an unrelated plan
- rejecting custom code based on assumed native support
- proposing new orchestration, registry, validator, or abstraction without demonstrated need
- reporting optional polish as approval blocker

## Integration

Use after `skill-spec-drafting` or `skill-writing-plans` when review cost is justified and before `skill-executing-plans` or external handoff.
