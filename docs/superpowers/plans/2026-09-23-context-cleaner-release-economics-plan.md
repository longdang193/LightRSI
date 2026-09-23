---
layer: change
artifact_type: plan
status: completed
template_id: implementation-plan
contract_version: "1"
name: Context Cleaner Release Economics
targets:
  - components/adapters/codex/scripts/benchmark-context-cleaner.ts
  - components/adapters/codex/tests/benchmark-timing.test.ts
---

# Context Cleaner Release Economics

## Verdict Review

The recommendation is sound. Existing `benchmark-context-cleaner.ts` already
owns paired baseline/Cleaner execution, causal-pair seeding, alternating arm
order, mock/live provider capture, local timing, provider-wire comparison,
multiple release points, and restart continuation. The smallest safe change is
to complete its accounting and comparability rules; no runtime Cleaner policy
or second benchmark framework is needed.

Stage A is approved for implementation now:

- strict provider-usage completeness;
- one controlled release-economics comparison with a fixed observed horizon;
- cumulative paired accounting with first and sustained break-even;
- deterministic synthetic regression cases for missing evidence and recovery
  economics.

Stage B remains deferred until approved provider access and representative task
fixtures exist: matched live-provider economics, task-success measurement,
provider token/cache/TTFT/cost evidence, and real recovery/continuation cost.

## Goal

Extend the existing Context Cleaner benchmark so it can answer, without false
zeroes or unsupported extrapolation, whether one release produces cumulative
observed savings after cache disruption, rebase, and recovery overhead.

## Implementation Outcomes

- Missing usage stays missing; valid `cachedInputTokens: 0` stays valid zero.
- Each comparison reports expected requests, observed input/output/cached
  counts, and `complete`, `incomplete`, or `unavailable` economic status.
- Invalid usage (`cachedInputTokens > inputTokens`) and unequal request counts
  invalidate economic comparison rather than producing a partial total.
- Baseline and Cleaner share identical seeded pre-release history and one
  controlled release decision with a fixed uninterrupted continuation horizon.
- Existing lifecycle coverage for two releases and restart continuation remains
  intact; it is not used as the primary attribution unit for one-release
  economics.
- Cleaner accounting includes inspection, preview, rebase, and recovery
  overhead once, with no double subtraction.
- Cumulative checkpoints report `KeepCost(H)`, `ReleaseCost(H)`, and
  `NetSavings(H) = KeepCost(H) - ReleaseCost(H)` only for observed checkpoints.
- Output distinguishes first break-even from sustained break-even and reports
  no extrapolated future savings.
- Synthetic tests cover missing usage, legitimate zero cache usage, unequal
  request counts, delayed and temporary break-even, recovery erasing initial
  savings, and incomparable pre-release histories.

## Non-goals

- No runtime profitability predictor, automatic pruning, cache-aware controller,
  remaining-session estimator, or persistent cache-benefit registry.
- No provider/model-capacity registry or provider-price constants inside
  Context Cleaner.
- No monetary savings without complete usage plus explicit pricing/billing
  input.
- No new benchmark framework.
- No task-success claim from synthetic fixtures.
- No live-provider Stage B work in this change.

Cleaner remains agent-directed: the agent selects exact occurrences, Cleaner
validates and executes, and this benchmark measures consequences.

## Execution Approach

Use `skill-performance-optimization` for stable workload and measurement
conditions, `skill-test-driven-development` for the accounting contract and
regressions, and `skill-verification-before-completion` for final proof.
Before execution, run `skill-plan-document-reviewer` against this plan.

Keep all implementation in the two target files. Reuse current `ProviderUsage`,
`RunResult`, `providerUsage()`, `runArm()`, `pairedDifferences()`,
`usageDelta()`, `summarizeProviderUsage()`, and `main()` paths. Export only
small pure helpers required by tests; do not introduce a general accounting
package or pricing abstraction.

## Task Breakdown

### Task 0: Pin contract and reproduce invalid comparisons

**Owner:** `components/adapters/codex/scripts/benchmark-context-cleaner.ts`
and `components/adapters/codex/tests/benchmark-timing.test.ts`.

**Dependencies:** None.

1. Record current behavior around `ProviderUsage`, `RunResult`,
   `pairedDifferences()`, `usageDelta()`, and `summarizeProviderUsage()`.
2. Add failing deterministic tests for missing provider usage, valid zero cache
   tokens, unequal request counts, and divergent pre-release histories.
3. Define the smallest pure result shape needed by the benchmark output:
   expected request count, per-field observed counts, completeness state,
   invalid reason, and cumulative checkpoint fields.

**Task proof:** Tests fail for the old partial-sum/zero-fallback behavior and
pass for the valid zero-cache fixture.

### Task 1: Enforce strict usage completeness

**Owner:** `benchmark-context-cleaner.ts` helpers around `providerUsage()`,
`usageDelta()`, and `summarizeProviderUsage()`; tests in
`benchmark-timing.test.ts`.

**Dependencies:** Task 0.

1. Preserve `null` for absent provider usage and absent usage fields.
2. Treat numeric zero as observed evidence, including cached input tokens.
3. Validate finite non-negative token counts and reject cached input greater
   than input tokens.
4. Count expected requests from the compared run window, not from observed
   usage entries.
5. Mark an economic comparison `complete` only when every required request has
   valid input, output, and cached-input evidence and both arms have equal
   request counts. Use `incomplete` for missing/invalid evidence and
   `unavailable` when provider usage is not exposed by the selected mode.
6. Make totals nullable when incomplete; never coerce missing values to zero.
7. Print the reason and observed/expected counts without logging prompts,
   credentials, or raw provider payloads.

**Task proof:** Focused tests prove missing usage cannot produce a savings
number, zero cached tokens remain complete when other fields exist, invalid
cached counts invalidate comparison, and request-count mismatch invalidates
comparison.

### Task 2: Add one-release fixed-horizon comparison

**Owner:** `runArm()` and `main()` in `benchmark-context-cleaner.ts`; tests in
`benchmark-timing.test.ts` for pure selection/configuration helpers only.

**Dependencies:** Task 1.

1. Preserve the existing two-release/restart lifecycle path for lifecycle
   coverage.
2. Add the minimum benchmark mode or fixture path that runs one release point
   followed by one fixed, uninterrupted continuation horizon for both arms.
3. Seed identical pre-release history and keep causal-pair and arm-order
   controls active.
4. Define the horizon from observed turns/checkpoints, not a projected session
   lifetime. Do not extrapolate beyond captured data.
5. Attribute Cleaner inspection, preview, rebase, and recovery work once in
   Cleaner-side cost accounting. Keep release-side and continuation-side costs
   in separate labeled components so they cannot be subtracted twice.
6. Reject or label comparisons where pre-release provider shape, cache
   identity, request count, or seeded history diverges.

**Task proof:** Mock benchmark output shows equal pre-release inputs, one
release decision, a fixed observed continuation, and explicit recovery cost;
existing two-release/restart behavior remains covered by the benchmark command.

### Task 3: Report cumulative economics and break-even

**Owner:** `pairedDifferences()`, `usageDelta()`,
`summarizeProviderUsage()`, and `main()` in `benchmark-context-cleaner.ts`;
tests in `benchmark-timing.test.ts`.

**Dependencies:** Tasks 1–2.

1. Build cumulative checkpoints from paired observed turns/checkpoints.
2. Report per-checkpoint Keep cost, Release cost, and net savings using one
   authoritative sign convention: positive net savings means Cleaner costs
   less than Keep.
3. Include local timing/input-byte metrics already captured by the benchmark;
   include provider token metrics only when the completeness contract is
   complete.
4. Report `firstBreakEven` as the first observed checkpoint with positive net
   savings.
5. Report `sustainedBreakEven` only when net savings stays positive through the
   end of the observed horizon; otherwise report absent/false with the final
   checkpoint state.
6. Distinguish delayed break-even, temporary break-even, and recovery-erased
   savings in output. Do not turn any of these into a pass/fail claim without
   an approved target.
7. Keep monetary calculations out of the benchmark unless explicit pricing
   input is supplied; token totals alone are not dollars.

**Task proof:** Deterministic fixtures prove delayed break-even, temporary
break-even, and recovery removing initial savings. Output contains no
future-session estimate.

### Task 4: Focused and final verification

**Owner:** Lead controller; implementation ownership remains limited to the two
target files.

**Dependencies:** Tasks 0–3.

1. Run `pnpm --dir components/adapters/codex test`.
2. Run `pnpm --dir components/adapters/codex typecheck`.
3. Run `pnpm --dir components/adapters/codex run bench:context-cleaner` in
   mock mode with fixed repetitions and fixtures; retain raw output.
4. Run workspace `pnpm test`, `pnpm typecheck`, and `pnpm build`.
5. Inspect final diff and Git state for only the two target files plus this
   plan; no generated agent surface changes are allowed.
6. Record Stage B deferral and any provider-unavailable result separately from
   successful mock evidence.

**Task proof:** Fresh command output, final diff, and benchmark artifact prove
  every completion criterion. A failed required check stays unresolved; do not
  mark this plan complete or claim provider economics.

## Verification

- [x] Plan passes `skill-plan-document-reviewer` with no unresolved P1/P2.
- [x] Missing usage remains missing and cannot yield an economic delta.
- [x] Recorded zero cached tokens is accepted as observed evidence.
- [x] Cached tokens greater than input tokens invalidate comparison.
- [x] Unequal request counts and incomparable pre-release histories invalidate
      economic comparison.
- [x] One-release fixed-horizon mock experiment preserves identical seeded
      history and counts recovery overhead once.
- [x] Cumulative checkpoints use one sign convention and observed data only.
- [x] First and sustained break-even are distinct.
- [x] Delayed, temporary, and recovery-erased savings tests pass.
- [x] Focused adapter tests and typecheck pass.
- [x] Mock benchmark command completes with reproducible settings.
- [x] Workspace test, typecheck, and build pass.
- [x] Stage B live-provider economics and task-success claims remain deferred.

## Execution Evidence

- `pnpm --dir components/adapters/codex exec node --import tsx --test tests/benchmark-timing.test.ts` — 9 passed.
- `pnpm --dir components/adapters/codex test` — 479 passed.
- `pnpm --dir components/adapters/codex typecheck` — passed.
- `LIGHTRSI_BENCHMARK_RELEASE_MODE=one-release` mock run — passed; one pair, comparable pre-release history, recovery overhead recorded.
- `LIGHTRSI_BENCHMARK_RELEASE_MODE=lifecycle` mock run — passed; existing two-release/restart lifecycle preserved.
- `pnpm typecheck` — passed.
- `pnpm test` — passed.
- `pnpm build` — passed.

## Completion Criteria

- Every Stage A outcome is implemented in the existing benchmark without a new
  runtime decision owner or framework.
- Every required accounting edge case has a deterministic regression test.
- Benchmark output refuses incomplete or incomparable economic claims instead
  of silently substituting zeroes.
- Break-even output remains cumulative, observed-horizon-only, and explicit
  about recovery cost.
- All required verification commands pass with fresh output.
- Final Git diff contains no unrelated implementation or generated changes.
- Plan status changes from `proposed` only after execution and verification;
  plan completion does not authorize commit, push, PR, or merge.
