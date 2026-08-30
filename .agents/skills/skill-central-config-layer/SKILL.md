---
name: skill-central-config-layer
description: Use when shared configuration spans multiple modules, services, agents, or pipelines.
required_reads: []
distribution_tier: starter_kit
---
# Central Config Layer

## Purpose

Assess configuration ownership and improve the existing configuration layer only
when shared, runtime-varying, or policy values need one canonical owner.

Use this skill when:

- values are hardcoded in multiple modules
- the same enums or thresholds appear repeatedly
- environment settings are mixed with business rules
- agents or pipelines need one source of truth
- normalization rules should be reused
- configuration should be easier to tune without editing code

Do not create a new configuration architecture only because values repeat. Find
the existing canonical owner first and centralize only when semantics require a
shared configurable boundary.

## Core principle

Separate configuration by responsibility.

Typical config categories:

1. **Environment / infrastructure config**
   - project IDs
   - dataset names
   - regions
   - API endpoints
   - credentials paths
   - model names

2. **Runtime / pipeline behavior config**
   - batch sizes
   - retry counts
   - timeout values
   - top-N limits
   - scheduling settings
   - enabled or disabled stages

3. **Business-rule / policy config**
   - thresholds
   - weights
   - classification rules
   - allowed values
   - fallback defaults
   - tie-break order

4. **Taxonomy / normalization config**
   - enum lists
   - canonical names
   - synonym maps
   - mapping tables
   - category hierarchies

## Recommended directory layout

Reuse the existing configuration location. If no suitable owner exists and
multiple consumers need shared configurable values, add the smallest appropriate
file or module; do not create a fixed directory layout by default.

```text
<existing-config-owner>
```

For very small projects, one file may be enough. Split by responsibility only
when separate ownership or change cadence requires it.

## What to centralize

Centralize values that are:

- reused across modules
- likely to change
- policy or environment related
- part of shared business logic
- needed by multiple agents or pipeline stages

Examples:

- model names
- retry counts
- top-N values
- threshold cutoffs
- ranking weights
- enum sets
- mapping rules
- canonical names
- feature flags

## What not to centralize

Do not centralize:

- unstable one-off experiments
- long procedural logic
- complex SQL bodies
- implementation details that are only used once
- values that are truly local to one function and unlikely to change

## Output expectations

When applicable, produce only the smallest useful outputs:

1. A diagnosis of config sprawl or missing config boundaries
2. A recommended owner or structure
3. Refactor and validation guidance

## Recommended workflow

1. Inventory repeated values and existing configuration owners
2. Group candidates by environment, runtime, policy, taxonomy, or normalization
3. Decide whether each candidate is shared and semantically configurable
4. Add or adjust the smallest owner and validation needed
5. Refactor consumers to use the owner
6. Update tests and documentation only when the contract changes

## Validation guidance

The config loader should validate:

- required files exist
- required keys exist
- enum values are unique
- thresholds are within valid ranges
- weights are valid or normalized
- mappings do not collide badly
- defaults are explicitly defined
- environment keys are present

## Review checklist

Check for:

- duplicated constants
- duplicated enum lists
- duplicated thresholds
- repeated model names
- repeated API limits
- inconsistent naming across modules
- hidden assumptions in tests
- drift between code and documentation

## Config patterns

### env.yaml

Use for infrastructure and external dependency settings:

- project_id
- dataset
- region
- credentials_path
- api_base_url
- model_name

### runtime.yaml

Use for execution behavior:

- batch_size
- retry_count
- timeout_seconds
- max_concurrency
- top_n
- enabled_steps

### policy.yaml

Use for decision rules:

- thresholds
- weights
- tie_break_order
- defaults
- scoring rules

### taxonomy.yaml

Use for allowed values and category systems:

- levels
- categories
- states
- enums
- mappings

### synonyms.yaml

Use for canonicalization:

- canonical value → aliases
- normalization maps
- title or skill variants
- naming cleanup rules

## Migration checklist

- identify repeated literals
- move reusable settings into config
- keep file names stable
- validate config on load
- avoid leaking config parsing into business logic
- update tests to use sample config fixtures
- document defaults and fallback behavior

## Output format

When using this skill, provide:

- a short diagnosis
- proposed config files
- exact keys to create
- affected modules
- risky migrations
- suggested validation rules
