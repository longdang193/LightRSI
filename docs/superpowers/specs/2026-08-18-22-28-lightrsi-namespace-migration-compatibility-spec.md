---
layer: change
artifact_type: spec
status: active
template_id: detailed-specification
name: lightrsi-namespace-migration-compatibility
targets:
  - components/adapters/codex
  - components/packages/foundation/host-adapter
  - components/packages/features/stabilizer
  - components/products/cli
  - components/presets/tokenpilot
  - package.json
  - pnpm-lock.yaml
  - tsconfig.base.json
related_features:
  - namespace-migration
  - stable-prefix-cache
  - codex-adapter
---

# LightRSI Namespace Migration Compatibility Specification

## Status

Active specification approved on 2026-08-18 for migration from local
LightMem2-derived runtime to LightRSI. It authorizes implementation planning but
does not authorize direct cherry-picking of upstream rename commit `c99e54f`.

## Problem

Upstream HEAD `d61d40c` makes these identities canonical:

- product/repository: `LightRSI`
- npm scope: `@lightrsi/*`
- CLI: `lightrsi`
- environment prefix: `LIGHTRSI_*`
- product state root: `~/.lightrsi/`
- model prefix where applicable: `lightrsi/<model>`

Local code contains independent cache-contract, stable-prefix, DeepAgents
normalization, TokenPilot proxy, and 9Router telemetry work. Seven dirty local
files overlap upstream changes. Upstream also changes branded prompt-cache keys
without complete old-key recognition. Literal adoption risks lost local work,
cache-family fragmentation, and persisted-state drift.

## Goal

Adopt valid LightRSI naming and compatibility behavior while preserving:

```text
Codex or DeepAgents
  -> TokenPilot proxy
  -> 9Router
  -> selected provider/model
```

LightRSI owns product identity. TokenPilot remains context-management preset,
proxy, plugin, and host-state identity. 9Router remains final model/provider
gateway. Rename alone must not change model quality, user context, tools,
reasoning options, forwarded request semantics, or cache equivalence.

## Scope

### In Scope

- product, package, CLI, environment, schema, and product-state names
- compatibility reads for existing LightMem2 names and state
- TokenPilot and 9Router ownership boundaries
- prompt-cache key and cache-family compatibility
- model-prefix normalization and command-skill migration
- atomic workspace package-scope migration
- rollback, mixed-version behavior, Codex, and DeepAgents verification

### Out of Scope

- enabling context rewrite or eviction by default
- changing stabilization, reduction, or context-rewrite semantics
- changing models, aliases, providers, reasoning settings, tools, or agents
- making LightRSI or TokenPilot final LLM provider or replacing 9Router
- new cache algorithms, dependencies, commit, push, or publication
- rewriting Git history, tags, citations, or TokenPilot paper terminology

## Evidence

| Fact | Evidence | Implication |
|---|---|---|
| Upstream change is three rename/branding commits after shared base. | Fresh fetch on 2026-08-18. | Treat as migration, not architecture upgrade. |
| Upstream writes `lightrsi.*` and reads selected `lightmem2.*` schemas. | Context-history and rebase sources. | Require explicit dual readers. |
| Environment order is `LIGHTRSI_*`, `LIGHTMEM2_*`, `TOKENPILOT_*`. | Upstream estimator config. | Adopt below explicit config. |
| Upstream changes `lightmem2-codex-*` to `lightrsi-codex-*`; one classifier accepts only new prefix. | Stable-prefix and proxy diff. | Add dual recognition. |
| Local family derivation slices literal old prefix. | Local stable-prefix source. | Parse keys before renaming. |
| Upstream token counter strips only `lightrsi/`. | Host-adapter diff. | Preserve old and TokenPilot prefixes. |
| Package scope touches all workspace resolution surfaces. | Workspace diff. | Rename atomically. |

## Ownership

### LightRSI

- public product/repository identity, npm scope, and root CLI
- canonical product environment names and product-level state root
- new persisted schema namespace

### TokenPilot

- preset, plugin, proxy, configuration, and host-state identity
- daemon lifecycle, stabilization, reduction, eviction, and cache telemetry
- `/tokenpilot` command

### 9Router

- canonical model/provider resolution, final route, credentials, and provider boundary

### Cache Contract

LightRSI/TokenPilot stable-prefix code owns cache equivalence, breakpoint
construction, family derivation, and telemetry. 9Router resolution is an input,
not owner of cache equivalence.

## Required Behavior

### Naming

New product output uses `LightRSI`; packages use `@lightrsi/*`; canonical CLI is
`lightrsi`. TokenPilot names remain for preset, proxy, config, and host state.

### Configuration Precedence

```text
1. explicit JSON or command configuration
2. LIGHTRSI_*
3. LIGHTMEM2_*
4. TOKENPILOT_*
5. built-in default
```

Whitespace-only values do not mask lower-precedence non-empty values. Invalid
values keep existing fail-closed diagnostics. Secrets remain references and
never enter source, docs, logs, or telemetry.

### Persisted Schemas

New writes use `lightrsi.*`. Readers explicitly accept supported equivalent
`lightmem2.*` schemas for context-history journals, rebase epoch, cooldown,
capability, and any other active persisted reader found during implementation.
Compatibility never accepts unknown versions by broad prefix. Old state is not
destructively rewritten; later writes use canonical schemas.

### Product State

1. Use `~/.lightrsi/state` when present.
2. Otherwise read `~/.lightmem2/state` when present.
3. Write future product state only under `~/.lightrsi/state`.
4. Never delete legacy state automatically.
5. Never rename TokenPilot host-state directories.

When both roots exist, canonical state wins. No automatic merge occurs.

### CLI and Skills

`lightrsi` is canonical. `lightmem2` and `lightmem2-install-*` remain aliases for
at least one compatibility release and use same implementation. Install
canonical `lightrsi-status`, `lightrsi-report`, `lightrsi-doctor`, and
`lightrsi-visual` skills. Reinstall removes only adapter-owned legacy skills and
remains idempotent.

Canonical and compatibility CLI aliases must share one daemon identity, state
directory, lock, and port. Invoking a legacy alias must not start a second proxy
or runtime beside an active canonical process.

### Package Scope

Rename `@lightmem2/*` to `@lightrsi/*` atomically across manifests, imports,
TypeScript paths, metadata, lockfile links, release scripts, smokes, and boundary
validation. Mixed scope is not releasable. Never edit `node_modules`.

### Model Prefixes

Token counting, installer migration, and semantic comparison recognize
`tokenpilot/<model>`, `lightmem2/<model>`, and `lightrsi/<model>`. Remove only
one recognized leading prefix. Do not add per-model alias tables. 9Router remains
source of truth for route/model/provider resolution.

## Canonical Cache Contract

### Principle

Brand name must not define semantic cache identity. Routing equivalence is not
cache equivalence. Family identity derives from full cache-relevant contract:

- resolved model identity
- cache-relevant options
- canonical tool/schema identity
- exact stable breakpoint prefix
- stable system/developer instructions

Semantic differences must remain separate.

### External Key Compatibility

Readers and classifiers recognize:

```text
lightmem2-codex-<24 lowercase hex>
lightrsi-codex-<24 lowercase hex>
```

One shared parser returns generation, host, and digest. Malformed keys remain
external or invalid according to caller contract. Callers must not derive
identity through literal prefix-length slicing.

### Internal Identity

Equivalent old/new keys with same digest map to one semantic family. Conceptual
semantic identity is `cache-family-v1-<contract-digest>`. This migration keeps
persisted and emitted `lightmem2-family-*` IDs as grandfathered protocol values
to avoid cache fragmentation. User-facing branding may say LightRSI without
changing family IDs. A future protocol version may introduce a new external
family prefix only with explicit dual-read migration proof.

New product-facing keys may use `lightrsi-codex-*` only after dual-read tests
pass. Rename must not alter user context, message history, tool payload, stable
core, canonical contract digest, family ID, or provider wire-prefix hash.

Proxy framework-key classification accepts both generations. An old key must
not become an unrelated host-session alias after upgrade.

### Cache Metadata Compatibility

Existing local metadata and telemetry fields such as
`lightmem2CacheContractVersion`, `lightmem2CacheContractDigest`,
`lightmem2CacheFamilyId`, and equivalent persisted keys are grandfathered
protocol fields for this migration. Readers and writers retain them unless a
separate versioned protocol migration is approved.

Do not emit duplicate old/new metadata fields merely for branding. Product UI
and report labels may use LightRSI while consuming the existing protocol fields.
Metadata names must not enter provider cache identity unless already defined as
cache-relevant by the canonical contract.

### Multi-Agent Symmetry

Executor and validator share only genuinely identical stable prefix. Their
role-specific instructions and tasks remain semantic differences after the
breakpoint. Each agent's later request preserves its earlier cacheable prefix
unless cache-relevant input changed.

## Decisions

### One Compatibility Rule per Owning Boundary

- selected: explicit aliases at CLI, environment, schema, state, model, and cache-key boundaries
- rationale: SSOT and symmetry without new migration framework
- rejected: scattered string replacements or parallel old/new implementations

### Brand-Neutral Cache Identity

- selected: parse presentation key separately from semantic digest/family
- rationale: product rename cannot fragment cache
- rejected: immediate hard rename or permanent LightMem2-only writes

### TokenPilot State Stays TokenPilot

- selected: rename product state only
- rationale: avoids duplicate daemon/runtime state and preserves deployment
- rejected: global replacement of every TokenPilot or LightMem2 path

### 9Router Stays Final Gateway

- selected: preserve TokenPilot upstream `http://127.0.0.1:20128/v1`
- rationale: namespace migration cannot change routing architecture
- rejected: direct provider fallback or LightRSI final-provider mode

### Atomic Package Rename

- selected: one workspace-wide package-scope change
- rationale: manifests, imports, aliases, and lock links form one contract
- rejected: package-by-package steady state

## Invariants

1. 9Router remains final provider gateway.
2. TokenPilot remains middleware, never final LLM provider.
3. Existing models, aliases, providers, secret references, agents, and tools work.
4. Legacy persisted state remains readable during compatibility window.
5. New writes use canonical LightRSI identities.
6. Equivalent requests retain equivalent cache identity across rename.
7. Different cache semantics remain in different families.
8. Context rewrite and eviction defaults do not change.
9. Forwarded request semantics and user context do not change.
10. Compatibility is uniform, not per-model or per-agent special cases.
11. Existing dirty local cache work is preserved.

## Edge and Failure Cases

- Both environment generations: non-empty LightRSI value wins.
- Both state roots: LightRSI wins; no merge or deletion.
- Unsupported old schema version: existing invalid-state behavior.
- Old cache key after upgrade: recognize, map, preserve session association.
- Old/new key with same digest: same family.
- Malformed branded key: never partially slice or merge.
- Prefix text inside model name: unchanged unless leading recognized prefix.
- Interrupted migration: state remains readable; mixed package scope cannot ship.
- Concurrent old/new runtime: unsupported; shared lock/daemon identity prevents it.
- 9Router unavailable: visible upstream failure; no provider bypass.
- TokenPilot unavailable: visible failure; no automatic direct-9Router fallback.

## Compatibility Window

Minimum one compatibility release for CLI aliases. `LIGHTMEM2_*`, persisted
schema, state, model-prefix, cache-key, cache-family, and cache-metadata readers
have no scheduled removal because their data can outlive executables. Removal
requires separate explicit approval, migration evidence, and rollback proof;
elapsed time alone is insufficient.

## Acceptance Criteria

### Canonical Naming

- action: inspect clean install, packages, CLI, generated config, diagnostics
- expected: new product output is LightRSI; TokenPilot-owned names remain
- proof: package-boundary, CLI, install, and artifact tests

### Configuration Symmetry

- action: resolve equivalent config through each prefix and conflict combination
- expected: identical values under specified precedence
- proof: table-driven tests including empty and invalid values

### Persisted State Compatibility

- action: load LightMem2 fixtures, perform representative write
- expected: old state reads; new state writes canonically; old input remains
- proof: focused filesystem and schema tests

### Cache Identity Preservation

- action: compare identical requests using old/new key generations
- expected: equal stable-core hash, contract digest, family ID, and wire hash
- failure: branding changes payload, family, or old-key classification
- proof: stable-prefix, proxy, session-map, and wire-prefix tests

### Cache Metadata Compatibility

- action: load and emit current local cache metadata through migrated runtime
- expected: grandfathered protocol keys and values remain stable; UI branding is LightRSI
- proof: metadata round-trip and telemetry regression tests

### Cache Separation

- action: vary model, reasoning option, tools, or stable instructions one at a time
- expected: semantic differences produce distinct families
- proof: negative table-driven tests

### Model Prefix Uniformity

- action: normalize TokenPilot, LightMem2, and LightRSI forms of same model
- expected: same underlying model and token encoding without alias entries
- proof: table-driven tests including future admissible model names

### Workspace Integrity

- action: regenerate links, typecheck, boundaries, tests, build, package smokes
- expected: no unintended `@lightmem2/*` package references or mixed scope
- proof: fresh workspace command output

### Routing Chain

- action: fresh Codex request through TokenPilot and 9Router
- expected: TokenPilot receives request; forwards to `127.0.0.1:20128/v1`;
  9Router resolves provider/model; response returns through TokenPilot
- proof: config inspection and correlated safe boundary telemetry

### Multi-Agent Cache Symmetry

- action: live Codex Native/DeepAgents executor and validator initial/follow-up requests
- expected: true shared prefix reuses family; role differences remain separated;
  each stream preserves earlier prefix
- proof: stable-core hash, family ID, wire hash, provider cached tokens when exposed

### Rollback Safety

- action: simulate pre-migration runtime after canonical state write
- expected: untouched legacy state remains usable without secret changes
- proof: isolated upgrade/rollback fixture

### Single Runtime Ownership

- action: invoke canonical and compatibility CLIs against same running proxy
- expected: both address one daemon, state directory, lock, and port
- failure: duplicate process, port collision, or divergent runtime state
- proof: daemon lifecycle and restart regression tests

## Validation Intent

Focused proof covers dual schemas, environment precedence, state fallback, CLI
alias symmetry, skill cleanup idempotency, cache-key parser, family identity,
proxy classification, model-prefix normalization, and unchanged provider payload.

Completion proof covers lockfile regeneration, typecheck, boundaries, full tests,
build, package smokes, Codex doctor/status, fresh Codex request, DeepAgents
executor/validator probes, and confirmation that 9Router remains final gateway.
Successful install or UI evidence alone is insufficient for backend claims.

## Risks and Containment

- Cache fragmentation, high: land dual parser and equality tests before new writes.
- Dirty conflict loss, high: preserve local work in commit or isolated worktree;
  reconcile seven overlaps manually; never reset unrelated changes.
- Workspace resolution, medium: atomic package rename plus full workspace proof.
- State split, medium: canonical-first read, legacy fallback, canonical-only write.
- Routing bypass, medium: preserve endpoints and fail visibly without fallback.

## Approved Decisions

Approved compatibility defaults:

1. Preserve `lightmem2-family-*` and existing cache metadata field names as
   grandfathered protocol identities during this migration.
2. Give environment, schema, state, model-prefix, cache-key, cache-family, and
   cache-metadata readers no scheduled removal.
3. Remove old command skills only when known manifest or filenames prove adapter
   ownership.
4. Make canonical and compatibility CLIs address one runtime identity.

## Approved Deferrals

None.
