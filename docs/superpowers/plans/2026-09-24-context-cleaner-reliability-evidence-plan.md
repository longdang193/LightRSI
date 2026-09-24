---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: active
layer: change
name: context-cleaner-reliability-evidence
targets:
  - components/packages/foundation/artifact-store/src/archive-recovery/index.ts
  - components/packages/foundation/artifact-store/src/archive-recovery/tool-result-persist.ts
  - components/packages/foundation/artifact-store/tests/archive-recovery.test.ts
  - components/adapters/openclaw/src/context-stack/page-in/recovery-tool.ts
  - components/adapters/openclaw/src/context-stack/page-in/recovery-tool.test.ts
  - components/adapters/openclaw/src/context-stack/request-preprocessing/tool-results-persist.ts
  - components/adapters/openclaw/src/context-stack/request-preprocessing/tool-results-persist.test.ts
  - components/packages/features/reduction/src/reduction/content-classifier.ts
  - components/packages/features/reduction/src/reduction/tool-payload-router.ts
  - components/packages/features/reduction/tests/tool-payload-router.test.ts
  - components/adapters/codex/scripts/benchmark-context-cleaner.ts
  - components/adapters/codex/tests/benchmark-timing.test.ts
  - components/adapters/codex/src/benchmark-timing.ts
related_features:
  - artifact-backed reduction
  - OpenClaw recovery
  - Context Cleaner
  - Stage B measurement
---

# Context Cleaner Reliability and Evidence

## Review verdict

The final consolidated review is directionally correct and implementation-ready
as a focused correction plan. Current `main` is `cfbfce2`, ahead of reviewed
commit `6516772`; preserve its architecture and existing agent-directed release
path. Do not add another Cleaner lifecycle, compression layer, archive index,
memory service, automatic pruning controller, or profitability predictor.

The three immediate correctness risks are independent but share one invariant:
active-context reduction is valid only when authoritative evidence remains
durably recoverable and benchmark evidence remains honestly comparable.

## Goal

Preserve the current Context Cleaner and artifact-backed reduction
implementation, close skipped-evidence and archive-failure correctness gaps,
make OpenClaw recovery expose the existing bounded-search contract, and repair
Stage B measurement so later optimization decisions use reproducible cost and
recovery evidence rather than proxy token counts.

## Implementation Outcomes

### Durable exact recovery

Bounded archive search continuation never skips a scanned match, does not loop
forever, and reports scan completeness separately from result completeness.
OpenClaw never replaces an oversized tool result with a reduced fallback when
durable archival failed or its recovery reference is invalid.

### Shared recovery interface

The registered OpenClaw `memory_fault_recover` tool forwards the existing shared
range, stats, and search arguments without duplicating validation or rendering.
Registered-tool integration proves search continuation through the actual host
boundary.

### Honest measurement

Stage B reservations settle against the provider attempt that owns them.
Completed cost is not counted as outstanding reservation, missing usage remains
unknown, shared seed requests count once, and partial execution cannot appear
as a complete causal pair. Keep/Release economics remain separate from cap
compliance.

### Evidence-gated optimization

The implementation records enough admission, recovery, and cost evidence to
compare historical release against admission-time reduction. Performance work
after correctness uses measured bottlenecks and explicit thresholds; no runtime
policy claims that late release is always better.

## Non-goals

- No replacement of the existing artifact store, reduction router, or Cleaner.
- No second archive lookup, attempt registry, benchmark framework, or classifier.
- No chunked archive format or sparse line index before profiling proves need.
- No autonomous pruning, profitability predictor, vector database, or new memory service.
- No live-provider claim from mock evidence or from incomplete usage records.

## Execution Approach

- Mode: `inline sequential`
- Coordination: `git-tracked`
- Required skills: `skill-backend-verification`, `skill-performance-optimization`, `skill-test-driven-development`, `skill-verification-before-completion`
- Isolation: `current workspace`
- Commit policy: `no commits during execution`
- Preauthorized local actions: `edit listed files, run declared local tests/typechecks/builds, inspect local Git and repository state`
- User-approval actions: `commit, push, merge, publication, destructive cleanup, credential or external-provider changes`
- Parallel ownership: `none`
- Sequential fallback: `Task 1` before `Task 2`; `Task 3` after P0 correctness; `Task 4` only after measurement contract is green

## Coordination State

- Coordination owner: `single lead controller`
- Coordination schema: `2`
- Branch: `main`
- Base commit: `cfbfce29e800d25f5ef3cf571a2d4ad58a19f800`
- Expected workspace: `clean; main aligned with origin/main`
- Next action: `obtain commit authorization, create approved commit, then run live pilot from clean SHA-matching checkout`
- Blockers: `live pilot requires user-approved commit/push disposition and external provider availability`

| Task | State | Workspace | Executor | Depends On | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Task 1 | `completed` | current | `codex` | none | artifact-store and OpenClaw correctness tests | 18 artifact-store tests; 127 OpenClaw tests pass |
| Task 2 | `completed` | current | `codex` | Task 1 | registered-tool recovery integration test | 3 recovery tests; OpenClaw typecheck pass |
| Task 3 | `active` | current | `codex` | Task 1 | benchmark unit tests and bounded live/mock report | 19 benchmark tests; 489 Codex tests; mock pass/inconclusive; dirty live preflight stops with 0 runs |
| Task 4 | `pending` | current | `codex` | Tasks 2–3 | evidence report and gated optimization decision | pending |

## Task Breakdown

### Task 1: Close exact recovery and archive-failure loss

**Purpose:**
- Preserve every scanned archive match and prevent irreversible OpenClaw loss when archival fails.

**Task Function:**
- Correctness repair at artifact-store and admission boundaries.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: bounded local change with high correctness risk and direct test coverage.

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: final verification remains with lead controller.

**Specification Coverage:**
- P0 search pagination.
- P0 archive-write failure fallback.
- Exact recoverability and fail-closed behavior.

**Required Skills:**
- `skill-backend-verification`, `skill-test-driven-development`

**Files And Symbols:**
- Inspect/modify: `components/packages/foundation/artifact-store/src/archive-recovery/index.ts:renderRecoveredArchive`
- Inspect/modify: `components/packages/foundation/artifact-store/src/archive-recovery/tool-result-persist.ts:planToolResultPersistence`
- Inspect/modify: `components/adapters/openclaw/src/context-stack/request-preprocessing/tool-results-persist.ts:applyToolResultPersistPolicy`
- Verify: `components/packages/foundation/artifact-store/tests/archive-recovery.test.ts`
- Verify: `components/adapters/openclaw/src/context-stack/request-preprocessing/tool-results-persist.test.ts`

**Dependencies:**
- Current source at `cfbfce2`; preserve current archive schema and `artifact:v2` references.

**Authority:**
- Preauthorized local actions: edit listed source/tests and run focused package checks.
- Stop for: archive schema migration, host API change outside listed files, external storage change, or destructive recovery.

**Steps:**
- [x] Reproduce search continuation with combined `maxScanLines`, `maxMatches`, and `maxOutputChars`; record skipped-line behavior.
- [x] Track first unreturned match separately from scanned range; set `nextStartLine` to earliest unreturned match, otherwise advance only after the scanned range when incomplete.
- [x] Preserve `scanComplete`, `resultsComplete`, omitted-match metadata, and bounded output semantics.
- [x] Make archive failure preserve the original tool output; do not run the reducer on `inline-fallback` and do not emit a recovery claim without a valid durable reference.
- [x] Add tests for archive failure, invalid reference, no-op reduction, repeated continuation, oversized lines, and no duplicate/no skipped matches.

**Verification:**
- [x] `pnpm --dir components/packages/foundation/artifact-store test`
- Expected: all archive recovery tests pass; repeated continuation returns every matching line exactly once.
- [x] `pnpm --dir components/adapters/openclaw test`
- Expected: failed archival preserves original output and successful archival preserves compact output plus exact recovery hint.

**Exit Criteria:**

No result is irreversibly reduced without a valid durable recovery path, and
bounded search continuation is complete, monotonic, and non-repeating.

### Task 2: Expose shared search recovery through registered OpenClaw tool

**Purpose:**
- Make actual OpenClaw recovery honor the shared `renderRecoveredArchive` contract.

**Task Function:**
- Host-boundary contract completion and integration proof.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: existing registration is small; risk is contract mismatch, not architecture.

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: integration test is the validator.

**Specification Coverage:**
- P1 recovery interface parity.
- Exact one-of `artifactRef`/`dataKey` validation.
- Search continuation through registered tool boundary.

**Required Skills:**
- `skill-backend-verification`, `skill-test-driven-development`

**Files And Symbols:**
- Inspect/modify: `components/adapters/openclaw/src/context-stack/page-in/recovery-tool.ts:registerMemoryFaultRecoverTool`
- Verify/modify: `components/adapters/openclaw/src/context-stack/page-in/recovery-tool.test.ts`
- Inspect: `components/packages/foundation/artifact-store/src/archive-recovery/index.ts:renderRecoveredArchive`

**Dependencies:**
- Task 1 establishes continuation semantics and archive safety.

**Authority:**
- Preauthorized local actions: edit registered tool schema, argument forwarding, and tests.
- Stop for: new MCP product dependency, separate renderer/validator, or host registration redesign.

**Steps:**
- [x] Add the existing shared arguments: `mode`, `startLine`, `endLine`, `query`, `contextLines`, `maxMatches`, `maxOutputChars`, and `maxScanLines`.
- [x] Forward only validated values to `renderRecoveredArchive`; preserve host-specific archive resolution and exact-reference validation.
- [x] Exercise range, stats, search, output limits, and continuation using the actual `api.registerTool` factory.
- [x] Verify malformed references and missing archives remain explicit tool errors.

**Verification:**
- [x] `node --import tsx --test components/adapters/openclaw/src/context-stack/page-in/recovery-tool.test.ts`
- Expected: registered tool returns search results, continuation metadata, stats, and bounded range output.
- [x] `pnpm --dir components/adapters/openclaw run typecheck`
- Expected: no schema or type regressions.

**Exit Criteria:**

OpenClaw registered recovery exposes and honors shared bounded recovery without
creating host-specific search or rendering logic.

### Task 3: Repair Stage B reservation accounting and B1 evidence

**Purpose:**
- Make Keep/Release measurement stop and settle on actual provider attempts, not planned arm counts.

**Task Function:**
- Benchmark accounting correction and evidence-contract hardening.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: local benchmark logic with financial/evidence consequences.

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: focused benchmark tests plus pinned pilot.

**Specification Coverage:**
- P0 reservation accounting.
- Missing-usage uncertainty.
- Shared seed counted once.
- Separate cap compliance from measured economic benefit.

**Required Skills:**
- `skill-backend-verification`, `skill-performance-optimization`, `skill-test-driven-development`

**Files And Symbols:**
- Inspect/modify: `components/adapters/codex/scripts/benchmark-context-cleaner.ts:main`
- Inspect/modify: `components/adapters/codex/scripts/benchmark-context-cleaner.ts:runArm`, `createBenchmarkSeed`, provider-attempt capture
- Verify/modify: `components/adapters/codex/tests/benchmark-timing.test.ts`
- Inspect/modify only if needed: `components/adapters/codex/src/benchmark-timing.ts`

**Dependencies:**
- Task 1 correctness must pass; preserve current Git SHA preflight and external manifest behavior.

**Authority:**
- Preauthorized local actions: edit benchmark logic/tests and run mock plus approved live pilot commands using existing credentials/configuration.
- Stop for: provider/model changes, credential edits, spending-cap increase, or silently treating missing usage as zero.

**Steps:**
- [x] Reproduce premature `spending_cap_reservation_exhausted` with a multi-request seed/arm workload.
- [x] Record dispatch ownership on existing provider-attempt records: pair, arm, checkpoint, attempt index, and reserved amount.
- [x] Settle reservation when that attempt completes; subtract settled reservation before evaluating the next dispatch.
- [x] Compute `cap - observed spending - outstanding reservations`; count shared seed requests once.
- [x] Preserve partial runs and mark incomplete pairs/economics inconclusive when usage or comparability is missing.
- [x] Keep monetary break-even separate from `underSpendingCap`; report both fields independently.
- [x] Add tests for successful settlement, provider failure, missing usage, repeated attempts, shared seed, and partial pair stop.

**Verification:**
- [x] `node --import tsx --test components/adapters/codex/tests/benchmark-timing.test.ts`
- Expected: reservation and cost tests pass; missing usage never becomes zero-cost evidence.
- [x] `pnpm --dir components/adapters/codex run typecheck`
- Expected: benchmark compiles with no contract drift.
- [x] Run bounded mock benchmark with separate external output and SHA preflight enabled.
- [ ] Run one live pilot from a clean checkout with separate external manifest/output and SHA preflight enabled.
- Expected: report distinguishes `economicStatus`, `underSpendingCap`, measured cost delta, and incomplete evidence.

**Exit Criteria:**

Stage B1 cannot reject valid work because completed reservations remain
outstanding, cannot claim savings from incomplete usage, and cannot present a
partial causal comparison as complete.

### Task 4: Add evidence gate for admission-time reduction optimization

**Purpose:**
- Establish measurement before changing reduction policy or adding performance machinery; do not implement B2 runtime behavior in this correction package.

**Task Function:**
- Controlled experiment design, profiling, and optimization decision gate.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: evidence collection first; no runtime feature expansion without measured need.

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: final evidence review and reproducible benchmark artifacts.

**Specification Coverage:**
- P1 Stage B1 completion.
- P1 separate Stage B2 experiment.
- P1 archive recovery profiling.
- P2 recovery-demand and release-batching follow-up.

**Required Skills:**
- `skill-performance-optimization`, `skill-verification-before-completion`

**Files And Symbols:**
- Inspect existing metrics in `components/packages/foundation/artifact-store/scripts/bench-recovery.mjs`
- Inspect existing reduction measurements in `components/packages/features/reduction/scripts/bench-hotspots.mjs`
- Inspect current admission path in `components/adapters/openclaw/src/context-stack/request-preprocessing/tool-results-persist.ts`
- Inspect current router in `components/packages/features/reduction/src/reduction/tool-payload-router.ts`
- Add benchmark artifacts only after Task 3 defines reusable evidence fields; do not create a second benchmark framework.

**Dependencies:**
- Tasks 1–3 complete with fresh focused proof.

**Authority:**
- Preauthorized local actions: collect local benchmark evidence, add minimal measurement-only fields/tests, and write the decision record.
- Stop for: runtime reduction policy changes, new persistent state, new storage format, or live spend beyond approved manifest cap.

**Steps:**
- [ ] Complete Stage B1 Keep vs Release with observed cache evidence, actual recovery fixture, correctness checks, monetary cumulative break-even, and reproducible SHA-pinned manifest.
- [ ] Write a separate Stage B2 experiment specification with three arms: Keep, Reduce, Reduce + Recover; do not merge its savings with B1 and do not add runtime code until its host boundary and benchmark owner are approved.
- [ ] Measure provider cost, cached tokens, latency, correctness, recovery calls, recovered bytes, and recovery latency.
- [ ] Profile exact artifact resolution, stats, small-range recovery, bounded search, and full search over increasing archive sizes; record p50/p95 latency, scanned bytes, and memory.
- [ ] Normalize existing tool context for routing (`toolName`, `execution`, `path`, `readWindow`) and test command-aware/type-diagnostic/read-window behavior before changing router rules.
- [ ] Record whether already archived/admitted outputs are reduced again; prevent repeat work only if evidence shows material cost or cache harm.
- [ ] Defer chunked storage, sparse offsets, recovery-demand thresholds, and release batching until profiles show a measurable bottleneck.

**Verification:**
- [ ] Existing recovery and reduction benchmark commands produce sanitized, repeatable artifacts.
- Expected: no mock result is labeled live, no incomplete usage is labeled economic pass, and B1/B2 outputs remain separate.
- [ ] Decision record names baseline workload, environment, metric, threshold owner, and regression trigger before any optimization edit.

**Exit Criteria:**

Optimization changes are either justified by measured bottleneck evidence or
explicitly deferred with a recorded reason. No additional Cleaner functionality
is added merely because it is plausible.

## Verification

- `pnpm --dir components/packages/foundation/artifact-store test`
- `pnpm --dir components/packages/foundation/artifact-store run typecheck`
- `pnpm --dir components/adapters/openclaw test`
- `pnpm --dir components/adapters/openclaw run typecheck`
- `pnpm --dir components/packages/features/reduction test`
- `pnpm --dir components/packages/features/reduction run typecheck`
- `pnpm --dir components/adapters/codex test`
- `pnpm --dir components/adapters/codex run typecheck`
- Relevant workspace build commands after package checks pass.
- Clean Git status, `git diff --check`, exact `git rev-parse HEAD`, and sanitized benchmark manifests/results.

## Completion Criteria

The plan is ready for completion verification when:

1. bounded archive continuation returns all matching evidence without skipping or repeating
2. archive failure preserves original output and never emits an invalid recovery claim
3. OpenClaw registered recovery forwards the shared search/range/stats contract
4. Stage B reservations settle per provider attempt and missing usage remains inconclusive
5. B1 Keep/Release and B2 admission reduction remain separate experiments
6. focused tests, package tests, typechecks, builds, and clean Git proof pass
7. measured optimization decisions and deferrals are recorded without overstating savings

The plan remains `proposed` until explicitly approved. Execution must stop before
commit, push, external publication, credential changes, or unbounded live spend.
