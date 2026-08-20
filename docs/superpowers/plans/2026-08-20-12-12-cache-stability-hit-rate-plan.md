---
layer: change
artifact_type: plan
status: completed
template_id: implementation-plan
name: cache-stability-hit-rate
targets:
  - components/adapters/claude-code
  - components/adapters/codex
  - components/adapters/openclaw
  - components/packages/features/stabilizer
  - components/packages/foundation/host-adapter
  - scripts/release
---

# Cache Stability and Hit-Rate Implementation Plan

## Goal

Improve LightRSI prompt-cache hit rate and runtime stability without changing
model-visible user content, tool order, instruction authority, response quality,
or normal-request latency. Use provider-native cache controls, preserve exact
request structure, and avoid new cache services, databases, background jobs,
network lookups, or speculative cache-planning abstractions.

## Key Deliverables

- Claude preserves structured `system` blocks and uses Anthropic `cache_control`
  instead of generated `prompt_cache_key`.
- GPT-5.6-and-later requests use explicit cache breakpoints and
  `prompt_cache_options`; older-model retention remains model-gated.
- Cache optimization never reorders tools or rewrites user content on the
  provider-bound request path.
- Codex routing keys stop fragmenting on options outside the reusable rendered
  prefix.
- Cache tests compare exact prefixes, telemetry records Anthropic cache writes,
  and persisted unsupported-field decisions expire.
- Source, built output, and release package smokes prove the same contracts.

## Execution Approach

- Sequential lead execution. Codec, stabilizer, host-adapter, and release files
  share ownership; parallel writes add conflict without shortening critical path.
- Use `skill-test-driven-development` for every behavior change: add assertion,
  observe expected failure, apply smallest source change, rerun focused tests.
- Use `skill-backend-verification` for provider payloads, retry behavior,
  persisted capability state, usage fields, and packaged-output proof.
- Use `skill-requesting-code-review` after implementation and
  `skill-verification-before-completion` before changing plan status.
- Do not create `CachePlan`, cache daemon, cache database, model alias table,
  provider discovery request, or new dependency. Existing codecs own native
  provider fields.
- Do not commit, merge, push, reset, clean, stash, delete, or overwrite unrelated
  work without explicit authorization.

## Preconditions

- Preserve current tracked changes in
  `components/products/mcp/tests/server.test.ts` and
  `docs/superpowers/plans/2026-08-18-23-10-lightrsi-namespace-migration-plan.md`.
- Leave `.serena/` and `outputs/` untracked and outside source patches.
- Record current baseline: stabilizer 47 tests, Claude 180 tests, Codex 383 tests.
- Stop if named paths or symbols differ materially from current source; update
  this plan before implementation rather than guessing owners.

## Task Dependency Graph

```text
Task 1 lock immutable contracts
  -> Task 2 repair Claude native caching
  -> Task 3 add GPT-5.6 explicit caching
  -> Task 4 remove provider-visible mutations
  -> Task 5 repair evidence and capability recovery
  -> Task 6 verify built and packaged behavior
  -> Task 7 final review and handoff
```

## Task Breakdown

### Task 1: Lock Provider-Bound Cache Invariants

**Purpose:** Convert audit findings into failing regression tests before source
changes.

**Task Function:** TDD contract definition.

**Template Profile:** high

**Required Skills:** `skill-test-driven-development`, `skill-backend-verification`

**Dependencies:** None.

**Files:**

- `components/adapters/claude-code/tests/messages-codec.test.ts`
- `components/adapters/claude-code/tests/gateway-runtime.test.ts`
- `components/adapters/claude-code/tests/context-rewrite-encode-bypass.test.ts`
- `components/adapters/codex/tests/responses-codec.test.ts`
- `components/adapters/codex/tests/stable-prefix.test.ts`
- `components/adapters/openclaw/src/context-stack/integration/openclaw-host-adapter.test.ts`
- `components/adapters/openclaw/src/context-stack/integration/prefix-runner.test.ts`
- `components/adapters/openclaw/src/reduction-proxy.test.ts`
- `components/adapters/openclaw/src/context-stack/integration/module-combination-baseline.test.ts`
- `components/packages/features/stabilizer/tests/stabilizer.test.ts`

**Authority:** Tests may encode only approved invariants. Stop if a test requires
changing message order, role authority, text, tool order, or content-block
representation beyond adding provider cache metadata.

**Steps:**

1. Add Claude round-trip coverage for `system` as string and structured text
   blocks containing `cache_control` and unknown fields, including the existing
   encode-or-bypass path when structured instructions cannot be reconstructed.
2. Assert Claude preserves system block order/text/fields and does not synthesize
   native top-level `prompt_cache_key`.
3. Assert native `cache_control` reaches Claude upstream and fallback removes only
   an explicitly rejected optional field.
4. Add Codex coverage for GPT-5.6 explicit mode, block-level
   `prompt_cache_breakpoint`, and absence of legacy `prompt_cache_retention`.
5. Add Codex older-model coverage proving GPT-5.6 fields do not leak and an
   inbound `prompt_cache_retention` value passes through unchanged while an absent
   value remains absent.
6. Add full-boundary OpenClaw coverage proving inbound camelCase and snake_case
   retention values pass through unchanged and both remain absent when omitted.
7. Assert provider-bound tools and user content remain deep-equal before and after
   cache preparation across Claude, Codex, and the full OpenClaw
   `prepareProxyRequest` path, including module-combination coverage.
8. Run each focused test and record expected failures caused by current behavior,
   not import, fixture, or syntax errors.

**Verification:**

```powershell
node --import tsx --test components/adapters/claude-code/tests/messages-codec.test.ts
node --import tsx --test components/adapters/claude-code/tests/gateway-runtime.test.ts
node --import tsx --test components/adapters/claude-code/tests/context-rewrite-encode-bypass.test.ts
node --import tsx --test components/adapters/codex/tests/responses-codec.test.ts
node --import tsx --test components/adapters/codex/tests/stable-prefix.test.ts
node --import tsx --test components/adapters/openclaw/src/reduction-proxy.test.ts
node --import tsx --test components/adapters/openclaw/src/context-stack/integration/module-combination-baseline.test.ts
npm --prefix components/packages/features/stabilizer test
```

**Exit Criteria:** Every approved invariant has a focused assertion, and new
assertions fail for audited behavior before production edits.

### Task 2: Repair Claude Native Prompt Caching

**Purpose:** Preserve valid Anthropic request structure and enable real cache
writes and reads.

**Task Function:** Codec and gateway correction.

**Template Profile:** high

**Required Skills:** `skill-test-driven-development`, `skill-backend-verification`

**Dependencies:** Task 1.

**Files:**

- `components/adapters/claude-code/src/messages-codec.ts`
- `components/adapters/claude-code/src/stable-prefix.ts`
- `components/adapters/claude-code/src/gateway-runtime.ts`
- `components/adapters/claude-code/src/upstream.ts`
- `components/adapters/claude-code/tests/messages-codec.test.ts`
- `components/adapters/claude-code/tests/gateway-runtime.test.ts`
- `components/adapters/claude-code/tests/context-rewrite-encode-bypass.test.ts`
- `components/adapters/claude-code/tests/e2e.test.ts`

**Authority:** Preserve exact model-visible system/message content. Generated
cache metadata may change. Native Anthropic uses `cache_control`; compatible
upstreams remain fail-open through one bounded retry.

**Steps:**

1. Keep shared `HostRequestEnvelope.instructions` typed as text. In Claude codec
   metadata, preserve raw string/block-array `system` as
   `metadata.__anthropicRawSystem` and its flattened original text as
   `metadata.__anthropicSystemText`; expose only flattened read-only text through
   `instructions` for shared stabilizer and audit consumers.
2. Stop Claude cache preparation from rewriting model-visible instructions. Encode
   `metadata.__anthropicRawSystem` unchanged when current `instructions` equals
   `metadata.__anthropicSystemText`. If structured-system `instructions` changed
   unexpectedly, fail closed through existing `encodeRequestOrBypass` and forward
   original raw body rather than reconstructing blocks or dropping fields.
3. Remove LightRSI-generated Anthropic `prompt_cache_key`; preserve an inbound
   field only in pure-forward mode.
4. Add top-level `cache_control: { type: "ephemeral" }` for native Anthropic.
   Preserve valid inbound cache-control TTL instead of replacing it.
5. Change optional-field compatibility handling from generated
   `prompt_cache_key` to `cache_control`; retry once without only the rejected
   field after an explicit unsupported-parameter response.
6. Do not relocate volatile runtime context or rewrite user content for caching.
   Use Anthropic top-level automatic `cache_control`, preserve any inbound explicit
   block marker, and let provider prefix lookback select reusable content. This is
   intentionally asymmetric with OpenAI GPT-5.6, whose request path needs the
   explicit breakpoint/options behavior in Task 3.
7. Update E2E proof: cold/create first request, read on identical prefix, and
   miss when content within the provider-selected cacheable prefix changes.

**Verification:**

```powershell
npm --prefix components/adapters/claude-code test
npm --prefix components/adapters/claude-code run typecheck
```

Inspect captured payloads for system deep equality, native `cache_control`, one
bounded fallback retry, and unchanged messages/tools.

**Exit Criteria:** Structured systems survive round-trip, native cache controls
reach upstream, compatible providers fail open once, and cache preparation
changes no model-visible content.

### Task 3: Add GPT-5.6 Explicit Cache Boundaries

**Purpose:** Cache stable developer/system prefix without writing changing user
or tool suffixes on GPT-5.6-and-later models.

**Task Function:** Model-gated Responses serialization.

**Template Profile:** high

**Required Skills:** `skill-test-driven-development`, `skill-backend-verification`

**Dependencies:** Task 2.

**Files:**

- `components/adapters/codex/src/stable-prefix.ts`
- `components/adapters/codex/src/responses-codec.ts`
- `components/adapters/codex/src/upstream.ts`
- `components/adapters/codex/src/proxy-runtime.ts`
- `components/adapters/codex/tests/stable-prefix.test.ts`
- `components/adapters/codex/tests/responses-codec.test.ts`
- `components/adapters/codex/tests/upstream.test.ts`
- `components/adapters/codex/tests/e2e.test.ts`

**Authority:** Add metadata only to an existing cacheable content block. Do not
move top-level instructions, convert roles, reorder input, or synthesize a new
model-visible block solely to host a breakpoint.

**Steps:**

1. Add one stdlib-only GPT-5.6-and-later predicate: take the final `/` segment,
   match `^gpt-(\d+)\.(\d+)(?:-|$)`, compare the numeric tuple with `[5, 6]`,
   and return false for nonmatches. Cover `gpt-5.5`, `gpt-5.6`, `gpt-5.6-sol`,
   `cx/gpt-5.6-sol`, `gpt-5.10`, `gpt-6.0-new`, and `provider/future-model`.
2. Locate last supported existing content block in stable developer/system prefix
   and attach `prompt_cache_breakpoint: { mode: "explicit" }` without changing
   sibling data.
3. Emit `prompt_cache_options: { mode: "explicit", ttl: "30m" }` only when marker
   attachment succeeds.
4. Stop synthesizing `prompt_cache_retention: "24h"`. For earlier models,
   pass through caller-provided retention unchanged and omit the field when the
   caller omitted it.
5. Recognize optional `prompt_cache_options` rejection and retry once with only
   rejected metadata removed; never strip prompt content.
6. Preserve current shared `prompt_cache_key` family policy. Record model in
   audit data, not routing key.
7. Add E2E proof with identical stable prefix/changing user suffix, then changed
   stable block. Warm read occurs only for identical stable prefix.

**Verification:**

```powershell
npm --prefix components/adapters/codex test
npm --prefix components/adapters/codex run typecheck
```

**Exit Criteria:** GPT-5.6-and-later uses explicit stable boundary/current TTL,
older models retain compatible behavior, and unsupported upstreams fail open
without steady-state retry latency.

### Task 4: Remove Provider-Visible Cache Mutations

**Purpose:** Keep deterministic cache identity without changing model behavior.

**Task Function:** Shared stabilizer and adapter call-site correction.

**Template Profile:** high

**Required Skills:** `skill-test-driven-development`, `skill-backend-verification`

**Dependencies:** Task 3.

**Files:**

- `components/packages/features/stabilizer/src/tools.ts`
- `components/packages/features/stabilizer/src/stable-prefix-contract.ts`
- `components/packages/features/stabilizer/tests/stabilizer.test.ts`
- `components/adapters/codex/src/proxy-runtime.ts`
- `components/adapters/codex/src/stable-prefix.ts`
- `components/adapters/codex/tests/stable-prefix.test.ts`
- `components/adapters/claude-code/src/gateway-runtime.ts`
- `components/adapters/claude-code/tests/messages-codec.test.ts`
- `components/adapters/openclaw/src/context-stack/request-preprocessing/stable-prefix.ts`
- `components/adapters/openclaw/src/context-stack/integration/prefix-runner.ts`
- `components/adapters/openclaw/src/context-stack/integration/proxy-runtime-request.ts`
- `components/adapters/openclaw/src/context-stack/integration/prefix-runner.test.ts`
- `components/adapters/openclaw/src/context-stack/integration/openclaw-host-adapter.test.ts`
- `components/adapters/openclaw/src/reduction-proxy.test.ts`
- `components/adapters/openclaw/src/context-stack/integration/module-combination-baseline.test.ts`

**Authority:** Delete runtime mutation call sites before replacement code.
Canonicalization remains allowed only on detached hash/audit values.

**Steps:**

1. Remove `canonicalizeEnvelopeTools` from Codex and Claude provider-bound paths.
2. Keep `canonicalizeTools` only inside stable-contract hashing/diagnostics on
   newly created values.
3. Remove OpenClaw user-content whitespace normalization and sender-metadata
   deletion from provider-bound rewrite.
4. Stop synthesizing both `promptCacheRetention: "24h"` and
   `prompt_cache_retention: "24h"` in `prepareProxyRequest`; preserve inbound
   retention unchanged and omit it when absent.
5. Compute OpenClaw canonical key/audit text from a detached normalized copy for
   every per-message user-content loop, not only the developer/root-prompt path;
   forward original user content byte-for-byte.
6. Keep dynamic context in original model-visible location unless provider-native
   boundary excludes it without moving or rewriting it.
7. Remove unrelated raw options such as `temperature` from Codex family-key
   derivation; keep tool schemas in stable core.
8. Preserve intentional model-independent `prompt_cache_key` family identity for
   identical stable core across aliases, sessions, and model names. Model gating
   controls serialized cache options/breakpoints/retention, not family-key
   identity; provider caches remain provider/model scoped. Defer sharding until
   telemetry proves sustained provider routing pressure.

**Verification:**

```powershell
npm --prefix components/packages/features/stabilizer test
npm --prefix components/adapters/openclaw test
npm --prefix components/adapters/claude-code test
npm --prefix components/adapters/codex test
npm --prefix components/packages/features/stabilizer run typecheck
npm --prefix components/adapters/openclaw run typecheck
npm --prefix components/adapters/claude-code run typecheck
npm --prefix components/adapters/codex run typecheck
```

**Exit Criteria:** Provider-bound user content/tools equal input, hashes remain
deterministic, unrelated options no longer fragment routing key, OpenClaw adds no
retention field, and cache layer contains no quality-affecting rewrite.

### Task 5: Repair Cache Evidence and Capability Recovery

**Purpose:** Make hit diagnostics trustworthy and recover automatically after
outdated provider incompatibility.

**Task Function:** Test oracle, telemetry, and persisted capability correction.

**Template Profile:** normal

**Required Skills:** `skill-test-driven-development`, `skill-backend-verification`

**Dependencies:** Task 4.

**Files:**

- `components/packages/foundation/host-adapter/src/testing/host-e2e.ts`
- `components/packages/foundation/host-adapter/src/state/cache-usage.ts`
- `components/packages/foundation/host-adapter/tests/cache-usage.test.ts`
- `components/packages/features/stabilizer/src/cache-audit-store.ts`
- `components/packages/features/stabilizer/tests/cache-audit-store.test.ts`
- `components/adapters/claude-code/src/upstream.ts`
- `components/adapters/claude-code/tests/gateway-runtime.test.ts`
- `components/adapters/codex/src/upstream.ts`
- `components/adapters/codex/tests/upstream.test.ts`
- `components/adapters/openclaw/src/context-stack/integration/upstream-transport-fetch.ts`
- `components/adapters/openclaw/src/context-stack/integration/upstream-transport-fetch.test.ts`
- `components/adapters/openclaw/src/reduction-proxy.test.ts`

**Authority:** Use Node standard-library hashing and existing JSON helpers. No
external simulator, DB, timer service, or background cleanup job.

**Steps:**

1. Hash exact serialized cacheable prefix plus cache key in
   `startMockCachingJsonUpstream`; equal-length different content must miss. Drive
   the OpenClaw cache oracle through full `prepareProxyRequest`, not an isolated
   stable-prefix helper.
2. Keep estimated token counts only as usage values, never cache identity.
3. Read Anthropic `cache_creation_input_tokens` in `readCacheWriteTokens` before
   existing generic fallbacks.
4. Prove Anthropic writes appear in cache audit summaries without changing read
   accounting.
5. Apply a 24-hour TTL to persisted unsupported-field records. Treat missing,
   malformed, endpoint-mismatched, or expired records as empty.
6. Test expiry with fixed timestamps; no sleeps or polling.
7. Keep retry bounded to one and update timestamp only after confirmed
   unsupported-parameter response.

**Verification:**

```powershell
npm --prefix components/packages/foundation/host-adapter test
npm --prefix components/packages/features/stabilizer test
npm --prefix components/adapters/claude-code test
npm --prefix components/adapters/codex test
npm --prefix components/adapters/openclaw test
```

**Exit Criteria:** Different bytes cannot produce false hit, Anthropic writes are
visible, valid rejection suppresses one field, and expired state retries once.

### Task 6: Verify Built and Packaged Cache Contracts

**Purpose:** Prevent source tests passing while stale bundled output ships.

**Task Function:** Build, package, and boundary verification.

**Template Profile:** high

**Required Skills:** `skill-backend-verification`, `skill-verification-before-completion`

**Dependencies:** Task 5.

**Files:**

- `scripts/release/build-local.sh`
- `scripts/release/smoke-host-package.mjs`
- `scripts/release/smoke-openclaw-package.mjs`
- `components/adapters/claude-code/src/release-package.test.ts` (new)
- `components/adapters/codex/src/release-package.test.ts` (new)
- `components/adapters/openclaw/src/release-package.test.ts`

**Authority:** Extend existing release smokes only. Do not create second packaging
pipeline or commit archives, extracted packages, or logs.

**Steps:**

1. Build and pack all adapters through existing scripts.
2. Extend host package smoke to prove Claude structured-system preservation,
   Anthropic `cache_control`, GPT-5.6 breakpoint/options, older-model gating, and
   user/tool immutability from packaged exports. New Claude/Codex
   `release-package.test.ts` tests must extract the package and import packaged
   `dist` output, mirroring OpenClaw; never import adapter `src`.
3. Extend OpenClaw smoke to prove unchanged user content/tool order and stable
   routing identity.
4. Verify package version and Git commit through existing release manifest checks;
   historical artifacts remain excluded from current truth.
5. Run package-boundary checks before full workspace verification.

**Verification:**

```powershell
pnpm check:boundaries
pnpm typecheck
pnpm -r test
pnpm build
pnpm release:verify
bash scripts/release/build-local.sh
```

**Exit Criteria:** Source, built output, and packed archives expose identical
cache contracts, package smokes pass, and no generated artifact enters source
diff.

### Task 7: Review Final Diff and Prepare Handoff

**Purpose:** Reconcile implementation with plan and reject quality, latency, or
management regressions before Git disposition.

**Task Function:** Correctness review and final evidence audit.

**Template Profile:** xhigh

**Required Skills:** `skill-requesting-code-review`, `skill-verification-before-completion`

**Dependencies:** Task 6.

**Files:** Entire implementation diff and ignored verification evidence.

**Authority:** Read-only review plus focused corrective patches. No commit, merge,
push, branch deletion, worktree removal, or cleanup without approval.

**Steps:**

1. Compare diff against every deliverable, exit criterion, and verification row.
2. Confirm no new service, DB, dependency, worker, provider discovery call, or
   cache-planning abstraction.
3. Confirm user text, system/developer authority, message order, tool order, and
   schemas remain unchanged in captured provider payloads.
4. Confirm supported steady-state adds no retry and explicit unsupported response
   adds at most one retry.
5. Confirm unrelated tracked changes and `.serena/`/`outputs/` remain untouched.
6. Run `git diff --check`, inspect changed files, and rerun shortest relevant test
   after corrective edits.
7. Produce `verified`, `incomplete`, or `blocked` handoff. Only verified outcome
   may change plan status to `completed`.

**Verification:** Final diff, file inventory, fresh commands, and plan
reconciliation.

**Exit Criteria:** No unresolved correctness/quality finding, every material claim
has proof, and Git disposition remains user-controlled.

## Verification

### Final Verification Matrix

| Contract | Required proof |
|---|---|
| Claude system fidelity | String/structured system round-trip deep equality |
| Claude native caching | Upstream `cache_control`; no generated native `prompt_cache_key` |
| GPT-5.6 boundary | Existing stable block marker plus request options |
| Older model compatibility | Caller retention passes through; absent value stays absent |
| Model quality | User text, roles, message/tool order, and schemas unchanged |
| Routing-key stability | Stable prefix shares key; unrelated options do not fragment |
| Cache oracle | Equal-length different prefixes miss; exact prefix hits |
| Cache telemetry | Claude/OpenAI cache write/read counters recorded correctly |
| Capability recovery | Valid rejection suppresses field; expired record retries once |
| Latency | Supported path adds no request, disk write, or network lookup |
| Package provenance | Source/build/package smoke matches current commit |
| Repository hygiene | No unrelated edits, archives, secrets, or runtime state committed |

### Required Commands

```powershell
pnpm check:boundaries
pnpm typecheck
pnpm -r test
pnpm build
pnpm release:verify
bash scripts/release/build-local.sh
git diff --check
git status --short
```

## Rollback Strategy

1. Keep task boundaries reversible without reverting unrelated reduction or
   eviction work.
2. On provider rejection, preserve prompt content, remove only rejected optional
   field, retry once, and persist bounded capability evidence.
3. If GPT-5.6 explicit support fails, omit explicit mode and use provider implicit
   caching; never restore unconditional `24h` retention.
4. If packaged behavior differs from source, stop release and rebuild; never patch
   generated `dist` directly.
5. Never delete capability state, audit history, user config, or historical
   release artifacts automatically.

## Completion Criteria

A task is complete only when:

1. focused regression test was observed failing before production changes
2. listed source and tests pass focused verification
3. exit criteria have fresh evidence
4. dependent tasks are complete

Plan completes only when all Key Deliverables and verification rows pass, full
build/package verification succeeds, final review returns `verified`, and
`skill-verification-before-completion` authorizes status change.
