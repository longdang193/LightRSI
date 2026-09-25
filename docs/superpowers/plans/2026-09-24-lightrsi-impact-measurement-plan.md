---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: complete
layer: change
created_at: 2026-09-24
repository: LightMem2
base_commit: d6517fd346671d4d2f2cada5c4da58881caba3ef
---

# LightRSI Impact Measurement

## Goal

Produce defensible, CV-ready evidence for LightRSI with an original-versus-fork
comparison as the headline result. Separate combined fork impact from
before/after engineering optimizations and Context Cleaner Keep/Release
economics. Reuse existing harnesses. Add one sanitized report. Do not change
production runtime behavior.

## Implementation Outcomes

### Evidence ledger

Create an evidence ledger that labels every proposed CV metric as measured,
derived, unavailable, or deferred. Scope each number to its workload, commit,
sample count, and measurement type.

### Reproducible impact report

Create `docs/benchmarks/impact-report.md` with local benchmark results, any
approved live-provider results, reliability evidence, reproduction commands,
limitations, and CV-ready wording. Exclude credentials, raw prompts, raw tool
payloads, and private session identifiers.

### Original-versus-fork impact comparison

Compare the original `zjunlp/LightRSI` revision used as the fork base with the
evaluated fork revision from `longdang193/LightRSI`. Use identical tasks,
provider, model, pricing, hardware, prompts, concurrency, cache conditions,
and deterministic verifiers. Report input/output tokens, provider cost,
cache efficiency, end-to-end latency, successful task completion, recovery,
and runtime overhead. Treat unsupported fork-only capabilities as `N/A`, not
as zero improvement.

### Validated CV claims

Support current claims for diagnostic output reduction and indexed recovery
latency. Add provider token, cost, and successful-task claims only when live
usage, cache evidence, and correctness gates pass.

## Execution Approach

- Mode: `inline sequential`
- Coordination: `none`
- Required skills: `skill-performance-optimization`, `skill-verification-before-completion`
- Isolation: `current workspace`
- Commit policy: `no commits during execution`
- Preauthorized local actions: inspect repository evidence, run existing local benchmarks, and write the sanitized report
- User-approval actions: live provider calls, credential use, upstream checkout, external writes, publication, or destructive cleanup
- Parallel ownership: none
- Sequential fallback: Task 1, then Task 2, then Task 5, then Task 4, then Task 3, then Task 6

## Task Breakdown

### Task 1: Build evidence and attribution ledger

**Disposition:** Completed. Claim boundaries and unsupported metrics were classified against repository sources.

**Purpose:** Identify claims already supported by repository evidence and prevent attribution drift.

**Task Function:** Evidence audit and claim classification.

**Template Profile:**
- Controller-selected: `unresolved`
- Selection basis: bounded source inspection; low implementation risk.

**Required Skills:**
- `skill-performance-optimization`

**Files And Symbols:**
- Inspect: `README.md`
- Inspect: `docs/intent/2026-09-23-lightrsi-p1-closure-plan.md`
- Inspect: `docs/superpowers/experiments/2026-09-24-context-cleaner-stage-b.json`
- Inspect: `components/adapters/codex/scripts/benchmark-context-cleaner.ts`
- Inspect: `components/adapters/codex/scripts/benchmark-forwarding.ts`
- Inspect: `components/packages/foundation/artifact-store/scripts/bench-recovery.mjs`
- Verify: proposed CV claim table

**Dependencies:**
- Clean workspace at base commit `d6517fd346671d4d2f2cada5c4da58881caba3ef`.

**Authority:**
- Preauthorized local actions: read repository files and classify existing claims without editing production code.
- Stop for: missing evidence, conflicting source-of-truth documents, or any need to invent measurements.

**Steps:**
- [x] Classify fork-level, before/after, and Keep/Release comparisons.
- [x] Mark diagnostic bytes, indexed recovery latency, local timing, provider economics, full task success, and upstream comparison as measured or unavailable.
- [x] Record workload, sample count, commit SHA, and limitations for each supported metric.

**Verification:**
- [x] Inspect claim ledger against source and benchmark output definitions.
- Expected: no mock byte count is labeled as tokens, cost, or provider cache usage.

**Exit Criteria:**
- Every intended CV claim has an evidence status and an attribution boundary.

### Task 2: Reproduce local benchmarks

**Disposition:** Completed. All four local benchmark commands passed on the approved commit.

**Purpose:** Refresh local evidence with current source and record reproducible outputs.

**Task Function:** Local performance and correctness measurement.

**Template Profile:**
- Controller-selected: `unresolved`
- Selection basis: deterministic local commands; moderate measurement interpretation.

**Required Skills:**
- `skill-performance-optimization`

**Files And Symbols:**
- Verify: `components/packages/foundation/artifact-store/scripts/bench-recovery.mjs`
- Verify: `components/packages/features/stabilizer/scripts/bench-cache-audit.mjs`
- Verify: `components/adapters/codex/scripts/benchmark-forwarding.ts`
- Verify: `components/adapters/codex/scripts/benchmark-context-cleaner.ts`

**Dependencies:**
- Task 1 complete.

**Authority:**
- Preauthorized local actions: run existing local benchmark commands and store raw output outside tracked documentation.
- Stop for: benchmark failure, changed harness behavior, or output that cannot be tied to the current commit.

**Steps:**
- [x] Run `pnpm --dir components/packages/foundation/artifact-store run bench:recovery`.
- [x] Run `pnpm --dir components/packages/features/stabilizer run bench:cache-audit`.
- [x] Run `pnpm --dir components/adapters/codex run bench:forwarding`.
- [x] Run mock Context Cleaner measurement with `$env:LIGHTRSI_BENCHMARK_MODE="mock"` and `pnpm --dir components/adapters/codex run bench:context-cleaner`.
- [x] Record environment, sample count, median, p95, correctness, and known limitations.

**Verification:**
- [x] Compare refreshed results with `docs/intent/2026-09-23-lightrsi-p1-closure-plan.md`.
- Expected: local results are reproducible or differences are explained and labeled.

**Exit Criteria:**
- Local benchmark evidence is refreshed without converting mock measurements into provider claims.

### Task 3: Run live Context Cleaner pilot

**Disposition:** Completed. A full live Stage B run used the centralized environment file, a clean `d6517fd` worktree, and a temporary manifest pinned to that commit. Usage, cache, correctness, and evidence-completeness gates passed; economics showed no savings.

**Purpose:** Test whether provider token, cache, cost, and recovery economics are measurable under the existing Stage B contract.

**Task Function:** Controlled provider-boundary measurement.

**Template Profile:**
- Controller-selected: `unresolved`
- Selection basis: external dependency, credentials, spending cap, and incomplete-evidence risk.

**Required Skills:**
- `skill-performance-optimization`

**Files And Symbols:**
- Inspect: `docs/superpowers/experiments/2026-09-24-context-cleaner-stage-b.json`
- Verify: `components/adapters/codex/scripts/benchmark-context-cleaner.ts`
- Verify: generated benchmark report and `statuses` fields

**Dependencies:**
- Task 2 complete.
- User-approved provider credentials and external calls.

**Authority:**
- Preauthorized local actions: inspect live-run configuration and prepare a one-repetition pilot without exposing credentials.
- Stop for: live provider calls, credential use, missing usage/cache evidence, spending-cap risk, or provider identity drift until approved and resolved.

**Steps:**
- [ ] Validate runtime SHA, benchmark SHA, provider, model, pricing, cache intent, and spending cap.
- [ ] Run one pilot repetition.
- [ ] Continue to configured repetitions only when usage, cache, correctness, recovery, and failure gates pass.
- [x] Preserve failed or incomplete reports and classify them as inconclusive.

**Verification:**
- [ ] Inspect `executionStatus`, `measurementStatus`, `correctnessStatus`, `economicStatus`, `pairedDifferences`, and `summaryByArm`.
- Expected: cost and token claims exist only for complete comparable pairs.

**Exit Criteria:**
- Live economics are either complete and reproducible or explicitly recorded as unavailable/deferred.

### Task 4: Measure representative task success

**Disposition:** Pilot completed. Broader sample remains deferred.

**Purpose:** Add evidence beyond deterministic Cleaner fixtures.

**Task Function:** Small end-to-end task evaluation with deterministic verifiers.

**Template Profile:**
- Controller-selected: `unresolved`
- Selection basis: representative workload design and provider-cost interpretation.

**Required Skills:**
- `skill-performance-optimization`

**Files And Symbols:**
- Inspect: existing Codex adapter session and report surfaces.
- Verify: fixed implementation, bug-fix, and recovery/restart task outcomes.
- Modify: `docs/benchmarks/impact-report.md` only.

**Dependencies:**
- Task 3 complete or live measurement explicitly deferred.

**Authority:**
- Preauthorized local actions: define fixed task prompts, verifier commands, and sanitized result fields.
- Stop for: live task execution, credential use, task-scope changes, or absence of deterministic success criteria until approved.

**Steps:**
- [x] Select three representative tasks with fixed repository state and verifier commands.
- [x] Compare baseline and treatment under identical model, prompt, budget, and runtime conditions.
- [x] Record input/output tokens, task success, verifier result, recovery result, and failure reason; provider cost and standardized duration remain unavailable.
- [ ] Compute cost per successful task only when task outcomes and provider usage are complete.

**Verification:**
- [ ] Confirm task success is reported separately from token reduction.
- Expected: no efficiency claim survives a material task-success regression.

**Exit Criteria:**
- Representative-task evidence is complete, or its absence is documented without unsupported CV claims.

### Task 5: Run original-versus-fork comparison

**Disposition:** Pilot completed. Matched provider protocol smoke and three deterministic coding tasks completed; `10–20` task study remains deferred.

**Purpose:** Establish direct incremental fork impact against the original LightRSI rather than treating the fork's internal baseline as an upstream baseline.

**Task Function:** Comparable baseline selection and attribution review.

**Template Profile:**
- Controller-selected: `unresolved`
- Selection basis: potentially high value but high comparability risk.

**Required Skills:**
- `skill-performance-optimization`
- `skill-using-git-worktrees`

**Files And Symbols:**
- Inspect: fork base revision and upstream revision metadata.
- Verify: existing benchmark fixtures, provider accounting, deterministic task verifiers, and report surfaces.
- Modify: `docs/benchmarks/impact-report.md` only.

**Dependencies:**
- Tasks 1–2 complete.
- Task 4 complete before claiming cost per successful task; Task 3 is supplementary and does not block the core comparison.

**Authority:**
- Preauthorized local actions: document candidate revisions and comparability criteria.
- User-approval actions: upstream checkout, network access, live provider calls, credential use, and external writes.
- Centralized provider environment: `C:\Users\HOANG PHI LONG DANG\.codex\tokenpilot.env`.
- Stop for: missing parity, provider identity drift, spending-cap risk, or architectural mismatch.

**Steps:**
- [x] Identify the original LightRSI revision used as fork base: `2fc0a6734a8380b15e99cd027877cdcd950caa63`.
- [x] Pin original and fork revisions in isolated worktrees.
- [x] Check identical provider, model, prompts, continuation turns, endpoint, and evidence gates.
- [x] Run five matched provider protocol-smoke repetitions per revision.
- [x] Record protocol-smoke input-token savings, rebase commit, restart preservation, and failure outcomes.
- [x] Run three reproducible coding tasks covering implementation, bug-fix, and recovery/restart behavior.
- [x] Record Codex-reported input/output tokens, cached input tokens, successful task completion, verifier result, recovery result, and failure reason; provider cost and standardized end-to-end latency remain unavailable.
- [ ] Expand to `10–20` reproducible coding tasks covering short sessions, long sessions, noisy tool output, recovery, and multi-turn development.
- [ ] Compute cost per successful task only when provider usage and deterministic task outcomes are complete.
- [x] Mark broad coding-task impact as deferred; do not treat protocol-smoke tokens or small-pilot session usage as provider cost evidence.

**Verification:**
- [x] Inspect comparison metadata and workload parity.
- [x] Verify original `5/5` protocol-smoke passes and fork `4/5` passes.
- [x] Verify deterministic task outcomes independently from token and cost measurements.
- Expected: upstream numbers are never presented as fork-specific results, and no material task-success regression is hidden by efficiency metrics.

**Exit Criteria:**
- Matched protocol smoke and three-task coding pilot are recorded; broad coding-task comparison remains deferred with no provider-cost or generalization claim.

### Task 6: Write sanitized impact report

**Disposition:** Updated. Report contains current local evidence, matched protocol-smoke comparison, reproduction commands, limitations, and conservative CV wording.

**Purpose:** Consolidate evidence into one durable artifact for CV use and future verification.

**Task Function:** Evidence synthesis and documentation.

**Template Profile:**
- Controller-selected: `unresolved`
- Selection basis: source-backed reporting with no production behavior change.

**Required Skills:**
- `skill-verification-before-completion`

**Files And Symbols:**
- Create: `docs/benchmarks/impact-report.md`
- Reference: `README.md`
- Reference: `docs/intent/2026-09-23-lightrsi-p1-closure-plan.md`
- Reference: `docs/superpowers/experiments/2026-09-24-context-cleaner-stage-b.json`

**Dependencies:**
- Tasks 1–5 complete or deferred with evidence.
- Original-versus-fork result appears before supplementary Cleaner and local benchmark evidence.

**Authority:**
- Preauthorized local actions: create and update the sanitized report with source-backed results and limitations.
- Stop for: secrets, raw prompts, private identifiers, unsupported claims, or unresolved report contradictions.

**Steps:**
- [x] Add scope, attribution rules, revisions, environment, workloads, and metric definitions.
- [x] Add local benchmark results with sample counts and p50/p95 values.
- [x] Add live results only when status gates pass.
- [x] Add reliability evidence and explicit unavailable metrics.
- [x] Add reproduction commands and approved CV wording.
- [x] Add original-versus-fork protocol-smoke results and three-task coding pilot; defer broad coding-task impact.

**Verification:**
- [x] Run `git diff --check`.
- [x] Inspect every numeric claim against its source output.
- Expected: report contains no secret material and every CV number is traceable.

**Exit Criteria:**
- One sanitized report supports current CV bullets and clearly labels deferred evidence.

## Verification

Run final checks after report creation:

```powershell
git diff --check
pnpm --dir components/packages/foundation/artifact-store run bench:recovery
pnpm --dir components/packages/features/stabilizer run bench:cache-audit
pnpm --dir components/adapters/codex run bench:forwarding
$env:LIGHTRSI_BENCHMARK_MODE="mock"
pnpm --dir components/adapters/codex run bench:context-cleaner
```

Final inspection must confirm:

- mock and live results remain separate;
- bytes are not labeled tokens;
- fixture correctness is not labeled full task success;
- indexed recovery claims include workload and sample count;
- original-versus-fork claims use only matched revisions and matched workloads;
- upstream claims are not attributed to the fork;
- incomplete evidence is labeled `inconclusive` or `deferred`.

## Completion Criteria

The plan is ready for completion verification when:

1. local evidence reproduces or deviations are recorded;
2. live measurement either produces complete results or records an explicit blocker;
3. representative task results exist or are explicitly deferred;
4. original-versus-fork comparison is valid or explicitly marked `not comparable` with blockers;
5. `docs/benchmarks/impact-report.md` contains commands, revisions, metrics, and limitations;
6. every CV number traces to one report row;
7. no unsupported token, cost, adoption, task-success, or upstream claim remains;
8. no production runtime code changed.
