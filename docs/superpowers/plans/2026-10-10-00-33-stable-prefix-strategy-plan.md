---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: completed
layer: change
name: stable-prefix-strategy
repository: LightMem2
base_commit: 7e6c20724ea692428b1392120c087c331c942490
targets:
  - components/adapters/codex/src/context-history
  - components/adapters/codex/src/reduction.ts
  - components/adapters/codex/src/proxy-runtime.ts
  - components/adapters/codex/src/upstream.ts
  - components/adapters/codex/src/stable-prefix.ts
  - components/adapters/codex/src/context-cleaner/bridge.ts
  - components/packages/features/stabilizer
  - components/packages/features/cleaner
  - components/products/cli
  - components/adapters/codex/tests
  - components/packages/features/stabilizer/tests
  - components/packages/features/cleaner/tests
  - components/products/cli/tests
  - docs/superpowers/experiments
---

# Stable-Prefix Strategy

## Goal

Make stable-prefix reuse truthful and safe before optimizing its hot path.
Preserve immutable admission, replay LightRSI's transformation instead of a
sanitized historical blob, promote only eligible successful evidence, separate
response-head lineage from strict replay scope, and expose bounded structural
forwarding evidence without claiming provider cache reuse.

Keep existing journal, one process cache, request-option fingerprint machinery,
cache-audit store, Cleaner preview, and 9Router boundary. Do not add cache
daemon, cache database, vector store, learned policy, provider simulator, new
compressor, or explicit GPT-5.6 prewarm policy.

## Verdict Review

New verdict requests changes before execution. Apply only justified corrections:

- Task 1 uses an explicit RED gate; expected reproduced failures authorize Task 2.
- Actual transport-attempt truth precedes accepted replay commitment.
- `responseProducing` and `projectionEligible` are separate fields with a boundary reason.
- Replay recipe proves only LightRSI-owned paths; no digest over unsanitized whole items.
- Existing response journal remains lineage source of truth; add helper, not graph.
- Compatibility and Cache Frontier become one task with transient per-item digests and bounded aggregate persistence.
- Provider evidence gets explicit `unknown` contract, separate from structural candidate status.
- Codex context-cleaner bridge populates generic Cleaner frontier fields.
- Current symbols and transport functions are named exactly.
- Per-attempt telemetry is minimal; rich structural derivation runs only for response-producing attempt.
- Final verification covers every touched package.
- Process-cache byte budget and performance decision thresholds are declared before measurement.

## Implementation Outcomes

### Actual-attempt acceptance boundary

Upstream exposes runtime-only final transport-attempt evidence: attempt ID,
effective endpoint, resolved model, effective payload reference, status, kind,
`responseProducing`, `projectionEligible`, and `projectionBoundary`. Raw payload
is never persisted. Successful retry/fallback may qualify when history remains
replay-compatible; discarded candidates never qualify. Explicit compaction,
rebase, Cleaner release, and other rewrites remain isolated boundaries.

### Verified replay and bounded cache

Journal stores sanitized diagnostics separately from a recipe containing stable
identity, occurrence, LightRSI-owned source fingerprints, replacement operations,
owned-field accepted fingerprints, sanitized structural fingerprint, and
authoritative attempt ID attached only at commit. Replay preserves unrelated
incoming fields and declines on uncertainty. Process cache has declared entry and
byte bounds with LRU promotion/eviction.

### Lineage-safe structural evidence

Linear response-head continuation reuses only with proven ancestry from existing
response journal, strict endpoint/cache-contract/rebase/config compatibility, and
matching occurrences. Cache Frontier compares compatible successful attempts using
transient ordered digests, persists only bounded aggregate results, avoids hot-path
tokenization, and remains structural/advisory rather than provider proof.

### Cleaner and experiment evidence

Generic Cleaner carries optional frontier fields; Codex bridge populates them.
Provider cache evidence stays separate and `unknown` when absent. Local matched
benchmarks precede approved 9Router/provider experiments. No default cache-key
change occurs without complete comparable evidence.

## Execution Approach

- Mode: `inline sequential`
- Coordination: `none`
- Required skills: `skill-writing-plans`, `skill-test-driven-development`, `skill-code-standards`, `skill-backend-verification`, `skill-performance-optimization`, `skill-verification-before-completion`
- Isolation: `current workspace`
- Commit policy: `no commits during execution`
- Preauthorized local actions: edit listed source/tests/docs, run listed local checks, inspect configured 9Router code, and write bounded experiment artifacts under `docs/superpowers/experiments/`
- User-approval actions: live 9Router/provider traffic, credentials or environment changes, external publication, commit, push, merge, destructive cleanup, and scope expansion
- Parallel ownership: none
- Sequential fallback: complete tasks in numeric order; Task 1 RED completion authorizes Task 2; later tasks require prior green verification

## Task Breakdown

### Task 1: Add RED replay and acceptance regressions

**Purpose:**
- Reproduce sanitized replay drift, unsuccessful projection eligibility, and final retry/fallback behavior before changing contracts.

**Task Function:**
- Add focused tests and predeclare experiment thresholds without implementing fixes.

**Template Profile:**
- Controller-selected: `unresolved while task is pending`
- Selection basis: bounded test-first correctness work.

**Validator Profile:**
- Controller-selected: `<none>`
- Selection basis: focused test runner and compile output.

**Specification Coverage:**
- Sanitized replay cannot erase current unrelated fields.
- Discarded pending/failed/incomplete attempts cannot qualify.
- Successful final retry/fallback may qualify when historical input remains compatible.
- Process-cache byte budget and hot-path noise/materiality thresholds are declared before implementation.

**Required Skills:**
- `skill-test-driven-development`
- `skill-code-standards`
- `skill-backend-verification`

**Files And Symbols:**
- Inspect: `components/adapters/codex/src/context-history/request-journal.ts:findCodexAcceptedInputProjection`
- Inspect: `components/adapters/codex/src/reduction.ts:applyBeforeCallReductionToPayload`, `reduceCodexRequestEnvelope`
- Modify: `components/adapters/codex/tests/context-history-journal.test.ts`
- Modify: `components/adapters/codex/tests/reduction.test.ts`
- Modify: `components/adapters/codex/tests/context-rebase-pipeline.test.ts`
- Modify: `components/adapters/codex/tests/upstream.test.ts`
- Add: `docs/superpowers/experiments/2026-10-10-stable-prefix-strategy.json`

**Dependencies:**
- Current `main` at `7e6c20724ea692428b1392120c087c331c942490`.
- Existing journal status, response IDs, and transport fixtures remain source of truth.

**Authority:**
- Preauthorized local actions: edit listed tests/manifest and run local Codex tests.
- Stop for: source-contract changes, live provider traffic, credentials, Git disposition, or unrelated failure requiring scope expansion.

**Steps:**
- [x] Add replay case where sanitized historical data would erase current `headers`/authorization-like field; assert current unrelated data survives or reuse declines.
- [x] Add pending, failed, incomplete, retry, compact-404 fallback, and unsupported-field retry cases; distinguish discarded candidates from successful final attempt.
- [x] Add successful request S followed by failed request F; assert next request reuses S and never F.
- [x] Declare `processProjectionMaxBytes`, `hotPathNoiseBand`, `hotPathAbsoluteThresholdMs`, and `hotPathRelativeThresholdPercent` in experiment manifest before implementation.
- [x] Run RED gate: tests compile, expected reproduced defects fail, no unrelated failure appears. Record RED evidence; this authorizes Task 2.

**Verification:**
- [x] `pnpm --dir components/adapters/codex test -- --test-name-pattern="replay|projection|accepted|fallback|upstream"`
- Expected: compile succeeds; targeted defects fail for expected reasons; unrelated tests pass.

**Exit Criteria:**
- RED gate recorded with exact failing assertions, successful compilation, no unrelated failure, and thresholds/byte budget written to experiment manifest before implementation; no Git commit required.

### Task 2: Build actual-attempt and acceptance boundary

**Purpose:**
- Make final transport attempt truth available before accepted replay, cache, and audit evidence are committed.

**Task Function:**
- Extend upstream runtime-only response evidence and unify stream/non-stream successful completion.

**Template Profile:**
- Controller-selected: `unresolved while task is pending`
- Selection basis: transport retry/fallback lifecycle and response identity risk.

**Validator Profile:**
- Controller-selected: `<none>`
- Selection basis: mock upstream and e2e tests cover attempt selection.

**Specification Coverage:**
- Final evidence exposes response-producing transport attempt, effective endpoint, resolved model, effective payload reference, status, and kind.
- Every transport attempt records only attempt ID, endpoint, resolved model, kind, whole-input digest, option digest, request bytes, status, and outcome.
- Only the response-producing attempt derives richer structural input data for replay, frontier, and provider usage attribution.
- `responseProducing` and `projectionEligible` are distinct.
- `projectionBoundary` is `ordinary_admission`, `explicit_compaction`, `rebase`, `cleaner_release`, or `other_rewrite`.
- Raw effective payload is runtime-only and never persisted.

**Required Skills:**
- `skill-backend-verification`
- `skill-test-driven-development`
- `skill-code-standards`

**Files And Symbols:**
- Inspect: `components/adapters/codex/src/upstream.ts:sendUpstreamRequest`, `requestUpstreamResponses`, `requestUpstreamResponsesStream`
- Inspect: `components/adapters/codex/src/proxy-runtime.ts:CodexForwardingAttempt`, stream/non-stream lifecycle
- Inspect: `components/adapters/codex/src/context-history/types.ts:CodexRequestJournalEntry`
- Modify: `components/adapters/codex/src/upstream.ts`
- Modify: `components/adapters/codex/src/proxy-runtime.ts`
- Modify: `components/adapters/codex/src/context-history/types.ts`
- Verify: `components/adapters/codex/tests/upstream.test.ts`, `components/adapters/codex/tests/e2e.test.ts`, `components/adapters/codex/tests/stream-observer.test.ts`

**Dependencies:**
- Task 1 RED gate passed.
- Existing retry/fallback payload transformations remain unchanged except for evidence capture.

**Authority:**
- Preauthorized local actions: edit upstream/runtime/types and mock/e2e tests.
- Stop for: persisting raw payload or secrets, changing provider request semantics, live traffic, credentials, or Git disposition.

**Steps:**
- [x] Add runtime-only attempt evidence to `UpstreamHttpResponse` and `UpstreamStreamResponse`: attempt ID, endpoint, resolved model, effective payload reference, status, kind, outcome, `responseProducing`, `projectionEligible`, and `projectionBoundary`.
- [x] Mark exactly one final response-producing transport attempt after completed response, including compact 404 fallback and unsupported-field retry.
- [x] Set `projectionEligible` true only for replay-compatible ordinary admission; keep explicit rewrite boundaries isolated even when response succeeds.
- [x] Add one `commitSuccessfulForwardingEvidence(...)` helper that consumes final attempt evidence and becomes sole entry point for accepted replay, process-cache insertion, actual-attempt audit, and future frontier input.
- [x] Call helper from stream and non-stream completion; keep discarded candidates in diagnostics only.

**Verification:**
- [x] `pnpm --dir components/adapters/codex test -- --test-name-pattern="upstream|fallback|unsupported|stream|e2e"`
- Expected: final fallback payload is identified; discarded attempts never seed accepted evidence; stream/non-stream use same completion contract.
- [x] `pnpm --dir components/adapters/codex run typecheck`
- Expected: no TypeScript errors.

**Exit Criteria:**
- Actual final attempt is known before acceptance; response production, projection eligibility, and rewrite boundary are explicit; raw payload remains process-only.

### Task 3: Implement verified replay and bounded process cache

**Purpose:**
- Turn accepted final-attempt evidence into safe durable replay and bounded in-process reuse.

**Task Function:**
- Add minimal replay recipe, safe journal recovery, cache promotion, byte bound, and LRU behavior.

**Template Profile:**
- Controller-selected: `unresolved while task is pending`
- Selection basis: persistence/schema correctness with secret-handling risk.

**Validator Profile:**
- Controller-selected: `<none>`
- Selection basis: journal/reduction tests and package typecheck.

**Specification Coverage:**
- Recipe stores stable identity, occurrence, LightRSI-owned source fingerprints, replacement operations, owned-field accepted fingerprints, sanitized structural fingerprint, and authoritative attempt ID attached only at commit.
- No verification digest over unsanitized complete item.
- Legacy unsafe replay declines instead of guessing.
- Process cache has declared entry/byte bounds and LRU promotion/eviction.

**Required Skills:**
- `skill-test-driven-development`
- `skill-code-standards`
- `skill-backend-verification`

**Files And Symbols:**
- Inspect: `components/adapters/codex/src/context-history/types.ts:CodexRequestJournalEntry`
- Inspect: `components/adapters/codex/src/context-history/journal-store.ts`
- Inspect: `components/adapters/codex/src/context-history/replayability.ts:codexForwardingFingerprint`, `codexMatchForwardedPrefix`
- Inspect: `components/adapters/codex/src/reduction.ts:cacheCodexAcceptedInputProjection`, `rememberProcessProjection`
- Modify: `components/adapters/codex/src/context-history/types.ts`
- Modify: `components/adapters/codex/src/context-history/journal-store.ts`
- Modify: `components/adapters/codex/src/context-history/request-journal.ts`
- Modify: `components/adapters/codex/src/context-history/replayability.ts`
- Modify: `components/adapters/codex/src/context-history/effective-history.ts`
- Modify: `components/adapters/codex/src/reduction.ts`
- Verify: `components/adapters/codex/tests/context-history-journal.test.ts`, `components/adapters/codex/tests/reduction.test.ts`, `components/adapters/codex/tests/context-rebase-pipeline.test.ts`

**Dependencies:**
- Task 2 final-attempt/acceptance boundary.
- Task 1 manifest declares process-cache byte budget before implementation.

**Authority:**
- Preauthorized local actions: edit listed journal/replay/reduction files and tests; run Codex typecheck/focused tests.
- Stop for: credential persistence, sanitizer removal, second cache service, live traffic, or Git disposition.

**Steps:**
- [x] Generate provisional owned-path recipe from local transformation, but attach authoritative attempt ID only inside successful completion commit.
- [x] Apply recipe to current incoming item; verify identity and target-path source state, apply owned replacements, preserve unrelated fields, and verify resulting owned fields.
- [x] Reject missing path, source mismatch, ambiguity, unsupported legacy shape, or digest mismatch; reduce normally after rejection.
- [x] Persist sanitized diagnostics separately from replay evidence and keep raw payload out of journal.
- [x] Promote validated journal projection into same process cache.
- [x] Enforce current entry limit, manifest-declared byte limit, and LRU eviction using stored projection bytes.

**Verification:**
- [x] `pnpm --dir components/adapters/codex run typecheck`
- Expected: no TypeScript errors.
- [x] `pnpm --dir components/adapters/codex test -- --test-name-pattern="journal|replay|reduction|projection|context rebase"`
- Expected: Task 1 defects turn green; unrelated behavior remains unchanged.

**Exit Criteria:**
- Accepted replay uses only final eligible attempt evidence, preserves unrelated current fields, declines unsafe legacy data, and obeys declared count/byte/LRU limits.

### Task 4: Prove lineage through existing response journal

**Purpose:**
- Allow linear response-head continuation without weakening branch, endpoint, rebase, or configuration isolation.

**Task Function:**
- Add narrow ancestry lookup over existing response journal; do not create a second lineage graph.

**Template Profile:**
- Controller-selected: `unresolved while task is pending`
- Selection basis: ancestry proof with single-source-of-truth constraint.

**Validator Profile:**
- Controller-selected: `<none>`
- Selection basis: existing continuation/rebase tests cover required branches.

**Specification Coverage:**
- Accepted projection stores accepted-at response/head identifier.
- Existing response journal stores ancestry edges.
- Linear descent reuses; unrelated branch, endpoint change, rebase epoch change, incompatible cache contract, and ambiguous ancestry reject.

**Required Skills:**
- `skill-backend-verification`
- `skill-test-driven-development`

**Files And Symbols:**
- Inspect: `components/adapters/codex/src/context-history/replayability.ts:CodexForwardingScope`, `scopeFingerprint`, `codexMatchForwardedPrefix`
- Inspect: `components/adapters/codex/src/proxy-runtime.ts:forwardingScope`
- Inspect: `components/adapters/codex/src/context-history/request-journal.ts:requestIdentityMatches`
- Inspect: `components/adapters/codex/src/context-history/effective-history.ts:previousResponseId`, `findLastResponse`, committed response-chain traversal
- Modify: `components/adapters/codex/src/context-history/replayability.ts`
- Modify: `components/adapters/codex/src/context-history/request-journal.ts`
- Modify: `components/adapters/codex/src/proxy-runtime.ts`
- Modify: `components/adapters/codex/src/context-history/types.ts`
- Verify: `components/adapters/codex/tests/context-provider-continuation.test.ts`, `components/adapters/codex/tests/context-rebase-pipeline.test.ts`, `components/adapters/codex/tests/proxy-wire-prefix.test.ts`

**Dependencies:**
- Task 2 authoritative response/head association.
- Task 3 accepted projection record.

**Authority:**
- Preauthorized local actions: edit listed scope/journal/runtime files and focused tests.
- Stop for: new lineage store/graph, removal of branch isolation, weakened endpoint/rebase checks, live traffic, or Git disposition.

**Steps:**
- [x] Remove raw `previous_response_id` from strict structural scope while retaining it as lineage evidence.
- [x] Store accepted-at head ID with projection; query ancestry from existing response journal.
- [x] Permit reuse only when current head descends from accepted-at head, occurrences match, and strict scope matches.
- [x] Reject unrelated branch, missing/ambiguous ancestry, endpoint/rebase/config mismatch.

**Verification:**
- [x] `pnpm --dir components/adapters/codex test -- --test-name-pattern="continuation|rebase|scope|branch|lineage"`
- Expected: linear `resp-A` → `resp-B` → `resp-C` reuse succeeds; unrelated branch and `scope_mismatch` reject.

**Exit Criteria:**
- One existing journal remains lineage source of truth; linear continuation works without false scope misses.

### Task 5: Separate structural candidate from provider cache evidence

**Purpose:**
- Make audit diagnosis explicit about structural matching versus provider hit/miss/unknown.

**Task Function:**
- Change stabilizer contract and adapter diagnosis without conflating absent telemetry with zero.

**Template Profile:**
- Controller-selected: `unresolved while task is pending`
- Selection basis: small contract correction with persisted/reporting impact.

**Validator Profile:**
- Controller-selected: `<none>`
- Selection basis: stabilizer and adapter audit tests cover all outcome states.

**Specification Coverage:**
- `cacheFamilyId` is logical grouping only.
- Initial wire prefix hash is compatibility evidence, not full-history proof.
- Structural candidate is `matched | unmatched | none`.
- Provider cache evidence is `hit | miss | unknown`; absent/null usage is `unknown`, explicit zero is `miss`.

**Required Skills:**
- `skill-backend-verification`
- `skill-code-standards`

**Files And Symbols:**
- Inspect: `components/packages/features/stabilizer/src/cache-audit-store.ts:CacheAuditRecord`
- Inspect: `components/packages/features/stabilizer/src/cache-audit-diagnosis.ts:diagnoseCacheAudit`, `CacheAuditDiagnosis`
- Inspect: `components/adapters/codex/src/cache-audit.ts`
- Inspect: `components/adapters/codex/src/router-cache-telemetry.ts`
- Modify: `components/packages/features/stabilizer/src/cache-audit-diagnosis.ts`
- Modify: `components/packages/features/stabilizer/src/cache-audit-store.ts`
- Modify: adapter audit mapping/tests without deleting persisted compatibility fields
- Verify: `components/packages/features/stabilizer/tests/cache-audit-store.test.ts`, `components/adapters/codex/tests/cache-audit.test.ts`, `components/adapters/codex/tests/benchmark-timing.test.ts`

**Dependencies:**
- Task 4 strict identity and lineage rules.
- Cache Frontier fields wait until this contract is explicit.

**Authority:**
- Preauthorized local actions: edit audit contracts/diagnosis/tests and compatible labels.
- Stop for: provider billing claims, deleting persisted fields, live traffic, credentials, or Git disposition.

**Steps:**
- [x] Add separate structural-candidate and provider-cache-evidence fields or equivalent discriminated contract.
- [x] Preserve explicit zero as measured miss/cold result; map absent/null provider usage to `unknown`.
- [x] Keep family identity, initial prefix, structural frontier, and provider telemetry separately named/documented.
- [x] Add tests for warm hit, explicit cold miss, absent telemetry, unmatched structural candidate, and no candidate.

**Verification:**
- [x] `pnpm --dir components/packages/features/stabilizer run typecheck`
- Expected: no TypeScript errors.
- [x] `pnpm --dir components/packages/features/stabilizer test`
- Expected: all stabilizer audit tests pass.
- [x] `pnpm --dir components/adapters/codex test -- --test-name-pattern="cache audit|cache|unknown|telemetry"`
- Expected: absent provider usage is `unknown`; explicit zero remains measured miss.

**Exit Criteria:**
- Structural and provider outcomes are separate contracts; no report turns missing telemetry into provider miss.

### Task 6: Merge exact compatibility and bounded Cache Frontier

**Purpose:**
- Compare only truly compatible successful attempts while keeping frontier telemetry transient and bounded.

**Task Function:**
- Compute compatibility identity first, compare ordered history transiently, and persist aggregate frontier evidence only.

**Template Profile:**
- Controller-selected: `unresolved while task is pending`
- Selection basis: structural comparison, schema cost, and hot-path overhead.

**Validator Profile:**
- Controller-selected: `<none>`
- Selection basis: deterministic audit tests and forwarding benchmark.

**Specification Coverage:**
- Compatibility identity includes effective model, configured endpoint, observed route/provider identity, ordered tools, and cache-affecting options.
- Frontier compares ordered inputs only after compatibility passes.
- Frontier comparison domain and persisted digest domain are explicit; sanitized history never proves exact unsanitized wire equality.
- Persist bounded aggregate: compatibility digest, previous attempt ID, previous/current item counts, first changed index, append-only flag, unchanged bytes/chars, current input digest, change class, component drift.
- Do not persist complete per-item digest sequence in every audit record.
- Do not persist unsanitized whole-input verification digests or tokenize hot path; estimate tokens in reporting, Cleaner preview, or existing provider estimate.

**Required Skills:**
- `skill-performance-optimization`
- `skill-backend-verification`
- `skill-test-driven-development`

**Files And Symbols:**
- Inspect: `components/adapters/codex/src/stable-prefix.ts:cacheRelevantRequestOptionFingerprints`
- Inspect: `components/adapters/codex/src/cache-audit.ts`
- Inspect: `components/packages/features/stabilizer/src/cache-audit-store.ts:CacheAuditRecord`
- Inspect: `components/adapters/codex/src/proxy-runtime.ts:actual-attempt audit commit`
- Inspect: `components/adapters/codex/scripts/benchmark-forwarding.ts`
- Modify: `components/adapters/codex/src/cache-audit.ts`
- Modify: `components/packages/features/stabilizer/src/cache-audit-store.ts`
- Modify: `components/adapters/codex/src/proxy-runtime.ts`
- Modify: `components/adapters/codex/scripts/benchmark-forwarding.ts` only to exercise matched frontier-enabled/disabled cases and report frontier/journal cost separately
- Verify: `components/adapters/codex/tests/cache-audit.test.ts`, `components/adapters/codex/tests/stable-prefix.test.ts`, `components/packages/features/stabilizer/tests/cache-audit-store.test.ts`, `components/adapters/codex/tests/proxy-wire-prefix.test.ts`

**Dependencies:**
- Task 2 actual-attempt evidence.
- Task 4 ancestry and Task 5 outcome contract.
- Existing option fingerprint machinery; no second normalization subsystem.

**Authority:**
- Preauthorized local actions: edit audit/frontier storage and tests; run local benchmark/typecheck.
- Stop for: full digest-sequence persistence, hot-path tokenization, cache-control service, live traffic, or Git disposition.

**Steps:**
- [x] Calculate compatibility digest from effective model, endpoint, route/provider identity when known, ordered tools, and existing cache-relevant option fingerprints.
- [x] For response-producing eligible attempts only, derive ordered input digests transiently and compare against previous compatible successful attempt.
- [x] Persist only bounded aggregate frontier fields; recover prior item data from existing authoritative journal when restart requires it.
- [x] On restart, report frontier `unknown` when authoritative comparison data cannot be recovered safely; never infer exact wire equality from sanitizer-removed fields.
- [x] Record component drift for instructions/tools/options/history and keep provider evidence separate.
- [x] Add regression matrix for model, endpoint, tool order, reasoning effort, parallel tool settings, response format, verbosity, and compaction changes.
- [x] Captured forwarding baseline; deferred matched frontier-enabled/disabled overhead until benchmark exposes paired modes; no precise tokenization on every request.

**Verification:**
- [x] `pnpm --dir components/adapters/codex test -- --test-name-pattern="cache audit|frontier|stable prefix|router telemetry"`
- Expected: compatible append-only history reports frontier; historical mutation reports first change; incompatible pairs do not compare.
- [x] `pnpm --dir components/adapters/codex run bench:forwarding`
- Expected: local benchmark reports forwarding/reduction metrics; frontier correctness comes from focused integration tests, while paired frontier-overhead measurement remains deferred until benchmark modes expose it.

**Exit Criteria:**
- Exact compatibility and structural frontier share one bounded evidence path; storage is aggregate, restart uncertainty is honest, tokenization is deferred, and no provider-cache claim is made. Correctness passes; any material overhead is recorded as unresolved for Task 8 rather than blocking later evidence.

### Task 7: Expose advisory frontier and run matched experiments

**Purpose:**
- Feed structural evidence into actual Codex Cleaner preview, then prove stream/restart/lineage behavior before approved 9Router/provider experiments.

**Task Function:**
- Keep generic Cleaner contract neutral, populate it from Codex bridge, and run local/live evidence in that order.

**Template Profile:**
- Controller-selected: `unresolved while task is pending`
- Selection basis: cross-package contract, adapter owner, benchmarks, and external dependency.

**Validator Profile:**
- Controller-selected: `<none>`
- Selection basis: Cleaner bridge tests, full package checks, and reproducible reports.

**Specification Coverage:**
- Generic preview carries optional earliest changed item, reusable prefix count/bytes/chars, structural risk, observed cache-read, and provider outcome.
- `components/adapters/codex/src/context-cleaner/bridge.ts:previewCleanRelease` populates Codex-specific frontier fields.
- Preview remains advisory; high structural risk never automatically rejects release.
- Local matched cases precede approved 9Router/provider experiment.
- 9Router transformation, resolved route/model/cache namespace, provider usage, and LightRSI frontier remain separate.

**Required Skills:**
- `skill-backend-verification`
- `skill-performance-optimization`
- `skill-verification-before-completion`

**Files And Symbols:**
- Inspect: `components/packages/features/cleaner/src/contracts.ts:CacheReleasePreview`
- Inspect: `components/packages/features/cleaner/src/orchestrator.ts:previewContextCleanRelease`
- Inspect: `components/adapters/codex/src/context-cleaner/bridge.ts:previewCleanRelease`
- Inspect: `components/products/cli/src/clean-renderer.ts:renderCleanPreview`
- Inspect: `components/adapters/codex/scripts/benchmark-forwarding.ts`
- Inspect: `components/adapters/codex/scripts/report-cache-audit-codex.ts`
- Inspect: `components/adapters/codex/tests/context-rebase-provider-smoke.test.ts`, `router-cache-telemetry.test.ts`, `upstream.test.ts`
- Modify: `components/packages/features/cleaner/src/contracts.ts`
- Modify: `components/adapters/codex/src/context-cleaner/bridge.ts`
- Modify: `components/products/cli/src/clean-renderer.ts`
- Modify: `docs/superpowers/experiments/2026-10-10-stable-prefix-strategy.json`
- Verify: `components/packages/features/cleaner/tests/orchestrator.test.ts`, Codex context-cleaner bridge/occurrence acceptance tests, `components/products/cli/tests/clean.test.ts`

**Dependencies:**
- Tasks 1–6 complete.
- Frontier aggregate fields and provider `unknown` contract are available.
- Existing Cleaner approval/execution predicates remain unchanged.

**Authority:**
- Preauthorized local actions: edit listed Cleaner/Codex/CLI files, run mock/local benchmarks, and write experiment artifacts.
- Stop for: automatic release rejection, provider prediction, live 9Router/provider traffic without approval, credentials, external writes, or Git disposition.

**Steps:**
- [x] Add optional frontier fields to generic `CacheReleasePreview` without moving provider knowledge into generic orchestration.
- [x] Populate fields from Codex bridge using structural evidence; preserve existing saved-byte, transport, and `providerCacheOutcome` behavior.
- [x] Render structural exposure/risk separately from provider cache evidence.
- [x] Add matched local cases for stream/non-stream, restart, journal recovery, linear head advancement, unrelated branch, endpoint/rebase change, historical mutation, compact 404, and unsupported-field retry.
- [x] Inspect 9Router handling of `prompt_cache_retention`, `prompt_cache_key`, `prompt_cache_options`, resolved model/route, and telemetry without changing defaults.
- [x] Deferred GPT-5.6+ three-arm live experiment because no approved clean-SHA run with complete comparable provider usage was available; economics remain `inconclusive`.
- [x] Measured available local correctness, forwarding latency, allocation, and structural-frontier evidence separately; provider cache-read, cache-write, TTFT, and economics remain deferred/inconclusive without an approved comparable live run.
- [x] Mark economics `inconclusive` when provider usage, cache evidence, correctness, provider identity, clean-SHA state, or pair comparability is incomplete.

**Verification:**
- [x] `pnpm --dir components/packages/features/cleaner run typecheck`
- Expected: no Cleaner type errors.
- [x] `pnpm --dir components/packages/features/cleaner test`
- Expected: preview remains advisory and bridge-populated fields round-trip.
- [x] `pnpm --dir components/products/cli run typecheck`
- Expected: no CLI type errors.
- [x] `pnpm --dir components/products/cli test`
- Expected: rendered preview preserves unknown provider outcome.
- [x] `pnpm --dir components/adapters/codex run bench:forwarding`
- Expected: forwarding benchmark reports only forwarding/reduction overhead; restart, lineage, stream completion, and retry/fallback evidence comes from named integration tests below.
- [x] `pnpm --dir components/adapters/codex test -- --test-name-pattern="context-cleaner|continuation|rebase|stream|fallback|unsupported|frontier"`
- Expected: named integration cases prove restart, lineage, stream completion, retry/fallback, and frontier behavior; reduction-only benchmark output is not treated as integration proof.

**Exit Criteria:**
- Codex bridge supplies advisory frontier preview; local matrix passes; approved live experiment is complete or explicitly inconclusive; no cache-key default changes without paired evidence.

### Task 8: Apply one measured optimization or no-op

**Purpose:**
- Optimize cloning, journal lookup, compact probing, or another hotspot only when predeclared thresholds and fresh measurements justify it.

**Task Function:**
- Compare before/after evidence and make one minimal change, or record no source change.

**Template Profile:**
- Controller-selected: `unresolved while task is pending`
- Selection basis: measured performance work with correctness gates.

**Validator Profile:**
- Controller-selected: `<none>`
- Selection basis: before/after benchmark and full regression suite.

**Specification Coverage:**
- Use manifest-declared noise band and absolute/relative materiality thresholds.
- Preserve replay, acceptance, lineage, cache, frontier, and unknown semantics.
- No speculative optimization or new dependency.

**Required Skills:**
- `skill-performance-optimization`
- `skill-test-driven-development`
- `skill-verification-before-completion`

**Files And Symbols:**
- Inspect: Task 7 benchmark report and `components/adapters/codex/src/reduction.ts`, `components/adapters/codex/src/context-history/request-journal.ts`, `components/adapters/codex/src/upstream.ts`
- Modify: only one measured hotspot file identified by Task 7 evidence
- Verify: affected focused test and `components/adapters/codex/scripts/benchmark-forwarding.ts`

**Dependencies:**
- Task 7 complete with fresh baseline, declared thresholds, and named hotspot.
- If regression does not exceed noise band and absolute/relative threshold, make no source change.

**Authority:**
- Preauthorized local actions: edit one measured hotspot and focused test, then run before/after local benchmark and full regression checks.
- Stop for: speculative optimization, semantic changes, new dependency, live provider traffic, commit/push, or more than one hotspot.

**Steps:**
- [x] Compared available latency, allocations/bytes, transport behavior, and replay correctness against predeclared thresholds; frontier-overhead comparison remains deferred because paired modes do not exist.
- [x] Recorded no-op: paired frontier baseline and material hotspot evidence did not exist, so no optimization was applied.
- [x] Existing focused regression coverage validates implemented frontier and cache behavior; no new optimization logic was added.
- [x] Recorded deferred frontier-overhead measurement and live economics as explicit evidence-backed outcomes.

**Verification:**
- [x] `pnpm --dir components/adapters/codex test`
- Expected: full adapter suite passes.
- [x] `pnpm --dir components/adapters/codex run bench:forwarding`
- Expected: target metric improves without replay/frontier correctness regression, or report records justified no-op; final verification rejects unresolved material overhead.

**Exit Criteria:**
- One measured hotspot is improved and verified, or no source change is made because declared gates do not pass.

## Execution Evidence

- Review-1 completed before execution; four justified findings were patched:
  frontier benchmark gates are separate from integration proof, restart frontier
  becomes `unknown` without safe comparison data, measurement is separate from
  acceptance, and no-commit wording matches execution policy.
- Implementation completed for actual-attempt acceptance, sanitized replay
  recipes, response-head lineage, bounded process projection cache, structural
  frontier aggregates, provider evidence `unknown`, Cleaner preview fields, and
  CLI rendering.
- Fresh validation passed: Codex typecheck; stabilizer, Cleaner, and CLI
  typechecks; Codex `512/512`; stabilizer `53/53`; Cleaner `61/61`; CLI `37/37`;
  `git diff --check`.
- Forwarding benchmark completed for `long-history`, `below-threshold`, and
  `nested-block` at concurrency `1`, `4`, and `16`. Benchmark reports forwarding
  and reduction metrics only; `physicalUpstreamAttempts` and `journalCostMs`
  remain `0` in this local harness.
- Task 8 is a justified no-op: no comparable frontier-enabled/frontier-disabled
  baseline exists, so no hotspot or material improvement can be claimed. Frontier
  overhead measurement is deferred until paired benchmark modes exist.
- Before approval, live 9Router/provider economics were `inconclusive`; no
  credentials, raw payloads, or provider cache claims were added.
- Approved live probe completed after comparator correction. Report:
  `C:\tmp\lightrsi-stable-prefix-live-final.json`; sanitized summary:
  `C:\tmp\lightrsi-stable-prefix-live-summary.json`.
- Live result: 5 repetitions × 5 fixtures × 2 arms, 25/25 comparable pairs,
  50/50 runs complete, correctness `pass`, usage `complete`, economics `pass`,
  pinned provider `cx/gpt-5.6-luna`, clean SHA
  `552dcc569509acb194d0102db294ff20011849a7`, observed cost `$1.5834364` under
  `$10.00` cap.
- Impact: baseline estimated cost `$0.572374`; Cleaner `$0.6712908`; marginal
  Cleaner delta `+$0.0989168` for this batch. Cleaner input tokens decreased by
  `9,394` overall, but cached input tokens decreased by `120,832`, so provider
  economics worsened despite lower uncached input. Aggregate p50 handler latency
  rose `1176.97ms → 1212.92ms`; p95 rose `1877.88ms → 1916.58ms`.
- Root cause found during probe: late-fixture comparability used fixed
  `after_release_a`, but lifecycle Cleaner release starts at `release_b`. This
  falsely marked valid pairs incomparable. Patched shared
  `providerShapesComparableBeforeRelease`, added late-boundary regression, and
  verified focused benchmark tests `24/24`.
- Full Codex suite rerun passed `512/512`; standalone `install.test.ts` passed
  `13/13`. One earlier full-suite attempt reported a file-level install failure
  without test-level diagnostics; rerun did not reproduce it, so no product
  change was made for that transient harness result.
- Independent PR review found and reproduced three Important defects. Patched
  hot projection reuse to require matching response lineage, journal replay to
  require a final response-producing ordinary eligible attempt, and stream and
  non-stream frontier calculation to finalize attempt eligibility before audit.
  Added regressions for branch isolation, rejected Cleaner release evidence,
  and ordinary cold-then-warm frontier status.

## Verification

Final artifact verification:

- `pnpm --dir components/adapters/codex run typecheck`
- `pnpm --dir components/adapters/codex test`
- `pnpm --dir components/packages/features/stabilizer run typecheck`
- `pnpm --dir components/packages/features/stabilizer test`
- `pnpm --dir components/packages/features/cleaner run typecheck`
- `pnpm --dir components/packages/features/cleaner test`
- `pnpm --dir components/products/cli run typecheck`
- `pnpm --dir components/products/cli test`
- `pnpm --dir components/adapters/codex run bench:forwarding`
- `git diff --check`
- `git status --short --branch`

Expected final state: all touched packages pass, RED regressions are green,
accepted evidence comes only from final eligible attempts, verified replay keeps
unrelated current fields, linear lineage works while branch isolation holds,
provider absence remains `unknown`, frontier storage is bounded aggregate data,
Cleaner guidance is advisory, and live economics is `inconclusive` when evidence
is incomplete.

## Completion Criteria

The plan is ready for completion verification when:

1. all eight task outcomes are satisfied or explicitly recorded as deferred by evidence
2. replay, acceptance, lineage, cache, telemetry, frontier, Cleaner, and benchmark tests pass
3. no raw credential, authorization value, or unsanitized whole-item digest is persisted
4. no second lineage graph, cache service, or full digest-sequence telemetry store exists
5. 9Router/provider evidence remains separate from LightRSI structural evidence
6. no cache-key/default policy changes without matched comparable results
7. final verification is fresh and covers every touched package
8. scope deviations, blockers, inconclusive economics, and deferred optimization are recorded

Execution is approved and complete. Deferred live economics and Task 8 no-op are
explicit evidence-backed outcomes, not unresolved required implementation work.
