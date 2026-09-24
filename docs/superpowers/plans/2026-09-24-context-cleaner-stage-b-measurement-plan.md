---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: completed
layer: change
name: Context Cleaner Stage B Measurement
targets:
  - docs/superpowers/experiments/2026-09-24-context-cleaner-stage-b.json
  - components/adapters/codex/scripts/benchmark-context-cleaner.ts
  - components/adapters/codex/tests/benchmark-timing.test.ts
---

# Context Cleaner Stage B Measurement

## Verdict Review

The supplied Stage B verdict is sound and implementation-ready after these
scope corrections:

- Keep existing `baseline` and `cleaner` code arms. Report them as semantic
  `Keep` and `Release`; do not rename unrelated runtime concepts.
- Record `runtimeSha` and `benchmarkSha` separately. Measured runtime stays
  pinned to `a0813871f81abde8988b7b70ea20b66613f9eef3`; benchmark-only edits may
  use later implementation commit.
- Treat current scripted harness as proof of deterministic retention, release,
  recovery-path behavior, and economics—not full coding-agent task completion.
- Do not add automatic recovery or new agent controller. Recovery fixture may
  use only existing Cleaner recovery/restart behavior; otherwise report
  recovery correctness unsupported and economic status inconclusive.
- Keep live-provider execution out of implementation. Offline proof first;
  provider calls require later explicit approval of manifest, spending cap,
  and credentials.

## Goal

Extend existing Context Cleaner occurrence-release benchmark so Stage B measures
marginal Keep versus Release economics with complete failure, continuation,
cache, correctness, and recovery evidence, without changing production Cleaner
behavior or creating another benchmark framework.

## Primary Comparison

| Report term | Existing code arm | Behavior |
| --- | --- | --- |
| Keep | `baseline` | Retain selected occurrence |
| Release | `cleaner` | Release same occurrence |

Both arms use LightRSI, equivalent causal seed history, one release in primary
mode, alternating order, and same logical task objective.

Direct-provider comparison remains deferred. It is a separate experiment.

## Scope

### In scope

- Experiment manifest with pinned runtime, benchmark commit, lockfile,
  fixtures, cache condition, provider/model, pricing, sample count, spending
  cap, and acceptance gates.
- Benchmark-only attempt capture and failure accounting.
- Unequal continuation/recovery request handling by logical checkpoint.
- Seed-cost separation from attributable release and continuation cost.
- Provider usage finalization before result construction.
- Failure-tolerant report generation with explicit execution, measurement,
  correctness, and economic statuses.
- Four deterministic scripted task fixtures and explicit oracles.
- Cold/warm cache intent and observed cache evidence.
- Mock/offline verification and report-shape checks.

### Out of scope

- Production Cleaner, proxy, cache, or release-policy changes.
- Runtime profitability prediction or automatic pruning.
- Agent-directed selection evaluation.
- Full coding-agent/tool execution claims.
- New lifecycle controller, persistent attempt registry, pricing service, or
  experiment framework.
- Live-provider calls in implementation phase.

## Experiment Contract

Create `docs/superpowers/experiments/2026-09-24-context-cleaner-stage-b.json`
as human-readable immutable run contract. Keep it independent from generated
result files.

Required fields:

```json
{
  "experiment": "context-cleaner-stage-b",
  "runtimeSha": "a0813871f81abde8988b7b70ea20b66613f9eef3",
  "benchmarkSha": "filled-at-execution",
  "comparison": { "keep": "baseline", "release": "cleaner" },
  "releaseMode": "one-release",
  "controls": { "causalPairs": true, "armOrder": "alternating" },
  "measurement": {
    "providerUsage": "required",
    "cacheEvidence": "required",
    "correctness": "required",
    "recoveryCost": "required"
  },
  "outcomes": [
    "monetaryCost",
    "taskCorrectness",
    "taskDuration",
    "recovery",
    "cumulativeBreakEven"
  ],
  "decisionStates": ["pass", "fail", "inconclusive"]
}
```

Manifest must also define fixture IDs, release position, cache intent, oracle,
provider/model, dated pricing snapshot, repetition count, spending cap, and
numeric acceptance thresholds. Runner defaults must not silently replace these
values during an approved run.

## Task Breakdown

### Task 1: Freeze manifest and fixture contract

**Owner:** manifest and `components/adapters/codex/scripts/benchmark-context-cleaner.ts`.

**Dependencies:** None.

1. Define four fixture IDs using existing scripted request mechanics:
   - short history, early release: unnecessary-release overhead;
   - long obsolete history, early release: cumulative benefit;
   - long obsolete history, late release: release-position effect;
   - release followed by existing recovery/restart path: recovery economics.
2. Give every fixture explicit retained evidence, releasable evidence,
   release position, intended cache condition, expected markers, and stopping
   boundary.
3. Keep fixture generation deterministic. Hash manifest and include hash in
   generated reports.
4. Use `baseline`/`cleaner` internally; expose Keep/Release aliases only in
   report metadata.

**Proof:** Unit tests reject unknown fixture IDs, missing oracle fields, and
non-deterministic fixture definitions.

### Task 2: Capture every provider attempt

**Owner:** `captureLiveProvider()` and `UpstreamRequest` in
`components/adapters/codex/scripts/benchmark-context-cleaner.ts`.

**Dependencies:** Task 1.

1. Register attempt before `fetch()` dispatch.
2. Update same record with headers, response usage, stream completion, duration,
   and output diagnostics.
3. Record `provider_error`, `transport_error`, `timeout`, and `cancelled`
   outcomes with reason and null usage fields.
4. Keep record experiment-local. Do not add persistent lifecycle store.
5. Await pending cloned-response consumers before constructing `RunResult`.
6. Preserve partial attempts in successful and failed run reports.

**Proof:** Inject rejected fetch, non-200 response, timeout, malformed usage,
and incomplete stream cases. Each produces attempt record and no invented usage.

### Task 3: Make economics valid for unequal paths

**Owner:** usage/comparison helpers, `runArm()`, `pairedDifferences()`, and
report construction in `benchmark-context-cleaner.ts`.

**Dependencies:** Task 2.

1. Keep shared seed observations separate from arm-attributable observations.
   Seed preparation is reported once for campaign spending and excluded from
   marginal Keep-versus-Release deltas.
2. Aggregate each arm independently. Do not require equal provider request
   counts when Release incurs recovery calls or early termination.
3. Align cumulative checkpoints by logical labels/milestones, not request-array
   indexes.
4. Preserve strict `usageDelta()` behavior for existing direct helper tests;
   add separate variable-length aggregate path for Stage B.
5. Account release decision, rebase/recovery, and continuation overhead once.
6. Keep provider-reported missing fields distinct from valid zero values.
7. Calculate monetary cost only when required usage and dated pricing data are
   complete. Keep calculated cost distinct from provider-billed cost.

**Proof:** Deterministic cases cover unequal request counts, missing usage,
valid zero cached tokens, invalid cached tokens, seed cost exclusion, delayed
break-even, temporary break-even, and recovery-erased savings.

### Task 4: Produce failure-tolerant status and report

**Owner:** `main()` and report helpers in
`components/adapters/codex/scripts/benchmark-context-cleaner.ts`.

**Dependencies:** Task 3.

1. Always write report after seed, clone, provider, pair, or comparison failure
   when output path creation is possible.
2. Preserve completed runs, attempts, failure reason, last successful
   checkpoint, effective configuration, and manifest hash.
3. Add separate fields:
   - `executionStatus`: complete, partial, or failed;
   - `measurementStatus`: complete, incomplete, or unavailable;
   - `correctnessStatus`: pass, fail, or unavailable;
   - `economicStatus`: pass, fail, or inconclusive.
4. Set process success only when required gates pass. Never turn incomplete
   provider evidence into economic PASS.
5. Keep existing `one-release` and `lifecycle` modes working.

**Proof:** Force failure before pair completion and assert report existence,
partial observations, failure reason, and non-PASS economic status.

### Task 5: Add deterministic correctness evidence

**Owner:** fixture/oracle helpers and
`components/adapters/codex/tests/benchmark-timing.test.ts`.

**Dependencies:** Tasks 1–4.

1. Verify retained evidence remains available in Release arm.
2. Verify selected release markers disappear only after release boundary.
3. Verify Keep arm retains released markers.
4. Verify lifecycle restart preserves expected post-release state.
5. Exercise recovery fixture only through existing recovery/restart behavior.
   If no existing path restores released evidence, record limitation and mark
   correctness/economic recovery outcome inconclusive rather than adding
   recovery behavior to benchmark.
6. Report deterministic task correctness separately from coding-agent success.

**Proof:** Mock benchmark runs all four fixtures and emits per-fixture oracle
results, not only aggregate `passed` boolean.

### Task 6: Offline verification and handoff

**Owner:** lead controller.

**Dependencies:** Tasks 1–5.

Run, in order:

```text
pnpm --dir components/adapters/codex test
pnpm --dir components/adapters/codex typecheck
pnpm --dir components/adapters/codex build
LIGHTRSI_BENCHMARK_MODE=mock LIGHTRSI_BENCHMARK_RELEASE_MODE=one-release LIGHTRSI_BENCHMARK_CAUSAL_PAIRS=true LIGHTRSI_BENCHMARK_ARM_ORDER=alternating pnpm --dir components/adapters/codex bench:context-cleaner
LIGHTRSI_BENCHMARK_MODE=mock LIGHTRSI_BENCHMARK_RELEASE_MODE=lifecycle LIGHTRSI_BENCHMARK_CAUSAL_PAIRS=true LIGHTRSI_BENCHMARK_ARM_ORDER=alternating pnpm --dir components/adapters/codex bench:context-cleaner
```

PowerShell uses `$env:NAME=value` equivalents for environment variables. Store
generated reports outside Git unless sanitized summary is explicitly approved.

**Exit criteria:** focused tests, adapter typecheck, adapter build, both mock
modes, injected failure cases, manifest validation, and report-shape checks
pass. No production runtime files change.

## Live-Provider Gate

Live execution is later, separately approved action. Before provider call,
approve:

- final manifest and fixture hashes;
- runtime SHA and benchmark SHA;
- resolved provider/model and dated pricing;
- repetition count and spending cap;
- credential source and raw-result storage location;
- pass/fail/inconclusive thresholds.

Run one instrumentation pilot first. Continue only if usage completeness, cache
evidence, correctness, and cost accounting are valid. Stop on cap, missing
required evidence, task-correctness failure, or runtime drift.

## Acceptance Criteria

- Runtime behavior at pinned `runtimeSha` remains unchanged.
- Keep and Release start from equivalent causal seed state.
- Every provider attempt is visible, including rejected and timed-out attempts.
- Seed cost is not counted twice in marginal economics.
- Unequal continuation/recovery paths remain comparable by logical milestone.
- Missing usage or cache evidence yields incomplete/inconclusive status, never
  a zero-cost claim.
- Four fixtures emit deterministic correctness results and intended cache
  conditions.
- Reports survive partial failures and include metadata to reproduce the run.
- Existing lifecycle behavior and tests remain green.
- No live-provider call occurs during implementation or offline verification.

## Non-Goals And Stop Conditions

Stop and revise plan if implementation requires:

- changes under production Cleaner, proxy, cache, or runtime policy owners;
- a second attempt registry or orchestration framework;
- a general-purpose task runner or agent controller;
- claims of full coding-agent task success from scripted fixtures;
- live-provider credentials before offline gates pass.

## Required Skills

- `skill-writing-plans`
- `skill-plan-document-reviewer`
- `skill-test-driven-development`
- `skill-performance-optimization`
- `skill-verification-before-completion`

`skill-backend-verification` is not required for measurement-only change unless
implementation crosses production runtime boundary.
