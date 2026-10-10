---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: in_progress
layer: change
name: lightrsi-generation-policy-hardening
repository: LightMem2
base_commit: 72e478c73bce63392a3e27c630d434ee9400822e
targets:
  - components/packages/foundation/product-surface
  - components/packages/foundation/host-adapter
  - components/adapters/codex
  - docs/benchmarks
  - README.md
related_features:
  - generation policy
  - stable-prefix preparation
  - event trace write-completion semantics
  - matched completed-task benchmark
---

# LightRSI Generation Policy Hardening

## Goal

Reduce LightRSI's own request-path overhead, make the effective Caveman/Ponytail
state provable for each measured request, repair benchmark accounting semantics,
and run one matched completed-task experiment before any adapter expansion or
default change.

The plan preserves the current ownership boundary:

```text
LightRSI generation policy
  -> stable-prefix preparation
  -> recovery/reduction
  -> explicit Cleaner work
  -> 9Router/provider
```

The plan does not move policy ownership into 9Router, add a second inference
pass, create a policy service or database, add an adaptive selector, or wire
Claude Code/OpenClaw before Codex evidence passes.

## Verdict Review

The supplied verdict is directionally correct and should be executed as a
bounded hardening and measurement pass rather than a feature expansion. The
repository adds two important corrections:

- The working checkout is `main` at `7e6c2072`, while `origin/main` is already
  at `72e478c73bce63392a3e27c630d434ee9400822e` and contains the merged
  generation-policy implementation. Task 0 must establish the verified source
  checkpoint before any implementation work; no task may silently build on the
  stale local checkout.
- The relevant defects are present in the merged implementation: the shared
  pipeline compares stable-prefix output with the pre-policy envelope, policy
  digesting includes request-sized data, trace records are serialized and
  written one at a time, JSONL tail reads repeatedly copy and rescan buffers,
  and runtime diagnostics do not prove effective per-request policy state.

The existing benchmark already has Stage A/Stage B seams and paired comparison
helpers. The plan extends those seams instead of creating another benchmark
framework. Existing unknown cache evidence remains unknown, and 9Router remains
an external read-only preflight dependency.

## Implementation Outcomes

### Hot-path correctness and compiled policy identity

`stablePrefixApplied` reports only changes made by stable-prefix preparation,
not changes made earlier by generation policy. Policy text, shared hard-boundary
protection, version, and digest are compiled once from normalized configuration;
the request path appends the compiled block and copies its identity without
hashing messages, tools, or request metadata.

### Local overhead and phase timing are measurable

The existing event-trace queue writes already-serialized lines and batches
adjacent entries for the same file while preserving ordering, write-completion
semantics, and error accounting. Recent JSONL reads retain the bounded
256-record fallback without repeated whole-buffer copying. Existing timing
surfaces distinguish LightRSI local phases from provider latency and post-call
work.

### Effective policy state is provable

Existing status and trace surfaces expose runtime/build identity, effective
Caveman and Ponytail modes, policy version and digest, applied state, and a
bounded bypass reason. A benchmark row can be joined to its request ID and
runtime identity. Ordinary runtime uses startup-cached 9Router evidence; each
economic benchmark gets a fresh experiment-scoped preflight, and neither is
polled in the request hot path.

### One honest matched experiment gates rollout

All completed-task usage is aggregated across turns, invalid usage is rejected,
and unobserved behavior is reported as unavailable rather than synthetic zeroes.
One matched experiment compares `Baseline`, `Caveman Full`, `Ponytail Full`, and
`Both Full` through four ephemeral Codex proxy instances using the actual
LightRSI configuration and pipeline. The arms share fixtures, repetitions,
model, router state, runtime SHA, and provider. Promotion, intensity sweeps,
adapter reuse, and default-on changes remain blocked unless correctness,
measurement completeness, and mechanism-specific measurable benefit all pass.

## Execution Approach

- Mode: `inline sequential`
- Coordination: `none`
- Required skills: `skill-performance-optimization`, `skill-backend-verification`, `skill-test-driven-development`, `skill-code-standards`, `skill-verification-before-completion`, `ponytail:ponytail`
- Isolation: `current workspace` after Task 0 establishes the verified source checkpoint
- Commit policy: `no commits for Tasks 0–4`; after Task 4 verification, stop and request approval for one local checkpoint commit; Task 5 runs only from that clean checkpoint, with no push or merge
- Preauthorized local actions: edit plan-scoped source and tests, run declared local checks and mock benchmarks, and perform read-only Git inspection; publish benchmark manifests/reports and README updates only after the clean-checkpoint economic run completes
- User-approval actions: advancing the stale checkout, live provider traffic, credential use, external router writes, publication, commits, pushes, merges, destructive cleanup, or changing adapter/default rollout
- Parallel ownership: `none`; shared policy, pipeline, trace, and benchmark contracts require serialization
- Sequential fallback: execute Tasks 0–5 in order and stop at the first failed gate

## Task Breakdown

### Task 0: Establish the verified source checkpoint

**Purpose:**
- Ensure implementation starts from the merged generation-policy baseline rather than the stale local `main` checkout.

**Task Function:**
- Reconcile Git state, preserve unrelated local work, and capture baseline verification before edits.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: source-of-truth and workspace-safety prerequisite.

**Validator Profile:**
- Controller-selected: `<none>`
- Selection basis: read-only Git and baseline command evidence.

**Specification Coverage:**
- Verified current main, reproducible baseline, and no silent loss of unique local work.

**Required Skills:**
- `skill-verification-before-completion`, `skill-code-standards`

**Files And Symbols:**
- Inspect: `.git`, `git status --short`, local `main`, and `origin/main`
- Verify: `components/packages/foundation/product-surface`, `components/packages/foundation/host-adapter`, and `components/adapters/codex`

**Dependencies:**
- None.

**Authority:**
- Preauthorized local actions: read-only Git inspection and declared baseline checks.
- Stop for: uncommitted user changes, unique local commits, missing remote state, or any merge/rebase/reset/branch mutation not explicitly approved.

**Steps:**
- [ ] Step 1: Record `git status --short --branch`, `git rev-parse HEAD`, and `git rev-parse origin/main`.
- [ ] Step 2: Compare local and remote history with `git log --left-right --cherry-pick --oneline origin/main...HEAD` and inspect the diff stat.
- [ ] Step 3: If the checkout cannot safely advance to `72e478c73bce63392a3e27c630d434ee9400822e`, stop and report the exact preservation or approval needed.
- [ ] Step 4: Run focused baseline checks against the verified source: product-surface tests, host-adapter tests, Codex benchmark-policy tests, Codex typecheck, and `git diff --check`.

**Verification:**
- [ ] `git status --short --branch`
- [ ] `git rev-parse HEAD` and `git rev-parse origin/main`
- [ ] `pnpm --dir components/packages/foundation/product-surface test`
- [ ] `pnpm --dir components/packages/foundation/host-adapter test`
- [ ] `pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/benchmark-generation-policy.test.ts`
- [ ] `pnpm --dir components/adapters/codex typecheck`
- Expected: the source checkpoint is verified, no unique work is discarded, and baseline failures are recorded before Task 1.

**Exit Criteria:**
- A verified source checkpoint and baseline evidence exist; otherwise the plan is blocked before code changes.

### Task 1: Fix pipeline accounting and compile policy identity

**Purpose:**
- Remove false stable-prefix attribution and request-sized policy hashing while preserving the outbound payload and existing opt-in behavior.

**Task Function:**
- Change the canonical generation-policy and shared before-call seams, then prove exact composition and idempotence.

**Template Profile:**
- Controller-selected: `unresolved while task is pending`
- Selection basis: shared contract change with correctness and cache-identity risk.

**Validator Profile:**
- Controller-selected: `<none>`
- Selection basis: focused TypeScript tests and encoded-payload assertions.

**Specification Coverage:**
- Verdict phases 1 and 3: stable-prefix accounting, compiled identity, shared protections, and exact owned-block idempotence.

**Required Skills:**
- `skill-test-driven-development`, `skill-backend-verification`, `skill-code-standards`, `ponytail:ponytail`

**Files And Symbols:**
- Inspect/modify: `components/packages/foundation/product-surface/src/generation-policy.ts:applyGenerationPolicy`, `policyBlock`, `normalizeGenerationPolicyConfig`
- Inspect/modify: `components/adapters/codex/src/proxy-runtime.ts:startCodexResponsesProxy`
- Inspect/modify: `components/packages/foundation/host-adapter/src/pipeline/before-call.ts:prepareBeforeCall`
- Inspect/modify: `components/packages/foundation/host-adapter/src/pipeline/types.ts:BeforeCallDiagnostics`
- Verify: `components/packages/foundation/product-surface/tests/generation-policy.test.ts`
- Verify: `components/packages/features/stabilizer/tests/host-pipeline-integration.test.ts`
- Verify: `components/adapters/codex/tests/generation-policy-contract.test.ts`

**Dependencies:**
- Task 0 complete.

**Authority:**
- Preauthorized local actions: edit the named policy/pipeline sources and focused tests; run package tests and typechecks.
- Stop for: changes to stable-prefix cache identity, provider-visible metadata, policy ownership, or default enablement beyond the approved outcome.

**Steps:**
- [ ] Step 1: Keep persisted `generationPolicy` config limited to `enabled` and `level`; compile the normalized policy once inside `startCodexResponsesProxy` and pass runtime-only compiled state into the request path.
- [ ] Step 2: Add one compact shared protection clause to every enabled level, bump both effective policy versions from `v1` to `v2`, and avoid copying large provider-specific prompts or adding new levels.
- [ ] Step 3: Make the policy digest `null` when both mechanisms are disabled; otherwise hash only the generation-policy contract version and exact rendered policy block. Do not include messages, tools, session metadata, or cache fields.
- [ ] Step 4: Keep policy composition `base instructions -> Caveman -> Ponytail`; preserve disabled no-op, structured-output exclusion, tool/schema/history payloads, language, format, commands, paths, identifiers, numbers, validation, security, and explicit detail.
- [ ] Step 5: Compare stable-prefix output with the policy envelope in `prepareBeforeCall`, and test all four policy/stabilizer change combinations.
- [ ] Step 6: Test the actual metadata-loss boundary: apply policy, encode, decode/reconstruct, apply the same compiled policy again, and assert the owned block occurs exactly once. Use exact current owned-block matching only; do not add fuzzy prompt recognition.

**Verification:**
- [ ] Focused product-surface and host-pipeline tests.
- [ ] Codex generation-policy contract tests, including structured-output and tool-history cases.
- [ ] Expected: `generationPolicyApplied` and `stablePrefixApplied` are independently correct; persisted config has no runtime fields; policy identity is request-independent; v2 policy identity and exact owned-block idempotence hold.

**Exit Criteria:**
- The shared policy contract is correct, deterministic, and cheaper on the request path with no provider-wire or stable-prefix identity regression.

### Task 2: Measure local overhead, then retain only proven optimizations

**Purpose:**
- Establish whether trace and tail-read work is materially hot, then reduce only demonstrated overhead while separating LightRSI time from provider latency.

**Task Function:**
- Capture a fixed local baseline first, optimize only retained hotspots in the existing trace-store/file-store paths, and keep production timing coarse without creating another logging or benchmark subsystem.

**Template Profile:**
- Controller-selected: `unresolved while task is pending`
- Selection basis: measurement-first local performance work with write-completion and ordering risk.

**Validator Profile:**
- Controller-selected: `<none>`
- Selection basis: existing queue/file tests plus deterministic baseline-versus-candidate timing comparison.

**Specification Coverage:**
- Verdict phases 2 and 3: baseline measurement, conditional serialized trace lines/adjacent same-file batching, bounded tail scans, and local/provider/post-call timing separation.

**Required Skills:**
- `skill-performance-optimization`, `skill-backend-verification`, `skill-test-driven-development`

**Files And Symbols:**
- Inspect/modify: `components/packages/foundation/host-adapter/src/state/trace-store.ts:QueuedEventTrace`, `scheduleEventTraceDrain`, `enqueueEventTrace`
- Inspect/modify: `components/packages/foundation/host-adapter/src/state/file-store.ts:appendJsonl`, `readRecentJsonlEntries`
- Inspect/modify: `components/adapters/codex/src/benchmark-timing.ts:createBenchmarkTiming`
- Wire/verify: `components/adapters/codex/src/proxy-runtime.ts` request preparation, dispatch, stream, post-response, and write-completion trace boundaries
- Extend: `components/adapters/codex/scripts/benchmark-generation-policy.ts` with a local-overhead mode that directly exercises the trace queue, JSONL tail reader, and pre-dispatch pipeline using synthetic state-directory inputs
- Verify: `components/packages/foundation/host-adapter/tests/observability-store.test.ts`, `components/packages/foundation/host-adapter/tests/session-store.test.ts`, `components/adapters/codex/tests/trace.test.ts`, `components/adapters/codex/tests/benchmark-timing.test.ts`

**Dependencies:**
- Task 1 complete for correct policy/stable-prefix phase boundaries.

**Authority:**
- Preauthorized local actions: capture local baselines, edit the named I/O/timing sources and tests only for demonstrated hotspots, and run local benchmarks with synthetic state-directory data.
- Stop for: dropped required traces, changed ordering, completion semantics changing, fire-and-forget required writes, removal of the 256-record fallback, or provider traffic used as a local microbenchmark.

**Steps:**
- [ ] Step 1: Extend the existing `bench:generation-policy` command with `--mode local-overhead`, then capture fixed local baselines for trace enqueue p50/p95, queue delay, representative 256-record tail reads, and pre-dispatch local processing. Use 20 warmup iterations and 100 measured iterations per case, await write completion before timing ends, and write only synthetic state-directory data.
- [ ] Step 2: Only if profiling shows a material hotspot, store each queued trace item's serialized line and byte count once and batch adjacent entries for the same file. Preserve `queuedBytes`, `queuedRecords`, `droppedRecords`, and per-record failure accounting; a failed batch counts each affected record under existing settlement semantics.
- [ ] Step 3: Only if profiling shows tail reading is material, count delimiters in newly read chunks, stop after the requested bounded history, concatenate selected chunks once, and preserve malformed-tail fallback, UTF-8, rotation, empty-file, and newest-first behavior.
- [ ] Step 4: Keep production timing focused on `localPreDispatchMs`, `dispatchToHeadersMs`, TTFT/first useful output when observable, `providerTotalMs`, `localPostResponseMs`, and `endToEndMs`. Measure policy/stabilizer/reduction sub-stages individually in the local benchmark; non-streaming TTFT remains unavailable.
- [ ] Step 5: Compare each retained candidate with the baseline using p50/p95 and output/order/failure equivalence. Revert or omit candidates without repeatable improvement; do not add `fsync` or claim physical-storage durability.

**Verification:**
- [ ] Existing host-adapter, Codex trace, and timing tests.
- [ ] `pnpm --dir components/adapters/codex bench:generation-policy -- --mode local-overhead --warmup 20 --samples 100 --records 256`
- [ ] Fixed local benchmark with semantic/output and write-completion/order equivalence assertions; the command must directly call the named queue/file/pipeline seams rather than reuse provider/reduction timings.
- Expected: every candidate is baseline-measured; only repeatable improvements remain, and no required trace is lost or semantically reordered.

**Exit Criteria:**
- Only measured local improvements remain, with existing write-completion, ordering, queue-limit, failure-accounting, bounded-tail, and coarse production-timing semantics preserved.

### Task 3: Make effective runtime policy and bypass state provable

**Purpose:**
- Close the gap between configured policy and the policy actually applied to a provider request.

**Task Function:**
- Add one bounded evidence path through existing diagnostics, trace, status, and benchmark-row surfaces.

**Template Profile:**
- Controller-selected: `unresolved while task is pending`
- Selection basis: cross-cutting observability contract with no new service or persistence layer.

**Validator Profile:**
- Controller-selected: `<none>`
- Selection basis: request-level trace joins and existing status/benchmark tests.

**Specification Coverage:**
- Verdict sections 8 and 9: runtime/build SHA, effective modes, policy identity, applied state, bounded bypass reason, and cached 9Router preflight.

**Required Skills:**
- `skill-backend-verification`, `skill-test-driven-development`, `skill-code-standards`

**Files And Symbols:**
- Inspect/modify: `components/packages/foundation/host-adapter/src/pipeline/types.ts:BeforeCallDiagnostics` and `before-call.ts:prepareBeforeCall`
- Inspect/modify: `components/packages/foundation/product-surface/src/visual/session-visual-bridge.ts:prepareObservedBeforeCall`
- Inspect/modify: `components/packages/foundation/product-surface/src/presentation.ts:summarizeProductStatus`
- Inspect/modify: `components/adapters/codex/src/proxy-runtime.ts` startup/configuration, request trace, and response trace
- Inspect/modify: `components/adapters/codex/scripts/benchmark-generation-policy.ts:readRouterSettingsPreflight`, row/result types, and report builders
- Verify: `components/adapters/codex/tests/benchmark-generation-policy.test.ts`, Codex CLI/config tests, and session/report tests

**Dependencies:**
- Tasks 1 and 2 complete.

**Authority:**
- Preauthorized local actions: extend existing diagnostics, trace, status, and benchmark schemas; add focused tests and report fields.
- Stop for: request-by-request config rereads, full policy text in every trace, router settings writes, a new database/service, or guessed cache/provider evidence.

**Steps:**
- [ ] Step 1: Resolve `runtimeBuildId`, compiled policy identity, and startup router evidence once at proxy startup. Use build-injected metadata or `unavailable` when no Git SHA is available; do not walk `.git`, reread package/config files, or run `git rev-parse` per request.
- [ ] Step 2: Define a bounded actual-source bypass enum covering `disabled`, `structured_output`, `explicit_compaction`, `rebase`, `already_applied`, `not_applicable`, and `unavailable`; add `internal_contract` only if a concrete source path and focused test prove that classification.
- [ ] Step 3: Carry effective Caveman/Ponytail mode, policy version, policy digest, applied flag, bypass reason, request ID, and runtime/build SHA through existing diagnostics and trace records without changing provider payload bytes.
- [ ] Step 4: Record local phase timing and policy evidence together so benchmark rows can join request ID, runtime SHA, model, router preflight, and actual effective policy.
- [ ] Step 5: Keep ordinary 9Router verification at startup/doctor and cache it process-wide, but run a fresh machine-readable preflight immediately before each economic experiment. Warn on unknown in ordinary operation and fail closed or mark the experiment blocked/inconclusive when fresh trusted evidence is unavailable.
- [ ] Step 6: Label historical dashboard evidence as historical and preserve unknown cache outcomes as unknown; historical evidence cannot qualify as a fresh economic-run match.

**Verification:**
- [ ] Request-level tests prove applied, disabled, structured-output, compaction, rebase, internal, and already-applied paths.
- [ ] Trace/status/report tests prove all evidence fields and the request-to-row join.
- [ ] Expected: a configured `Full` row cannot be reported as `Full` unless the corresponding request evidence proves it.

**Exit Criteria:**
- Effective runtime policy is observable and bounded without hot-path config rereads or new persistence infrastructure.

### Task 4: Converge benchmark accounting on one completed-task runner

**Purpose:**
- Repair measurement semantics before any decision run and make incomplete evidence fail closed.

**Task Function:**
- Refactor the existing generation-policy benchmark around one completed-task result and one paired experiment comparator.

**Template Profile:**
- Controller-selected: `unresolved while task is pending`
- Selection basis: measurement correctness and maintenance reduction across existing Stage A/Stage B paths.

**Validator Profile:**
- Controller-selected: `<none>`
- Selection basis: deterministic mock fixtures, failure injection, and existing provider accounting tests.

**Specification Coverage:**
- Verdict sections 10–14: complete turn aggregation, valid usage, honest unavailable metrics, one runner, matched comparisons, independent promotion gates, and one bounded Ponytail engineering fixture.

**Required Skills:**
- `skill-performance-optimization`, `skill-backend-verification`, `skill-test-driven-development`, `skill-code-standards`

**Files And Symbols:**
- Inspect/modify: `components/adapters/codex/scripts/benchmark-generation-policy.ts:parseProviderUsage`, `sumUsage`, `runMatchedFixture`, `summarizeMatchedStageAArm`, `compareMatchedStageA`
- Inspect/modify: `components/adapters/codex/src/benchmark-timing.ts` result types as required by Task 2
- Verify/extend: `components/adapters/codex/tests/benchmark-generation-policy.test.ts`, `components/adapters/codex/tests/benchmark-timing.test.ts`
- Create/modify: dated manifest, results, and report files under `docs/benchmarks/`

**Dependencies:**
- Tasks 1–3 complete.

**Authority:**
- Preauthorized local actions: refactor existing benchmark code, add deterministic fixtures/tests, and write mock or approved experiment artifacts under `docs/benchmarks/`.
- Stop for: fabricated zeroes, incomplete usage treated as complete, unmatched workload/model/router/runtime, promotion from mock or exploratory evidence, or a second benchmark framework.

**Steps:**
- [ ] Step 1: Introduce `runCompletedTask({ fixture, arm, repetition, proxy })` as the single source for correctness, all responses, aggregated usage, provider calls, turns, latency, TTFT where available, actual events, errors, and runtime policy evidence. Each arm must execute through its actual configured LightRSI proxy; do not substitute arm instruction text or a benchmark-only policy override. Require one policy-evidence record for every attempted provider request in a task before treating the row as comparable.
- [ ] Step 2: Make `sumUsage` aggregate every response in a task, including input, cached input, output, reasoning when available, and total tokens; preserve missing values as unavailable.
- [ ] Step 3: Require finite non-negative usage at ingestion and reject `cachedInputTokens > inputTokens`; if provider semantics cannot prove the relationship, classify the row/economics as unavailable rather than computing negative uncached input.
- [ ] Step 4: Replace synthetic `toolCalls`, `retries`, and `clarifications` constants with observed events or nullable/unavailable fields; do not describe fixture shape as agent behavior.
- [ ] Step 5: Keep existing Stage A/Stage B paths as legacy or replay paths where needed; migrate only the decision-run path to the authoritative completed-task runner rather than rewriting every historical mode.
- [ ] Step 6: Add one small real Ponytail engineering fixture only through an existing executable Codex task path that can provide actual diff, tests, files, dependency/lockfile change, calls/turns, duration, and cost. If no such path exists, report engineering value as unavailable and do not build a new repository harness.
- [ ] Step 7: Record reasoning-token details separately when exposed, but do not add them to billed output/input cost unless the pinned provider pricing explicitly bills them as an additional category.
- [ ] Step 8: Make `runExperiment({ baseline, treatments, fixtures, repetitions })` own pairing and per-pair deltas; pair by fixture, repetition/seed, model, router state, runtime SHA, provider, and workload fingerprint.

**Verification:**
- [ ] Mock tests cover multi-turn aggregation, negative/non-finite/impossible usage, missing usage, failed attempts, unavailable event metrics, duplicate/missing workload rows, and exact pairing.
- [ ] Existing Stage A/Stage B tests remain green or are migrated to the one runner without changing their evidence meaning.
- Expected: every report distinguishes `pass`, `fail`, `inconclusive`, and `unavailable`; no metric is silently zero-filled.

**Exit Criteria:**
- One completed-task accounting path is authoritative and produces trustworthy paired results or an explicit inconclusive outcome.

### Task 5: Run one matched experiment and record the rollout gate

**Purpose:**
- Produce the single bounded evidence decision requested by the verdict without expanding adapters or defaults prematurely.

**Task Function:**
- Freeze the workload and environment, run the four-arm matched experiment, and reconcile evidence into a dated report and next-step decision.

**Template Profile:**
- Controller-selected: `unresolved while task is pending`
- Selection basis: live measurement and promotion decision require higher operational care than local code edits.

**Validator Profile:**
- Controller-selected: `<none>`
- Selection basis: report/schema checks and final verification skill.

**Specification Coverage:**
- Verdict phases 4 and 5: matched `Baseline`, `Caveman Full`, `Ponytail Full`, `Both Full`; independent gates; no expansion without evidence.

**Required Skills:**
- `skill-performance-optimization`, `skill-backend-verification`, `skill-verification-before-completion`

**Files And Symbols:**
- Inspect/modify: `components/adapters/codex/scripts/benchmark-generation-policy.ts:runExperiment` and report builders
- Create after the clean-checkpoint run: dated frozen manifest, results, and report under `docs/benchmarks/`; use an external temporary output directory for all pre-run and in-run artifacts
- Verify/modify only if claims change: `README.md`
- Verify: 9Router preflight evidence, runtime/build SHA, provider/model state, and working-tree cleanliness

**Dependencies:**
- Tasks 0–4 complete with all required checks passing.

**Authority:**
- Preauthorized local actions: freeze manifests and run mock smoke checks using an external temporary output directory, then analyze results and publish dated benchmark artifacts only after the clean-checkpoint economic run completes.
- Stop for: live provider traffic or credential use without explicit approval, unknown/mismatched router state, incomplete usage, runtime drift, failed correctness, or unmatched arms.

**Steps:**
- [ ] Step 1: Freeze one manifest in an external temporary output directory containing source/runtime SHA, benchmark SHA, provider/model, router preflight, workload fingerprint, fixtures, deterministic arm-rotation schedule/seed, repetition and provider-call caps, per-request timeout, pinned pricing, maximum estimated spend, policy arms, and acceptance thresholds; do not create or modify tracked files before the clean-checkpoint guard.
- [ ] Step 2: Run a local/mock smoke to prove manifest identity, row joins, correctness oracle, and report generation before any live request, writing only to the external temporary output directory.
- [ ] Step 3: Immediately before the economic run, confirm `git status --porcelain` is empty and perform a fresh router preflight; with explicit live-run approval, start four ephemeral LightRSI proxies for exactly `Baseline`, `Caveman Full`, `Ponytail Full`, and `Both Full`, each with the same source/build, model, provider, router, and workload but a separate temporary state directory and distinct local port. Supply the four proxy URLs through `LIGHTRSI_BENCHMARK_BASELINE_BASE_URL`, `LIGHTRSI_BENCHMARK_CAVEMAN_FULL_BASE_URL`, `LIGHTRSI_BENCHMARK_PONYTAIL_FULL_BASE_URL`, and `LIGHTRSI_BENCHMARK_BOTH_FULL_BASE_URL`; fail closed if any is missing or duplicated.
- [ ] Step 4: Run a one-repetition four-arm smoke first. Stop if correctness, policy evidence, usage completeness, runtime identity, router match, or row joins fail; only then run the bounded full schedule with deterministic arm rotation, cleanup, and the frozen caps.
- [ ] Step 5: Stop when maximum repetitions, maximum actual provider calls, timeout, or spend cap is exhausted. Do not treat missing usage as zero for cap enforcement; reserve conservatively or mark the run blocked/inconclusive.
- [ ] Step 6: Report per-pair deltas before pooled summaries for correctness, structured validity, tools, turns, retries, clarifications, output, provider calls, local phase latency, TTFT, end-to-end duration, total cost, and Ponytail engineering metrics where observed.
- [ ] Step 7: Promote neither mechanism unless its own correctness and meaningful benefit gate passes without meaningful regressions. Test intensity sweeps, combined winners, adapter reuse, and default changes only in a new approved follow-up plan after the gate.
- [ ] Step 8: After the run, copy the external manifest/results/report into `docs/benchmarks/` and update README only to document measured evidence and the unchanged Codex-only opt-in/default contract; do not claim provider or engineering benefit from unavailable data.

**Verification:**
- [ ] Frozen-manifest identity and report-schema checks.
- [ ] `pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/benchmark-generation-policy.test.ts`
- [ ] Expected: the four arms are contemporaneous and comparable, all unavailable evidence is explicit, and the decision is `promotion-candidate` only when the stated gates pass.

**Exit Criteria:**
- One matched experiment is recorded as promotion candidate, no-promotion, or inconclusive; no adapter/default expansion occurs without a separate approved plan.

## Execution Record

- Task 0: complete. The checkout is verified at `72e478c73bce63392a3e27c630d434ee9400822e`; dependencies were repaired with the frozen lockfile and the baseline focused checks passed.
- Task 1: complete. Policy identity is compiled once, stable-prefix attribution compares against the policy envelope, policy versions are `v2`, disabled digests are `null`, and exact owned-block idempotence is covered.
- Task 2: complete. Trace batching was retained after repeatable local improvement; tail-read optimization was measured and reverted after regression. The retained local-overhead run preserves trace count/order, bounded tail semantics, and pre-dispatch stability.
- Task 3: complete for local evidence. Before/after traces and response headers carry request ID, runtime build ID, policy version/digest, applied state, and bounded bypass reason. Matched economic runs require fresh settings API preflight; dashboard evidence remains historical/unavailable for that gate. A live local-upstream probe also passed enabled, disabled, structured-output bypass, already-owned-block idempotence, stream, upstream-header-spoof resistance, and request-ID trace joins; the probe confirmed that intermediate transport trace rows intentionally omit policy fields while policy-bearing before/after rows agree.
- Task 4: complete for accounting. The completed-task runner aggregates known multi-turn usage without fabricating missing fields, rejects impossible usage, observes tool calls, requires one policy-evidence record per attempted provider request, leaves retries/clarifications unavailable, and keeps incomplete workload/evidence non-comparable. Engineering value remains unavailable because no existing executable Codex task fixture was found.
- Measured local overhead: the retained trace-batch candidate repeated at p50/p95 `1.207/1.876 ms` and `1.607/2.389 ms`; the prior baseline was `7.564/8.192 ms`. Tail-read optimization was not retained. These are local synthetic measurements, not provider evidence.
- Task 5: pending. Per the commit policy, stop here and request approval for one local checkpoint commit before generating the external manifest or running the four-arm experiment.

## Verification

- `pnpm --dir components/packages/foundation/host-adapter typecheck`
- `pnpm --dir components/packages/foundation/host-adapter test`
- `pnpm --dir components/packages/foundation/product-surface typecheck`
- `pnpm --dir components/packages/foundation/product-surface test`
- `pnpm --dir components/packages/features/stabilizer test`
- `pnpm --dir components/adapters/codex typecheck`
- `pnpm --dir components/adapters/codex test`
- `pnpm typecheck`
- `pnpm test`
- `git diff --check`
- Final benchmark artifacts must identify frozen runtime/workload/router state and distinguish measured, unavailable, inconclusive, and historical evidence.

## Completion Criteria

The plan is ready for completion verification when:

1. Task 0 establishes the verified merged baseline or records a concrete blocker before implementation.
2. Stable-prefix accounting, compiled policy identity, shared protections, and exact idempotence pass focused tests.
3. Trace/tail candidates are measured against a fixed local baseline; only repeatable improvements remain, while write-completion, ordering, bounded fallback, failure accounting, and output semantics are preserved.
4. Runtime policy evidence joins each measured request to effective state, bypass reason, runtime SHA, and policy digest without hot-path config rereads.
5. Benchmark accounting aggregates every turn, rejects impossible usage, and leaves unobserved behavior unavailable rather than synthetic.
6. One matched four-arm completed-task experiment is frozen and reported with per-pair deltas and complete preflight evidence.
7. No adapter expansion, default-on change, intensity sweep, or combined interaction matrix is admitted without a separate evidence-backed plan.
8. Changed source, tests, manifests, reports, and README claims reconcile with repository truth, and `skill-verification-before-completion` returns `verified`.

Deferred by design: Claude Code/OpenClaw reuse, default-on rollout, Lite/Full/Ultra intensity sweeps, full interaction matrices, response compression, second inference passes, adaptive policy selection, new policy services/databases, provider-specific policy copies, automatic Cleaner release, and cross-repository 9Router edits.
