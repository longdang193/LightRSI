# Technical Review Checklist

Use this reference only when a specification, design, architecture proposal, or implementation plan has substantial software, API, data, analytics, ML, optimization, storage, integration, or platform implications.

Review for correctness and execution readiness. Do not redesign unaffected scope, review implementation diffs, or claim completed behavior passes.

## Core Standard

Prefer one authoritative definition for equivalent rules, schemas, identities, components, workflows, interfaces, and validations. Reuse existing repository mechanisms and native platform capabilities when they satisfy explicit requirements. Add custom behavior only for a verified gap, incompatibility, correctness requirement, or smaller well-owned solution.

Require uniform correctness across admissible cases and scales. Differences must come from explicit semantic differences, parameters, specializations, or documented exceptions rather than duplicated logic, hidden branches, or implementation convenience.

## Universal Review

### Goal And Scope

- Is objective precise and bounded?
- Are success criteria observable?
- Are admissible cases, non-goals, assumptions, and preserved behavior explicit?
- Could two implementers interpret required result differently?

### Contracts And Identity

- Are inputs, outputs, schemas, artifacts, keys, states, defaults, errors, retries, and fallbacks defined?
- Is grain or unit of analysis explicit?
- Is identity preserved through transformations, joins, retries, backfills, updates, and cancellations?
- Are conversions between native and domain representations explicit, symmetric, and owned at one boundary?
- Are guarantees valid for empty, minimal, normal, large, malformed, duplicate, missing, and degenerate cases?

### Consistency And Symmetry

- Do requirements, examples, schemas, decisions, acceptance criteria, and plan tasks agree?
- Does implementation plan implement approved specification without duplicating design analysis?
- Are equivalent cases handled by same authoritative mechanism?
- Are differences represented through explicit parameters or justified specialization?
- Do batch, streaming, retry, backfill, test, and production paths preserve same semantics where required?

### Ownership And Boundaries

- Does each layer own correct logic?
- Do downstream layers consume authoritative upstream outputs?
- Is domain logic separated from UI, transport, storage, framework, and platform representations?
- Are shared invariants defined once instead of reimplemented across services, pipelines, notebooks, dashboards, and tests?
- Are generated outputs treated as derived surfaces rather than edit targets?

### Validation And Reproducibility

- Does each important claim have executable proof?
- Do planned checks cover required boundaries, failure modes, and minimal cases?
- Are uniqueness, referential integrity, ranges, split integrity, retries, and round-trip invariants checked when relevant?
- Are data, code, configuration, schemas, models, seeds, and dependencies versioned when reproducibility requires them?
- Can outputs be traced to authoritative inputs?
- Do tests lock external contract rather than incidental implementation details?

### Complexity And Native Reuse

- What can be deleted, reused, centralized, parameterized, deferred, or replaced?
- Is complexity compensating for inconsistent contracts instead of fixing owner?
- Does repository or installed platform already provide required behavior?
- Is custom rendering, interaction, validation, persistence, retry, scheduling, lifecycle, state, or accessibility code recreating suitable native behavior?
- Can domain data be adapted at explicit boundary while retaining native implementation?
- Is proposed abstraction justified by multiple real consumers rather than hypothetical reuse?

## Conditional Profiles

### Software And API

Use when reviewing services, libraries, APIs, CLIs, integrations, or application behavior.

- Are public interfaces, compatibility guarantees, state transitions, errors, retries, idempotency, and rollback defined?
- Are shared routes, validators, codecs, schemas, and configuration reused?
- Are concurrency, ordering, partial failure, timeout, and cancellation cases covered?
- Are security and accessibility responsibilities left with correct native owner where possible?

### Data And Analytics

Use when reviewing datasets, pipelines, warehouses, metrics, reports, or transformations.

- What does one row or entity represent?
- Are keys, joins, duplicates, nulls, late data, updates, cancellations, and backfills handled consistently?
- Are metric definitions and category mappings authoritative and reusable?
- Are unsupported meanings inferred from data?
- Do single-record, small-batch, large-batch, and backfill paths preserve identity and semantics?

### ML And Optimization

Use when reviewing models, training, inference, evaluation, experiments, or optimization systems.

- Are objectives, constraints, data splits, leakage boundaries, seeds, baselines, and evaluation metrics explicit?
- Are training and inference transformations symmetric where required?
- Are degenerate, sparse, small-sample, and distribution-shift cases handled?
- Are model artifacts and results traceable to data, code, configuration, and dependencies?
- Is claimed production readiness supported by deployment, monitoring, fallback, and reproducibility plans?

### Starter And Publication

Use when reviewing generic starter output, public mirrors, templates, or generated adapters.

- Does generic output avoid private or project-specific behavior?
- Are canonical inputs distinct from generated and published outputs?
- Does plan include required build, drift, validation, and publication checks?
- Is synchronization performed by existing scripts rather than duplicate manual steps?

## Native-Capability Evidence

Before raising a finding that custom code should be replaced by native capability, identify:

1. existing repository, framework, platform, language, database, library, or host capability
2. repository version or environment supporting it
3. explicit requirement it satisfies
4. boundary adaptation required
5. concrete maintenance or correctness advantage

Do not reject custom behavior based on assumed native support.

## Root-Cause Grouping

Group repeated symptoms under one root-cause finding. Do not report same ownership, SSOT, symmetry, or validation defect in multiple sections.

For every finding provide:

- severity: `P1`, `P2`, or `P3`
- problem
- why it matters
- evidence from document and repository
- behavior or invariant to preserve
- smallest safe correction: keep, simplify, merge, delete, replace, or grandfather

Use concrete example only when evidence needs illustration.

## Smallest Safe Correction

Recommend smallest local change resolving finding. Prefer deletion, native functionality, reuse, centralization, boundary adaptation, parameterization, explicit contracts, or executable validation over new infrastructure.

Provide full alternative design only when current proposal is fundamentally unsound. Otherwise do not rewrite document.
