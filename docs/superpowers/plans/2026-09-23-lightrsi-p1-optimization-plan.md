---
layer: change
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: active
name: LightRSI P1 Optimization and Contract Closure
targets:
  - components/adapters/codex/src/context-cleaner/bridge.ts
  - components/adapters/codex/tests/context-cleaner-bridge.test.ts
  - components/packages/features/cleaner/src/orchestrator.ts
  - components/packages/features/cleaner/tests/orchestrator.test.ts
  - components/packages/foundation/artifact-store/src/archive-recovery/index.ts
  - components/packages/foundation/artifact-store/src/archive-recovery/archive-paths.ts
  - components/packages/foundation/artifact-store/tests/archive-recovery.test.ts
  - components/packages/features/reduction/src/reduction/tool-payload-router.ts
  - components/packages/features/reduction/tests/tool-payload-router.test.ts
  - components/adapters/codex/scripts/benchmark-forwarding.ts
  - components/adapters/codex/scripts/benchmark-context-cleaner.ts
  - components/packages/features/reduction/scripts/bench-hotspots.mjs
---

# LightRSI P1 Optimization and Contract Closure

## Goal

Follow approved scope in `docs/intent/2026-09-23-lightrsi-p1-closure-plan.md`.
Close preview, archive-recovery, CCR-search, and TAP diagnostic-fidelity gaps
verified after `9696d94`; optimize only reproducible local regressions. Keep
user-approved context-pressure and live-provider measurements deferred. Local
harness results do not prove provider tokens, cache hits, TTFT, cost, or
task-completion gains.

## Implementation Outcomes

### Truthful, revision-bound Cleaner preview

Counts, deferrals, changed boundaries, and savings describe only backend-applicable
operations. Context accounting compares equivalent expanded histories; encoded
transport delta stays separate. Preview reuses request-local inspection work only
while revision and occurrence fingerprints remain valid.

### Exact recovery and bounded focused retrieval

Workspace-origin archives recover by exact reference through trusted host context
or indexed locations. Search honors `startLine`, bounds collection during scan,
and exposes deterministic continuation with truthful scan/result completeness.

### Diagnostic fidelity and measured overhead

TAP failure fields retain source order and multiline values, with field-scoped
omission and exact recovery guidance. Matched pinned runs cover local Reduction,
RTK, CCR, Cleaner, and continuation behavior. Unavailable provider and OS
metrics are reported with reasons, not inferred from bytes or hashes.

## Scope

- Correct preview validation/accounting; remove duplicate request-local
  reconstruction only if measured benefit justifies it.
- Restore trusted workspace exact recovery; probe all supported root indexes
  before archive-directory fallback scans.
- Implement bounded archive-relative CCR search continuation.
- Preserve TAP field order and multiline values.
- Compare pinned `4f1be2b` and `9696d94` with identical local settings; remeasure
  final implementation.
- Run existing raw/generic/command-aware Reduction, baseline/Cleaner,
  early/late/cold recovery, and cumulative Cleaner continuation arms with
  approved pinned fixtures and sample protocol.
- Measure per-successful-task tokens/cost, provider cache receipts, TTFT, and
  end-to-end latency only when existing approved access provides reliable
  evidence; otherwise record exact unavailability.

## Non-goals

- Context-pressure capacity/reservation wiring or live-provider evaluation.
- Provider token/cache/TTFT/cost/task-completion claims.
- New archive registry, recovery engine, external search dependency, or cache.
- Changes to Cleaner execution authority, release semantics, or archive trust.
- Treating candidate-only `59.626 ms` or `489.043 ms` as proven regression.
- New runtime telemetry or hot-path instrumentation without a demonstrated gap.

## Invariants

1. Preview remains inspection-only; it creates no plans, receipts, archives,
   claims, or execution events.
2. Invalid, stale, or backend-deferred selections never count as applied.
3. `artifactRef` remains exact identity; legacy `dataKey` behavior is unchanged.
4. Workspace recovery accepts only trusted host context or indexed locations,
   never arbitrary caller paths.
5. Search coordinates remain archive-relative; continuation skips and duplicates
   no matches, and resource limits apply during accumulation.
6. TAP field order/association remains faithful; omission names field and retains
   exact-recovery guidance.
7. Local benchmarks prove local costs only; provider/task outcomes stay unknown
   until provider-backed evaluation.

## Execution Approach

- Mode: `inline sequential`
- Coordination: `git-tracked`
- Required skills: `skill-systematic-debugging`, `skill-test-driven-development`, `skill-backend-verification`, `skill-performance-optimization`, `skill-verification-before-completion`
- Isolation: `current workspace`; temporary pinned worktree only for matched baseline
- Commit policy: `no commits during execution`
- Preauthorized local actions: listed source/test edits, declared checks and benchmarks, read-only Git inspection, temporary benchmark worktree creation
- User-approval actions: push, merge, publication, external writes, destructive recovery, discard, and temporary-worktree cleanup
- Parallel ownership: none; shared preview/archive contracts execute sequentially
- Sequential fallback: follow task order; stop where trusted workspace source or contract cannot be established

Numeric performance pass threshold: none approved. Compare matched repeated
results and semantic output; optimize only reproducible regressions or costs with
demonstrated user value.

## Coordination State

- Coordination owner: `single lead controller`
- Coordination schema: `2`
- Branch: `codex/lightrsi-p1-closure`
- Base commit: `9696d94222ece3319db31fcd9d5669f7618cc9ed`
- Expected workspace: `plan staged as coordination artifact; no unrelated changes`
- Next action: `Task 0 — complete pinned local baseline before downstream acceptance`
- Blockers: `none`

| Task | State | Workspace | Executor | Depends On | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Task 0 | `active` | current | `codex` | none | focused reproductions and pinned baseline | in progress |
| Task 1 | `active` | current | `codex` | Task 0 | preview regressions and bridge tests | implementation verified; acceptance waits on Task 0 |
| Task 2 | `pending` | current | `unresolved` | Task 0 | archive writer-to-recovery and lookup tests | pending |
| Task 3 | `pending` | current | `unresolved` | Tasks 0, 2 | bounded search continuation tests | pending |
| Task 4 | `pending` | current | `unresolved` | Task 0 | TAP multiline ordering regression | pending |
| Task 5 | `pending` | current | `unresolved` | Tasks 1–4 | focused suites and matched final benchmarks | pending |

## Task Breakdown

### Task 0: Reproduce Gaps and Capture Baseline

**Purpose:** Confirm findings against current code and capture local performance
before edits.

**Task Function:** Reproduction and baseline measurement.

**Template Profile:** `unresolved`

**Validator Profile:** `none`

**Specification Coverage:** Follow-up findings; approved additive performance
scope and measurement protocol in the intent plan.

**Required Skills:** `skill-systematic-debugging`,
`skill-performance-optimization`.

**Files And Symbols:** Read bridge/orchestrator preview, artifact resolver, TAP
summarizer, and matching tests. Run existing `benchmark-forwarding.ts`,
`benchmark-context-cleaner.ts`, `bench-hotspots.mjs`, and `bench-recovery.mjs`.

**Dependencies:** None.

**Authority:**

- Preauthorized local actions: focused tests, local benchmarks, temporary local worktree at pinned `4f1be2b`, and recording evidence in this plan
- Stop for: unavailable pinned object, fixture/runtime mismatch, destructive Git recovery, or irreproducible benchmark setup

**Steps:**

1. Reproduce preview deferral/count, empty-input baseline, changed-prefix, and
   duplicate reconstruction findings.
2. Reproduce workspace write-to-exact-recovery miss at supported boundaries;
   identify trusted workspace context available to each recovery host.
3. Reproduce ignored `startLine`, unbounded result accumulation, and TAP field
   reordering with pinned fixtures.
4. Compare raw controls, `4f1be2b37b2166f2fffd973b9c4b8b849190729b`,
   `9696d94`, and final candidate with identical fixture arms. Existing behavior
   intentionally changed between revisions; classify expected semantic digest
   differences against pinned correctness cases, and flag only unexplained drift.
   Reuse pinned workloads `tap-failure-flood-v1`, `tsc-diagnostic-flood-v1`, Cleaner
   `short/noisy` and `long/noisy`, and artifact-store archive fixtures.
5. Preserve each harness's defaults. Context Cleaner uses five repetitions per
   fixture and `LIGHTRSI_BENCHMARK_ARM_ORDER=alternating`. Cover early/late
   history releases, cumulative releases/restart/continuation, cold/warm
   recovery, and early/late indexed lookup where supported.
6. Report p50/p95 only where timestamps exist; report process CPU, peak memory,
   and I/O only from reliable external OS sampling. Preserve raw numeric outputs
   and digests, never prompts, arguments, or credentials. Mark unsupported live
   metrics unavailable with the exact reason.

**Verification:**

- `pnpm --dir components/packages/foundation/artifact-store test`
- `pnpm --dir components/packages/features/reduction test`
- `pnpm --dir components/packages/features/cleaner test`
- `pnpm --dir components/adapters/codex test`
- `node --expose-gc --trace-gc --import tsx components/adapters/codex/scripts/benchmark-forwarding.ts`
- `pnpm --dir components/packages/foundation/artifact-store bench:recovery`
- `pnpm --dir components/packages/features/reduction bench:hotspots`
- PowerShell: `$env:LIGHTRSI_BENCHMARK_ARM_ORDER = "alternating"; pnpm --dir components/adapters/codex run bench:context-cleaner`
- `pnpm --dir components/adapters/codex run bench:context-cleaner`

**Exit Criteria:** Every finding has a minimal reproduction; matched baseline
outputs/environment and supported feature arms are recorded; live metrics are
measured only with approved evidence or explicitly unavailable; local/provider
claims are separated.

**Evidence:** Active; workspace and pinned base/candidate commits reconciled.

### Task 1: Correct Preview Validation and Accounting

**Purpose:** Prevent previews from reporting unapplied selections as validated or
claiming context savings from incomparable payloads.

**Task Function:** Correct preview contract and reduce repeated reconstruction.

**Template Profile:** `unresolved`

**Validator Profile:** `none`

**Specification Coverage:** Truthful, revision-bound Cleaner preview.

**Required Skills:** `skill-test-driven-development`,
`skill-backend-verification`.

**Files And Symbols:**
`components/adapters/codex/src/context-cleaner/bridge.ts:readRewriteState`,
`previewCleanRelease`; `components/packages/features/cleaner/src/orchestrator.ts:previewContextCleanRelease`;
`components/adapters/codex/tests/context-cleaner-bridge.test.ts`;
`components/packages/features/cleaner/tests/orchestrator.test.ts`.

**Dependencies:** Task 0.

**Authority:**

- Preauthorized local actions: preview implementation and focused tests in listed files
- Stop for: inability to compare equivalent expanded history or any weakening of revision/fingerprint validation or release authority

**Steps:**

1. Add failing tests for incomplete tool-call/output closure and backend
   deferrals; derive counts, savings, and changed boundary from applicable
   backend operations.
2. Compare equivalent expanded histories for context accounting; label encoded
   transport delta separately; derive unchanged prefix from encoded comparison.
3. Reuse request-local revision-bound inspection state only if snapshot and
   preview can share it without dropping boundary revalidation; add no
   cross-request cache.
4. Preserve `providerCacheOutcome: "unknown"` without provider evidence.

**Verification:** `pnpm --dir components/packages/features/cleaner test`;
`pnpm --dir components/adapters/codex test`. Cover applicable/deferred/stale/
invalid selections, equivalent-history accounting, and zero side effects.

**Exit Criteria:** Preview claims match applicable operations; context comparison
is equivalent; stale/fingerprint guards remain; repeat work is removed only
with measured benefit.

**Evidence:** Regression-first preview tests reproduced the false validated count
for backend-deferred observation-only selections, negative “savings” against an
empty chained-request payload, and fallback previews that marked selections
validated without backend inspection. After the fix, focused bridge tests pass
24/24, Cleaner orchestrator tests pass 2/2, Cleaner package tests pass 61/61,
Codex adapter tests pass 475/475, and both package typechecks pass. Preview
remains side-effect-free; stale revision and fingerprint rejection remain
covered. Task acceptance waits for Task 0's pinned matched baseline, which is
still active.

### Task 2: Restore Trusted Workspace Recovery; Order Index Lookup

**Purpose:** Make workspace-origin exact references recoverable and skip
unnecessary directory scans before indexed hits.

**Task Function:** Fix shared resolver and prove trusted host boundary.

**Template Profile:** `unresolved`

**Validator Profile:** `none`

**Specification Coverage:** Exact recovery and local lookup overhead.

**Required Skills:** `skill-systematic-debugging`,
`skill-test-driven-development`, `skill-backend-verification`.

**Files And Symbols:**
`components/packages/foundation/artifact-store/src/archive-recovery/index.ts:archiveContent`
and exact resolver; `components/packages/foundation/artifact-store/src/archive-recovery/archive-paths.ts`
only if required; one existing `components/products/mcp/src/index.ts` or
`components/adapters/openclaw/src/context-stack/page-in/recovery-tool.ts`
boundary only if Task 0 confirms trusted workspace context; artifact-store and
affected boundary tests.

**Dependencies:** Task 0.

**Authority:**

- Preauthorized local actions: archive resolver and focused proven-boundary/test edits
- Stop for: arbitrary caller-supplied paths, a new registry, changed `dataKey` behavior, or absence of trusted workspace context

**Steps:**

1. Add writer-to-recovery tests for state and workspace archives; trace trusted
   workspace context before choosing smallest compatible repair.
2. Reuse existing index or trusted host context; do not widen MCP input with an
   untrusted filesystem path.
3. Check indexed locations across supported roots before fallback directory
   scans; preserve exact-ref validation and fallback behavior.
4. Cover indexed later-root hit, missing/stale index, missing/corrupt archive,
   exact integrity, and legacy `dataKey` selection.
5. Re-run recovery benchmark and retain raw results.

**Verification:** `pnpm --dir components/packages/foundation/artifact-store test`;
`pnpm --dir components/packages/foundation/artifact-store bench:recovery`;
run focused host/MCP tests only if boundary changes.

**Exit Criteria:** Workspace write-to-recovery works through trusted context;
arbitrary path injection is impossible; exact/legacy behavior passes; index-first
lookup is no slower on existing fixtures.

**Evidence:** Pending.

### Task 3: Bound CCR Search and Add Continuation

**Purpose:** Make focused search navigable and bound result construction during
scanning.

**Task Function:** Correct archive-relative search pagination and limits.

**Template Profile:** `unresolved`

**Validator Profile:** `none`

**Specification Coverage:** Bounded focused retrieval.

**Required Skills:** `skill-test-driven-development`,
`skill-backend-verification`.

**Files And Symbols:**
`components/packages/foundation/artifact-store/src/archive-recovery/index.ts`
search renderer and `components/packages/foundation/artifact-store/tests/archive-recovery.test.ts`;
shared recovery types and `components/products/mcp/src/index.ts` only if public
contract requires them; `components/products/mcp/tests/server.test.ts` for
public contract changes.

**Dependencies:** Tasks 0 and 2.

**Authority:**

- Preauthorized local actions: bounded search implementation and relevant contract tests
- Stop for: changed archive-relative coordinates, unbounded accumulation, or a cursor requiring mutable global state

**Steps:**

1. Add regressions for `startLine`, continuation, end boundaries, invalid
   coordinates, same-line matches, and maximum-size input.
2. Define deterministic continuation from archive content/query; distinguish
   scan completion from result truncation.
3. Enforce line/result/character limits while scanning/appending. Preserve
   defaults and current errors unless tests expose a mismatch.
4. Update MCP schema/docs and server tests only if public response changes.

**Verification:** `pnpm --dir components/packages/foundation/artifact-store test`;
`pnpm --dir components/products/mcp test` when contract changes. Prove no
skipped/duplicate matches across pages and bounded output.

**Exit Criteria:** `startLine` works; continuation reaches all matches once;
output bounds apply before construction; completion metadata is unambiguous.

**Evidence:** Pending.

### Task 4: Preserve TAP Multiline Field Fidelity

**Purpose:** Keep each TAP field attached to its body and source order under the
output budget.

**Task Function:** Correct route-specific diagnostic summarization.

**Template Profile:** `unresolved`

**Validator Profile:** `none`

**Specification Coverage:** RTK diagnostic fidelity.

**Required Skills:** `skill-test-driven-development`,
`skill-backend-verification`.

**Files And Symbols:**
`components/packages/features/reduction/src/reduction/tool-payload-router.ts:summarizeNodeTestOutput`;
`components/packages/features/reduction/tests/tool-payload-router.test.ts`.

**Dependencies:** Task 0.

**Authority:**

- Preauthorized local actions: TAP summarizer change and focused regression tests
- Stop for: detached/reordered values, lost failure identity, or omission without exact-recovery guidance

**Steps:**

1. Add multiline `expected`, `actual`, and `stack` fixture; assert source order
   and field association.
2. Keep each header and continuation body as one budgeted unit.
3. Replace a complete over-budget field with named omission and existing
   exact-recovery guidance; never emit orphaned continuation lines.
4. Preserve status and execution evidence behavior.

**Verification:** `pnpm --dir components/packages/features/reduction test`;
assert ordering, association, omission label, and recovery hint at tight budget.

**Exit Criteria:** No detached/reordered field values; failure identity and
recovery guidance survive constrained output.

**Evidence:** Pending.

### Task 5: Verify Integration and Re-measure

**Purpose:** Prove combined contracts and report matched local changes.

**Task Function:** Final verification and results recording.

**Template Profile:** `unresolved`

**Validator Profile:** `none`

**Specification Coverage:** All outcomes and invariants.

**Required Skills:** `skill-verification-before-completion`,
`skill-performance-optimization`.

**Files And Symbols:** Focused suites, benchmark harnesses, and this plan’s
verification/coordination evidence. Edit harness only if Task 0 proves a matched
comparison is not reproducible with existing options.

**Dependencies:** Tasks 1–4.

**Authority:**

- Preauthorized local actions: declared tests, type checks, local benchmarks, and updating this plan’s evidence/ledger
- Stop for: unexplained semantic digest mismatch, focused test failure, unsupported performance claim, or need for live-provider traffic/credentials

**Steps:**

1. Run all affected focused suites and type checks.
2. Repeat all applicable Task 0 forwarding, context-cleaner, Reduction, and
   recovery measurements with identical runtime, fixtures, GC, arm order,
   concurrency, warmups, and sample settings.
3. Compare semantic digests against expected behavior changes; report p50/p95,
   memory proxies, run spread, and limitations. Separate measured values from
   estimates.
4. Keep provider tokens/cache/TTFT/cost/task-completion and pressure outcomes
   explicitly unmeasured/deferred.

**Verification:** Run artifact-store, reduction, cleaner, Codex, and MCP tests
when touched; typecheck affected packages; repeat both local benchmark commands.

**Exit Criteria:** Focused proof passes; baseline/final inputs are equivalent;
report states measured benefits, regressions, run spread, per-successful-task
metrics when actually available, and evidence limits. No numeric threshold is
invented.

**Evidence:** Pending.

## Verification

- [ ] Preview counts/accounting derive from applicable backend operations.
- [ ] Context comparison uses equivalent expanded history; transport delta is
  separately labeled.
- [ ] Preview remains inspection-only with stale/fingerprint checks.
- [ ] Workspace exact recovery uses trusted context; no arbitrary path input.
- [ ] CCR continuation honors coordinates, avoids duplicates/skips, and bounds
  output during collection.
- [ ] TAP fields retain order, association, and recovery guidance.
- [ ] Exact `artifactRef` and legacy `dataKey` behavior remain intact.
- [ ] Focused tests and affected type checks pass.
- [ ] Matched local results avoid provider/task-level claims.

## Completion Criteria

- [ ] Tasks 0–5 complete with accepted proof recorded in ledger.
- [ ] No reviewed P1 gap remains within approved scope.
- [ ] Context-pressure and provider-backed evaluation remain deferred.
- [ ] Workspace is clean or preserved with reason and next action in coordination.
