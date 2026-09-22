---
layer: change
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: proposed
name: lightrsi-p0-closure-historical-read-optimization
targets:
  - components/packages/features/reduction/src/reduction/tool-payload-router.ts
  - components/packages/features/reduction/src/reduction/read-state-compaction.ts
  - components/packages/features/reduction/src/reduction/recovery-exemptions.ts
  - components/packages/features/reduction/src/reduction/types.ts
  - components/packages/features/reduction/src/reduction/content-classifier.ts
  - components/packages/features/reduction/src/analyzers/read-state-compaction-analyzer.ts
  - components/packages/features/reduction/src/passes/pass-tool-payload-trim.ts
  - components/packages/features/reduction/src/passes/pass-exec-output-truncation.ts
  - components/packages/features/reduction/src/passes/pass-read-state-compaction.ts
  - components/adapters/codex/src/reduction.ts
  - components/packages/features/reduction/scripts/bench-hotspots.mjs
  - components/adapters/codex/scripts/benchmark-forwarding.ts
---

# LightRSI P0 Closure and Historical Read Optimization

## Goal

Close remaining P0 protocol-compression gaps on top of merged main, remove the
large-JSON minification regression, and replace duplicated quadratic historical
read classification with one request-local linear classifier. Preserve existing
copy-on-write publication, legacy-handler compatibility, recovery behavior, and
provider payload shape.

## Implementation Outcomes

### P0 protocol closure

- JSON routing stops lossless lexical minification once the configured budget is
  exceeded and reuses the classifier's parsed value for lossy summaries.
- Recovery-marked content bypasses every destructive reduction pass, including
  exec-output truncation and read-state compaction.
- Log summaries retain distinct severity-ranked failures, associated stack
  frames, and final status lines.
- Read-window metadata survives adapter decoding and routing, including explicit
  `offset: 0`.
- Diff summaries describe omission and lossiness; only successful archival adds
  authoritative recovery metadata.
- Archival occurs only after final replacement text passes positive net-savings
  and recovery-hint validation.

### Historical read optimization

- `read-state-compaction.ts` owns structural event classification.
- Analyzer and passes consume the same classification result; no second
  structural classifier remains.
- Reverse scanning preserves exact existing state, reason, triggering index,
  resource case sensitivity, and read-window identity.
- Request-local reuse and indexed segment lookup remove repeated work without
  persistent caches or new lifecycle ownership.

### Proof

- Existing copy-on-write and legacy mutation semantics remain unchanged.
- Focused fidelity, recovery, idempotency, and protected-field tests pass.
- Historical classification is equivalence-tested and demonstrates linear
  scaling on repeated-resource fixtures.
- Codex-path benchmarks report p50/p95, output digest, saved tokens/chars,
  changed-item/block counts, GC evidence, and clearly labeled heap/allocation
  proxies on identical workloads.

## Non-Goals

- No second compression router, generalized fidelity engine, transaction
  framework, persistent compression cache, or Context Cleaner redesign.
- No `JSON.parse()` → `JSON.stringify()` replacement for lexical minification.
- No broadening of Codex historical-rewrite eligibility solely to make the
  classifier benchmark larger.
- No deletion of `contentHashes` until external-contract ownership is verified.
- No edits to existing user changes in `README.md`.

## Execution Approach

- Mode: `inline sequential`
- Coordination: `git-tracked`
- Required skills: `skill-performance-optimization`, `skill-backend-verification`, `skill-test-driven-development`, `skill-verification-before-completion`, `skill-code-standards`, `ponytail:ponytail`
- Isolation: `optional worktree`
- Commit policy: `no commits during execution`
- Preauthorized local actions: inspect source and history, create an isolated worktree from `origin/main`, edit named source/tests/scripts, run declared local tests/typechecks/benchmarks, and run configured mock/provider probes without logging payloads or credentials
- User-approval actions: push, merge, provider writes, credential changes, destructive cleanup, and discarding the pre-existing `README.md` change
- Parallel ownership: `none`; pipeline contracts, adapter bindings, passes, classifier, and benchmarks share behavior and require ordered integration
- Sequential fallback: baseline and equivalence probes → protocol safety → canonical classifier → request-local reuse → comparative verification

## Coordination State

- Coordination owner: `single lead controller`
- Coordination schema: `2`
- Branch: `codex/lightrsi-p0-closure-historical-read-optimization`
- Base commit: `272f544d140ac3d6a86bd9cdd8c4ea13330aa19c`
- Expected workspace: new worktree from `origin/main`; preserve current workspace `README.md` modification untouched
- Next action: create isolated worktree and run baseline tests/probes
- Blockers: none

| Task | State | Workspace | Executor | Depends On | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Task 1 | `pending` | new worktree | `unresolved` | none | baseline tests and regression probes | pending |
| Task 2 | `pending` | new worktree | `unresolved` | Task 1 | JSON and recovery tests | pending |
| Task 3 | `pending` | new worktree | `unresolved` | Task 2 | route fidelity and archive-order tests | pending |
| Task 4 | `pending` | new worktree | `unresolved` | Task 1 | classifier equivalence tests | pending |
| Task 5 | `pending` | new worktree | `unresolved` | Task 4 | scaling and Codex-path benchmarks | pending |
| Task 6 | `pending` | new worktree | `unresolved` | Tasks 2–5 | full verification and review package | pending |

## Task Breakdown

### Task 1: Baseline integrated mainline behavior

**Purpose:** Establish current behavior from merged main and capture reproducible
regressions before editing shared reduction code.

**Task Function:** Characterize current performance and protocol behavior.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: direct repository work with shared contracts and moderate performance risk

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: lead controller owns baseline evidence

**Specification Coverage:** Preserve merged copy-on-write, legacy-handler
success publication, protected provider fields, and current Codex eligibility.

**Required Skills:** `skill-performance-optimization`, `skill-backend-verification`

**Files And Symbols:**
- Inspect: `components/packages/features/reduction/src/reduction/pipeline.ts:runReductionBeforeCall`
- Inspect: `components/adapters/codex/src/reduction.ts:applyBeforeCallReductionToPayload`
- Inspect: `components/packages/features/reduction/scripts/bench-hotspots.mjs`
- Verify: `components/packages/features/reduction/tests`, `components/adapters/codex/tests`

**Dependencies:** `origin/main` at `272f544d140ac3d6a86bd9cdd8c4ea13330aa19c`.

**Authority:**
- Preauthorized local actions: create worktree, inspect source/history, run baseline checks and synthetic probes
- Stop for: base commit mismatch, dirty new worktree, missing required package dependency, or unsafe payload logging

**Steps:**
- [ ] Create worktree from `origin/main`; confirm no conflict with current workspace changes.
- [ ] Run focused reduction tests and both package typechecks before edits.
- [ ] Reproduce JSON router timing at 100 KB, 1 MB, and 5 MB with identical warmup/sample counts.
- [ ] Run read-classification fixtures at 1,000, 2,000, 4,000, and 8,000 events; record p50 and p95.
- [ ] Record current Codex eligible-segment count and whether `read_state_compaction` instructions are emitted.

**Verification:**
- [ ] `pnpm --dir components/packages/features/reduction test`
- [ ] `pnpm --dir components/packages/features/reduction run typecheck`
- [ ] `pnpm --dir components/adapters/codex test`
- [ ] `pnpm --dir components/adapters/codex run typecheck`
- Expected: baseline checks pass or failures are recorded before edits; probes emit no raw payloads.

**Exit Criteria:** Baseline outputs, timing samples, and known environment limits
are recorded; merged mainline semantics are pinned.

### Task 2: Bound JSON work and close recovery exemptions

**Purpose:** Remove the large-JSON regression and prevent recovery content from
being destructively reduced.

**Task Function:** Implement bounded routing and shared recovery gating.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: narrow source changes with high correctness impact

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: focused tests cover all touched branches

**Specification Coverage:** Budget-aware lexical minification, parsed-value reuse,
recovery exemption, positive final savings, and no production deep-freeze.

**Required Skills:** `skill-test-driven-development`, `skill-backend-verification`, `ponytail:ponytail`

**Files And Symbols:**
- Modify: `components/packages/features/reduction/src/reduction/tool-payload-router.ts:minifyJsonLossless`
- Modify: `components/packages/features/reduction/src/reduction/tool-payload-router.ts:summarizeJsonTextWithContext`
- Add: `components/packages/features/reduction/src/reduction/recovery-exemptions.ts:isRecoveryExemptSegment`
- Modify: `components/packages/features/reduction/src/passes/pass-tool-payload-trim.ts:toolPayloadTrimPass`
- Modify: `components/packages/features/reduction/src/passes/pass-exec-output-truncation.ts:execOutputTruncationPass`
- Modify: `components/packages/features/reduction/src/passes/pass-read-state-compaction.ts:readStateCompactionPass`
- Verify: `components/packages/features/reduction/tests/tool-payload-router.test.ts`
- Verify: `components/packages/features/reduction/tests/tool-payload-trim-recovery.test.ts`

**Dependencies:** Task 1 baseline.

**Authority:**
- Preauthorized local actions: edit listed reduction/router/pass files and focused tests; run local checks
- Stop for: lexical preservation failure, recovery text mutation, archive failure before publication, or need for a new transaction abstraction

**Steps:**
- [ ] Add an output-budget stop to lexical minification; return a bounded result only when it fits, otherwise route directly to the existing parsed-value summary.
- [ ] Ensure classifier-provided parsed JSON reaches the summary path without a second parse.
- [ ] Centralize the existing recovery predicates in `recovery-exemptions.ts`, reusing artifact-store predicates; apply the gate before every destructive pass.
- [ ] Build final replacement/stub and recovery hint before archive scheduling; skip archive and publication when final net savings are non-positive.
- [ ] Keep archive success as the only source of authoritative recovery metadata.

**Verification:**
- [ ] Add tests for duplicate JSON keys, large numeric lexemes, escaped strings, under-budget minification, over-budget fallback, and parsed-value reuse.
- [ ] Add tests proving recovery-marked exec output, tool output, and read-state content remain byte-for-byte unchanged.
- [ ] Add tests proving archive failure leaves original content published and repeated application is idempotent.
- Expected: no recovery payload is retrimmed; large over-budget JSON avoids full output construction; publication follows successful archival only.

**Exit Criteria:** JSON regression is bounded; all destructive passes honor recovery exemptions and final net-savings checks.

### Task 3: Complete protocol-aware route fidelity

**Purpose:** Preserve evidence required by logs, reads, and diffs while keeping
lossy summaries explicit and recoverable only after archival.

**Task Function:** Correct route classification, metadata propagation, and
publication semantics.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: cross-module contract work with protocol fidelity risk

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: route-specific regression fixtures provide direct proof

**Specification Coverage:** Fatal-error retention, explicit read windows, diff
fidelity, and protected structured fields.

**Required Skills:** `skill-backend-verification`, `skill-test-driven-development`

**Files And Symbols:**
- Modify: `components/packages/features/reduction/src/reduction/tool-payload-router.ts:summarizeLogOutput`
- Modify: `components/packages/features/reduction/src/reduction/tool-payload-router.ts:summarizeDiffOutput`
- Modify: `components/packages/features/reduction/src/reduction/content-classifier.ts:ToolPayloadHint`
- Modify: `components/adapters/codex/src/reduction.ts:segmentForText`
- Modify: `components/adapters/codex/src/reduction.ts:buildTurnContext`
- Verify: `components/packages/features/reduction/tests/tool-payload-router.test.ts`
- Verify: `components/adapters/codex/tests/reduction.test.ts`

**Dependencies:** Task 2.

**Authority:**
- Preauthorized local actions: edit named router/types/adapter files and route tests; run mock boundary probes
- Stop for: provider envelope changes, loss of IDs/status/continuation fields, or a proposal to label lossy summaries evidence-preserving

**Steps:**
- [ ] Rank distinct fatal/error failures across the full log, retain associated stack frames, and retain final status/exit information.
- [ ] Normalize read arguments into one metadata shape with explicit `offset`, `limit`, and `readKey`; preserve `offset: 0`.
- [ ] Pass read-window hints into classification/routing and test distinct windows on one resource.
- [ ] Make diff summaries report omitted hunks/files and lossiness without claiming recovery; attach recovery fields only after archival succeeds.
- [ ] Preserve tool arguments, IDs, status blocks, continuation references, non-text blocks, and frozen history in nested `content[]` and `output[]` fixtures.

**Verification:**
- [ ] Test fatal root cause followed by retry noise; root cause and final status remain.
- [ ] Test diff summary omission metadata and successful/failed archival publication.
- [ ] Test read windows `{ offset: 0, limit: N }`, omitted windows, and distinct windows on same path.
- Expected: required evidence survives; route output makes lossiness and recovery state truthful.

**Exit Criteria:** Route-specific fidelity and recovery contracts pass without changing provider envelope ownership.

### Task 4: Replace duplicated read classification with one reverse scan

**Purpose:** Make structural historical read classification canonical and
expected O(N), while preserving current semantics exactly.

**Task Function:** Consolidate and optimize read-event classification.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: algorithmic refactor with equivalence-sensitive behavior

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: differential fixtures and property-style generated cases

**Specification Coverage:** Exact event ordering, resource identity, read-window
identity, state, reason, triggering index, and deterministic output.

**Required Skills:** `skill-performance-optimization`, `skill-test-driven-development`

**Files And Symbols:**
- Modify: `components/packages/features/reduction/src/reduction/read-state-compaction.ts:analyzeReadStateCompaction`
- Modify: `components/packages/features/reduction/src/analyzers/read-state-compaction-analyzer.ts:classifyReadSegments`
- Modify: `components/packages/features/reduction/src/analyzers/read-state-compaction-analyzer.ts:analyzeReadStateCompaction`
- Modify: `components/packages/features/reduction/src/reduction/types.ts:ReadStateClassification and ReductionRequestState`
- Modify: `components/packages/features/reduction/src/reduction/pipeline.ts:runReductionBeforeCall`
- Verify: `components/packages/features/reduction/tests/read-state-compaction.test.ts`
- Verify: `components/packages/features/reduction/tests/read-state-compaction-analyzer.test.ts`

**Dependencies:** Task 1 baseline; Task 3 read-window contract.

**Authority:**
- Preauthorized local actions: edit classifier/analyzer/types and focused tests; run differential benchmark fixtures
- Stop for: changed state/reason/triggering-index semantics, changed case sensitivity, changed exact-window matching, or persistent-cache requirements

**Steps:**
- [ ] Move structural event extraction and classification to the reduction module as the single canonical implementation.
- [ ] Add `ReductionRequestState` to the reduction context contract; pipeline creates one request-local instance and passes it to before-call handlers.
- [ ] Scan events from newest to oldest while tracking nearest mutation by resource and nearest matching read by resource/window.
- [ ] For each read, choose the earliest relevant later event by index: mutation means `stale`, matching read means `superseded`, otherwise `fresh`.
- [ ] Make analyzer retain only eligibility thresholds, grouping, hashing, and instruction construction.
- [ ] Remove duplicated event extraction, repeated bucket scans, and redundant read sorting.
- [ ] Keep `contentHashes` until external-contract ownership is checked; compute lazily or document a separate removal decision.

**Verification:**
- [ ] Differentially compare old and new classifiers on fixed fixtures and generated event sequences.
- [ ] Cover `read A → read B → mutation`, distinct windows, case-sensitive resources, mutation aliases, offset zero, and deterministic ordering.
- [ ] Assert classification work scales linearly across 1,000–8,000 events within benchmark variance.
- Expected: classifications match exactly; reverse scan uses map lookups and no per-read forward bucket scan.

**Exit Criteria:** One canonical classifier serves analyzer and passes; equivalence and scaling evidence are recorded.

### Task 5: Reuse request-local results and measure real Codex work

**Purpose:** Remove adjacent repeated work without introducing persistent
state, then prove improvement on both synthetic and actual eligible-context paths.

**Task Function:** Integrate request-local reuse and comparative measurement.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: performance proof after contract behavior stabilizes

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: benchmark output and semantic digest checks

**Specification Coverage:** Request-local cache lifetime, indexed lookup, lazy
allocation, baseline equivalence, and honest allocation/GC reporting.

**Required Skills:** `skill-performance-optimization`, `skill-backend-verification`

**Files And Symbols:**
- Modify: `components/packages/features/reduction/src/passes/pass-tool-payload-trim.ts:toolPayloadTrimPass`
- Modify: `components/adapters/codex/scripts/benchmark-forwarding.ts`
- Modify: `components/packages/features/reduction/scripts/bench-hotspots.mjs`
- Verify: `components/adapters/codex/src/reduction.ts:buildTurnContext`
- Verify: `components/packages/features/reduction/src/reduction/read-state-compaction.ts`

**Dependencies:** Tasks 2–4.

**Authority:**
- Preauthorized local actions: edit benchmark and request-local lookup code; run local mock probes and configured provider smoke when environment already supports it
- Stop for: cross-request/session cache design, benchmark fixture mismatch, raw payload/credential output, or exact-allocation claims from heap delta

**Steps:**
- [ ] Build one `segmentId → segment` index per request and replace repeated `segments.find()` calls.
- [ ] Have read-state compaction populate `requestState.readStateClassifications`; tool-payload trimming consumes that map and computes it only when no earlier pass populated it.
- [ ] Allocate replacement arrays/objects only after a route reports a real change; preserve copy-on-write mainline behavior.
- [ ] Extend benchmarks with warmup, repeated samples, p50/p95, semantic output digest, changed counts, saved chars/tokens, no-op counters, explicit `--expose-gc` evidence, and labeled retained-heap/allocation proxies.
- [ ] Benchmark a large historical fixture and a Codex fixture matching latest-user/frozen eligibility; do not broaden eligibility.
- [ ] Run provider smoke through centralized environment only if available; never print raw payloads or headers.

**Verification:**
- [ ] Compare integrated mainline baseline and implementation on identical fixtures.
- [ ] Assert copying-only cases preserve payload digest and compression cases preserve route-specific evidence/recovery.
- [ ] Report local reduction p50/p95 separately from provider latency; provider latency is not local reduction proof.
- Expected: historical classification improves without semantic drift; benchmark labels proxies honestly and shows actual eligible-path work.

**Exit Criteria:** Comparative evidence supports P0 closure and identifies any remaining provider/environment limitation without overstating local performance.

### Task 6: Final verification and handoff

**Purpose:** Reconcile implementation, tests, documentation, plan state, and
scope before any external Git action.

**Task Function:** Produce fresh acceptance evidence.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: final verification and scope control

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: lead controller owns final evidence package

**Specification Coverage:** All implementation outcomes and completion criteria.

**Required Skills:** `skill-verification-before-completion`, `skill-code-standards`

**Files And Symbols:**
- Verify: all task targets and changed tests/scripts
- Verify: `docs/acceptance/GUA-06.md` if behavior contract references require update

**Dependencies:** Tasks 2–5.

**Authority:**
- Preauthorized local actions: run final tests, typechecks, benchmarks, contract validation, and diff inspection
- Stop for: unrelated file changes, failed required checks, stale base/head identity, or unrecorded benchmark/probe limitation

**Steps:**
- [ ] Run reduction and Codex tests, typechecks, and repository contract validation.
- [ ] Run final comparative benchmarks and preserve raw summarized evidence without sensitive payloads.
- [ ] Review diff for accidental README or unrelated changes; confirm no generated surface was edited directly.
- [ ] Record deviations, unavailable provider probes, and remaining non-blocking follow-ups in plan evidence.

**Verification:**
- [ ] `pnpm --dir components/packages/features/reduction test`
- [ ] `pnpm --dir components/packages/features/reduction run typecheck`
- [ ] `pnpm --dir components/adapters/codex test`
- [ ] `pnpm --dir components/adapters/codex run typecheck`
- [ ] `node --expose-gc --trace-gc --import tsx components/adapters/codex/scripts/benchmark-forwarding.ts`
- [ ] `pnpm --dir components/packages/features/reduction run bench:hotspots`
- [ ] `python C:\Users\HOANG PHI LONG DANG\.agents\project-os\scripts\validate_repo_contracts.py --repo-root . --fast`
- [ ] `git diff --check`
- Expected: all required checks pass; final evidence maps to every completion criterion.

**Exit Criteria:** Fresh verification returns `verified`; only then may branch/PR
disposition be requested through the finishing workflow.

## Verification

- `pnpm --dir components/packages/features/reduction test`
- `pnpm --dir components/packages/features/reduction run typecheck`
- `pnpm --dir components/adapters/codex test`
- `pnpm --dir components/adapters/codex run typecheck`
- `node --expose-gc --trace-gc --import tsx components/adapters/codex/scripts/benchmark-forwarding.ts`
- `pnpm --dir components/packages/features/reduction run bench:hotspots`
- `python C:\Users\HOANG PHI LONG DANG\.agents\project-os\scripts\validate_repo_contracts.py --repo-root . --fast`
- `git diff --check`

## Completion Criteria

1. Merged copy-on-write and legacy-handler semantics remain intact.
2. Large over-budget JSON avoids unbounded lossless-string construction while
   preserving lexical fidelity when lossless output is returned.
3. Recovery content is exempt from destructive passes; archives precede
   publication; final replacements prove positive savings including recovery
   hints.
4. Logs, read ranges, diffs, nested text blocks, protected fields, and frozen
   history satisfy route-specific fidelity tests.
5. One reverse-scan classifier serves analyzer and passes with exact state,
   reason, trigger, range, case, and ordering semantics.
6. Request-local reuse and indexed lookup remove repeated work without
   persistent caches or broadened eligibility.
7. Comparative benchmarks report p50/p95, semantic digests, savings, changed
   counts, and labeled GC/allocation proxies on identical workloads.
8. Final checks pass; unavailable provider probes and scope deviations are
   recorded; no unrelated workspace changes enter the implementation.

## Stop Conditions

- Stop if resolving the branch requires discarding or rewriting current
  `README.md` work.
- Stop if copy-on-write behavior regresses or provider payload digests differ in
  copying-only cases.
- Stop if recovery content changes, archival fails before publication, or final
  replacement is not smaller after recovery metadata.
- Stop if JSON lexical fidelity requires parse/stringify normalization.
- Stop if classifier equivalence fails for any preserved event-order case.
- Stop if request-local reuse requires persistent session invalidation logic.
- Stop if benchmarks cannot use identical workloads or would expose raw
  provider payloads, credentials, or headers.
