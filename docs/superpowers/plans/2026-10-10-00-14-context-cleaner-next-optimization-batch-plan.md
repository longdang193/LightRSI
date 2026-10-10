---
artifact_type: plan
contract_version: "1"
template_id: implementation-plan
status: proposed
layer: change
name: context-cleaner-next-optimization-batch
targets:
  - components/adapters/codex/scripts/benchmark-context-cleaner.ts
  - docs/superpowers/experiments/2026-10-09-context-cleaner-delayed-recovery.json
  - components/adapters/codex/src/upstream.ts
  - components/adapters/codex/src/proxy-runtime.ts
  - components/adapters/codex/tests/compaction-route.test.ts
  - components/adapters/codex/tests/upstream.test.ts
  - .github/workflows/ci.yml
---

# Context Cleaner Next Optimization Batch

## Goal

Close delayed-recovery benchmark gap, remove repeated compact-route probes for
known provider capability, remove avoidable deep cloning from compact payload
projection, rerun local and 9Router evidence, and protect main with pull
request plus CI gates.

## Review Result

Verdict is correct: prior runtime changes are safe, but batch is incomplete.
Five delayed-recovery scenarios are dormant because Fixture.scenario only changes
marker strings. Compact fallback still pays repeated 404 request. Compact
projection still JSON-clones large payloads. main remains unprotected.

One execution tightening: live clean-SHA guard and a tracked manifest containing
that same commit SHA cannot be updated in one ordinary commit without making SHA
stale. Track canonical scenario/pricing manifest, then create per-run manifest
copy outside worktree with clean tested commit SHA. Record exact run manifest
beside live report. Never weaken clean-SHA guard.

## Implementation Outcomes

### Real delayed-recovery benchmark

benchmark-context-cleaner.ts executes all five manifest scenarios through one
central continuation dispatcher. Each scenario has correctness oracle. Fixture
IDs come from manifest data; FixtureScenario remains closed union.

### Lower compact fallback overhead

upstream.ts remembers compact support per existing upstream identity in process
memory with bounded TTL. Compact 404 skips future compact probes; compact 2xx
remains native. 400, 401, 403, timeout, and 5xx never change capability state.
JSON and streaming paths share behavior.

### Lower compact projection cost

proxy-runtime.ts uses shallow copy-on-write for compact native and fallback
payloads. Original payload objects, nested input items, and normal route behavior
remain unchanged.

### Reproducible evidence and safer integration

Mock proof, full 9Router proof, provider usage, cache evidence, correctness,
recovery cost, and economic status are recorded from exact clean tested commit.
main requires pull request and CI / lightrsi-ci, with zero required external
approvals and force-push blocked.

## Execution Approach

- Mode: inline sequential
- Coordination: none
- Required skills: skill-backend-verification, skill-performance-optimization, skill-test-driven-development, skill-code-standards, skill-verification-before-completion, skill-plan-document-reviewer
- Isolation: current workspace
- Commit policy: no commits during execution
- Preauthorized local actions: inspect source and tests, edit named files, run local mock tests and benchmarks, parse local reports, run configured read-only GitHub queries, and write task-owned local artifacts
- User-approval actions: 9Router/provider traffic, credential loading or changes, Git commits, push, GitHub ruleset writes, force-push, merge, destructive cleanup, and scope expansion
- Parallel ownership: none; benchmark and compact routing share verification order
- Sequential fallback: complete Tasks 1 through 4 locally, then stop before Task 5 provider traffic or Task 6 GitHub writes when authorization or clean-SHA state is absent

## Non-Goals

- No persistent compact capability registry, database, cache service, or new state schema.
- No archive search, recovery pinning, thin checkpoints, Context Folding, RL Cleaner, vector database, knowledge graph, background memory agent, provider KV-cache algorithm, broad evidence schema, or autonomous Cleaner decision work.
- No global replacement of cloneJsonObject(); non-compact rebase and replay callers keep current semantics.
- No direct push or merge from this plan.

## Baseline Evidence

- Current clean base: 7e6c20724ea692428b1392120c087c331c942490 on main.
- Prior 9Router artifact: C:\tmp\lightrsi-9router-stage-b-live-retry2.json.
- Prior result: baseline $0.5443128, Cleaner $0.5664016, delta +$0.0220888 (+4.06%); Cleaner input tokens down 7,856 and cached input tokens down 33,792. Cache loss dominates input reduction.
- Prior targeted provider artifact: C:\tmp\lightrsi-9router-targeted.json.
- Prior targeted raw capture: C:\tmp\lightrsi-9router-targeted.
- Delayed-recovery manifest is present on disk but ignored by .gitignore and not indexed by Git.

## Design Invariants

- Baseline and Cleaner execute identical logical scenario continuations; only retained history and recovery state differ.
- One scenario dispatcher owns delayed turns and scenario oracles. runArm() keeps shared lifecycle setup, dispatch, restart, and aggregation generic.
- Manifest IDs are data strings. Only FixtureScenario is closed in TypeScript.
- Compact capability state is process-local, keyed by capabilityKey(upstream, model), bounded by existing capability TTL, and never persisted.
- Only compact 404 means unsupported. Only compact 2xx means supported.
- Shallow projection never mutates input or nested input items.
- Ordinary /responses requests never strip historical web-search items.
- Live economics are inconclusive when provider usage, cache evidence, correctness, provider identity, clean-SHA state, or pair comparability is incomplete.

## Task Breakdown

### Task 1: Make delayed-recovery fixtures executable

**Purpose:**
- Turn five delayed-recovery fixture definitions into real scenario behavior with correctness oracles.

**Task Function:**
- Implement one centralized continuation and oracle path while preserving generic arm lifecycle.

**Template Profile:**
- Controller-selected: unresolved while task is pending
- Selection basis: benchmark semantics and correctness require repository-aware reasoning; lead resolves profile before activation.

**Validator Profile:**
- Controller-selected: none
- Selection basis: benchmark assertions and focused command provide proof.

**Specification Coverage:**
- Implement requirement_change, delayed_question, unexpected_dependency, recovery_cycle, and stale_reference.
- Add scenario-specific correctness oracles.
- Make fixture IDs manifest-defined strings while retaining finite FixtureScenario union.
- Track canonical delayed-recovery manifest despite ignored docs/superpowers path.

**Required Skills:**
- skill-test-driven-development
- skill-code-standards
- skill-backend-verification

**Files And Symbols:**
- Inspect: components/adapters/codex/scripts/benchmark-context-cleaner.ts:FixtureName, FixtureScenario, StageBFixtureSpec, StageBManifest, Fixture, createFixture, runArm, loadStageBManifest
- Modify: components/adapters/codex/scripts/benchmark-context-cleaner.ts:FixtureName, StageBFixtureSpec, Fixture, createFixture, runArm, new scenario continuation/oracle helper
- Modify: docs/superpowers/experiments/2026-10-09-context-cleaner-delayed-recovery.json:fixtures
- Verify: both paths above

**Dependencies:**
- Existing lifecycle and release assertions remain source of truth.
- Manifest IDs must be validated for uniqueness and known scenarios before runs.

**Authority:**
- Preauthorized local actions: edit benchmark script and manifest, add ignored manifest with git add -f during execution, and run mock benchmark checks.
- Stop for: provider traffic, credential changes, Git commit or push, changed semantics outside five named scenarios, or destructive cleanup.

**Steps:**
- [ ] Change fixture ID storage and selection to manifest strings; validate non-empty unique IDs, release/cache/recovery fields, and finite scenarios at manifest load.
- [ ] Add one centralized scenario continuation helper and call it from runArm() at common post-release continuation boundary.
- [ ] Encode superseding requirement, delayed evidence question, delayed dependency on released evidence, recover-continue-no-loop, and explicit stale/missing reference failure.
- [ ] Evaluate scenario-specific oracle predicates against forwarded markers, recovery results, and post-restart state; fail when scenario silently follows ordinary release behavior.
- [ ] Validate JSON manifest, force-track canonical path, and keep provider pricing and five fixture definitions in one source.

**Verification:**
- [ ] pnpm --dir components/adapters/codex run typecheck
- Expected: TypeScript passes with no new diagnostics.
- [ ] node --import tsx -e "const m=JSON.parse(require('node:fs').readFileSync('docs/superpowers/experiments/2026-10-09-context-cleaner-delayed-recovery.json','utf8')); if(m.fixtures.length!==5) throw new Error('fixture count'); if(new Set(m.fixtures.map(x=>x.id)).size!==5) throw new Error('fixture IDs'); console.log('manifest ok')"
- Expected: prints manifest ok.
- [ ] $env:LIGHTRSI_BENCHMARK_MODE='mock'; $env:LIGHTRSI_BENCHMARK_MANIFEST='docs/superpowers/experiments/2026-10-09-context-cleaner-delayed-recovery.json'; $env:LIGHTRSI_BENCHMARK_REPETITIONS='1'; $env:LIGHTRSI_BENCHMARK_OUTPUT='C:\tmp\lightrsi-delayed-recovery-mock.json'; pnpm --dir components/adapters/codex run bench:context-cleaner
- Expected: all five scenarios reach their own oracle and stale reference is not silently accepted.

**Exit Criteria:**
- Five delayed scenarios execute through one dispatcher, each has failing oracle when absent, fixture IDs need no TypeScript union edit, and canonical manifest is tracked.

### Task 2: Prove benchmark semantics locally and prepare live evidence

**Purpose:**
- Establish fresh mock correctness before runtime optimization and define clean-SHA-bound 9Router gate.

**Task Function:**
- Run reproducible mock proof, inspect completeness, and prepare per-run manifest copy without weakening preflight.

**Template Profile:**
- Controller-selected: unresolved while task is pending
- Selection basis: evidence interpretation spans correctness, provider usage, and economics.

**Validator Profile:**
- Controller-selected: none
- Selection basis: report assertions remain lead-owned.

**Specification Coverage:**
- Mock correctness proves scenario semantics.
- Live evidence requires complete provider usage, cache evidence, correctness, recovery cost, pricing, and economic break-even.
- Clean-SHA mismatch remains explicit stop.

**Required Skills:**
- skill-backend-verification
- skill-performance-optimization
- skill-verification-before-completion

**Files And Symbols:**
- Inspect: components/adapters/codex/scripts/benchmark-context-cleaner.ts:report assembly, readGitPreflight, evaluateGitPreflight, provider usage and economic status
- Inspect: docs/superpowers/experiments/2026-10-09-context-cleaner-delayed-recovery.json:measurement, provider, pricing, acceptance
- Verify: C:\tmp\lightrsi-delayed-recovery-mock.json, C:\tmp\lightrsi-delayed-recovery-live.json, C:\tmp\lightrsi-delayed-recovery-live-manifest.json

**Dependencies:**
- Task 1 complete with mock scenario oracles passing.
- Runtime and benchmark code must be committed and clean before live economics.

**Authority:**
- Preauthorized local actions: run mock mode, inspect JSON reports, create temporary manifest copy outside worktree, and record evidence paths.
- Stop for: any provider request, credential loading, spending above manifest cap, dirty worktree, SHA mismatch, provider model mismatch, or incomplete usage/correctness evidence.

**Steps:**
- [ ] Run one-repetition mock proof with tracked manifest and output C:\tmp\lightrsi-delayed-recovery-mock.json.
- [ ] Assert executionStatus=complete, correctnessStatus=pass, five fixture IDs, five scenario oracle passes, and recovery result.
- [ ] After accepted code exists in a clean tested commit, copy tracked manifest to C:\tmp\lightrsi-delayed-recovery-live-manifest.json, set both SHA fields to exact HEAD, and preserve provider/model/pricing.
- [ ] With separate provider authorization, run five repetitions through 9Router and write C:\tmp\lightrsi-delayed-recovery-live.json.
- [ ] Classify pass, fail, or inconclusive from report fields; never equate input-token reduction with lower provider cost.

**Verification:**
- [ ] $env:LIGHTRSI_BENCHMARK_MODE='mock'; $env:LIGHTRSI_BENCHMARK_MANIFEST='docs/superpowers/experiments/2026-10-09-context-cleaner-delayed-recovery.json'; $env:LIGHTRSI_BENCHMARK_REPETITIONS='1'; $env:LIGHTRSI_BENCHMARK_OUTPUT='C:\tmp\lightrsi-delayed-recovery-mock.json'; pnpm --dir components/adapters/codex run bench:context-cleaner
- Expected: zero exit; complete execution and passing scenario correctness.
- [ ] Live command after explicit provider authorization: $env:LIGHTRSI_BENCHMARK_MODE='live'; $env:LIGHTRSI_BENCHMARK_MANIFEST='C:\tmp\lightrsi-delayed-recovery-live-manifest.json'; $env:LIGHTRSI_BENCHMARK_REPETITIONS='5'; $env:LIGHTRSI_BENCHMARK_OUTPUT='C:\tmp\lightrsi-delayed-recovery-live.json'; pnpm --dir components/adapters/codex run bench:context-cleaner
- Expected: only clean matching SHA with complete usage and comparable pairs produces economic pass or fail; all other outcomes inconclusive.

**Exit Criteria:**
- Mock semantics proven locally. Live evidence complete and classified, or blocked with exact guard/provider/evidence reason.

### Task 3: Cache compact endpoint capability in process memory

**Purpose:**
- Remove repeated /responses/compact 404 probes for unsupported providers without persistent state.

**Task Function:**
- Extend existing upstream capability handling with bounded process-local compact status shared by JSON and streaming requests.

**Template Profile:**
- Controller-selected: unresolved while task is pending
- Selection basis: transport fallback has retry, timeout, and provider error edges.

**Validator Profile:**
- Controller-selected: none
- Selection basis: focused upstream and route tests cover both modes.

**Specification Coverage:**
- Key by capabilityKey(upstream, model).
- Cache compact 404 as unsupported and compact 2xx as supported only.
- Do not cache 400, 401, 403, timeout, or 5xx.
- Known unsupported goes directly fallback; supported stays native; restart reprobes.

**Required Skills:**
- skill-backend-verification
- skill-test-driven-development
- skill-code-standards

**Files And Symbols:**
- Inspect: components/adapters/codex/src/upstream.ts:CAPABILITY_TTL_MS, capabilityKey, capabilityCache, requestUpstreamResponses, requestUpstreamResponsesStream
- Modify: components/adapters/codex/src/upstream.ts:compact capability map and both request functions
- Modify: components/adapters/codex/tests/upstream.test.ts:compact fallback and retry cases
- Modify: components/adapters/codex/tests/compaction-route.test.ts:repeated compact requests

**Dependencies:**
- Existing optional-field capability persistence remains separate and unchanged.

**Authority:**
- Preauthorized local actions: edit compact routing and focused tests, run adapter tests, and use loopback HTTP fixtures.
- Stop for: persistent state/schema changes, changed status classification, provider traffic, credential changes, or unrelated upstream refactors.

**Steps:**
- [ ] Add compact status map beside existing process-local maps, keyed by capabilityKey and bounded by CAPABILITY_TTL_MS and existing entry limit.
- [ ] Route known unsupported directly to /responses with existing fallback transformation; keep unknown status probing compact.
- [ ] Record unsupported after compact 404 and supported after compact 2xx; leave unknown after every other failure or timeout.
- [ ] Apply same state transitions to JSON and stream functions; preserve transport-fetch counts and retries.
- [ ] Add loopback tests for first 404 plus second direct fallback, first 2xx plus second native compact, and non-cacheable 400/401/403/5xx.

**Verification:**
- [ ] pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/upstream.test.ts tests/compaction-route.test.ts
- Expected: focused suite passes; unsupported makes one compact probe total, supported remains native, non-cacheable errors reprobe.
- [ ] pnpm --dir components/adapters/codex run typecheck
- Expected: no TypeScript diagnostics.

**Exit Criteria:**
- JSON and streaming paths share process-local capability state, forbidden statuses are not cached, and tests prove request count, fallback payload, reprobe, and transport status.

### Task 4: Replace compact deep cloning with shallow projection

**Purpose:**
- Reduce CPU, allocations, and GC pressure for large compact payloads without mutation.

**Task Function:**
- Replace only compact projection clones with copy-on-write top-level objects and new filtered input array.

**Template Profile:**
- Controller-selected: unresolved while task is pending
- Selection basis: performance-sensitive transformation with strict immutability contract.

**Validator Profile:**
- Controller-selected: none
- Selection basis: focused projection and route assertions are sufficient.

**Specification Coverage:**
- Native non-stream projection uses shallow copy and removes stream from copy.
- Fallback uses shallow copy and new filtered input array.
- Original payload, input array, and nested input items remain unchanged.
- Non-compact cloneJsonObject callers remain unchanged.

**Required Skills:**
- skill-performance-optimization
- skill-test-driven-development
- skill-code-standards

**Files And Symbols:**
- Inspect: components/adapters/codex/src/proxy-runtime.ts:cloneJsonObject, stripHistoricalWebSearchCalls, projectUpstreamPayload, compactFallbackPayload
- Modify: components/adapters/codex/src/proxy-runtime.ts:compact projection helpers
- Modify: components/adapters/codex/tests/compaction-route.test.ts:projection immutability and forwarded shape
- Verify: proxy-runtime.ts non-compact cloneJsonObject callers

**Dependencies:**
- Task 3 compact behavior and route coverage remain green.
- Do not change deep-clone semantics outside compact projection.

**Authority:**
- Preauthorized local actions: edit compact projection and tests, run loopback tests, and compare same-fixture local timings.
- Stop for: global clone replacement, public API expansion beyond narrow projection test seam, changed normal-route filtering, or provider traffic.

**Steps:**
- [ ] Add the smallest narrow projection seam needed to test copy-on-write, or keep closures private if route tests observe the contract directly.
- [ ] Replace native compact JSON clone with top-level spread plus deletion on copy.
- [ ] Replace fallback JSON clone with top-level spread plus stripHistoricalWebSearchCalls(payload.input); retain nested item references.
- [ ] Assert output identity, new fallback input array, unchanged original input, and unchanged retained nested items.
- [ ] Keep cloneJsonObject for rebase and replay callers; compare local serialization/projection timing on same payload fixture.

**Verification:**
- [ ] pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/compaction-route.test.ts tests/upstream.test.ts
- Expected: native, fallback, continuation, stream, and retry tests pass; immutability assertions pass.
- [ ] pnpm --dir components/adapters/codex run typecheck
- Expected: no TypeScript diagnostics.
- [ ] git diff --check
- Expected: no whitespace errors.

**Exit Criteria:**
- Compact paths no longer JSON-clone large payloads, immutability is proven, and unrelated deep-clone callers retain behavior.

### Task 5: Rerun full optimization evidence through 9Router

**Purpose:**
- Measure combined batch against prior 9Router evidence with complete provider usage and economic classification.

**Task Function:**
- Execute approved live benchmark, preserve raw capture, and compare token, cache, latency, recovery, and cost outcomes.

**Template Profile:**
- Controller-selected: unresolved while task is pending
- Selection basis: external provider economics and clean-SHA evidence require explicit review.

**Validator Profile:**
- Controller-selected: none
- Selection basis: lead accepts complete report and matching raw capture only.

**Specification Coverage:**
- Use 9Router data for live provider validation and real provider economics.
- Preserve provider identity, pinned pricing, causal-pair controls, and spending cap.
- Report pass, fail, or inconclusive without filling missing usage/cache fields.

**Required Skills:**
- skill-backend-verification
- skill-performance-optimization
- skill-verification-before-completion

**Files And Symbols:**
- Inspect: components/adapters/codex/scripts/benchmark-context-cleaner.ts:report assembly and economic status
- Inspect: docs/superpowers/experiments/2026-10-09-context-cleaner-delayed-recovery.json:provider and acceptance
- Verify: C:\tmp\lightrsi-delayed-recovery-live.json and its runs[].requests[] provider records, C:\tmp\lightrsi-9router-next-optimization-summary.json

**Dependencies:**
- Tasks 1 through 4 complete and focused local checks pass.
- Clean tested commit SHA, provider credentials, and spending authorization are available without repository mutation.

**Authority:**
- Preauthorized local actions: inspect completed local reports and compare them with prior artifacts.
- Stop for: provider request without explicit approval, missing credentials, dirty worktree, SHA mismatch, model mismatch, cap stop, incomplete raw usage, or failed scenario correctness.

**Steps:**
- [ ] Confirm adapter tests, typecheck, mock benchmark, and clean status before provider traffic.
- [ ] Materialize temporary manifest with exact clean HEAD, 9Router model cx/gpt-5.6-luna, existing pricing, five repetitions, causal pairs, and $10.00 cap.
- [ ] Run live benchmark through configured 9Router endpoint and preserve JSON report request bodies, provider usage, response headers, and output item types in runs[].requests[].
- [ ] Verify every raw response has usage, every parsed request has usage, cache evidence exists, all scenario oracles pass, and paired checkpoints form bijection.
- [ ] Compare tokens, cache, latency, recovery overhead, and estimated cost against C:\tmp\lightrsi-9router-stage-b-live-retry2.json; classify incomplete evidence inconclusive.

**Verification:**
- [ ] $env:LIGHTRSI_BENCHMARK_MODE='live'; $env:LIGHTRSI_BENCHMARK_MANIFEST='C:\tmp\lightrsi-delayed-recovery-live-manifest.json'; $env:LIGHTRSI_BENCHMARK_REPETITIONS='5'; $env:LIGHTRSI_BENCHMARK_OUTPUT='C:\tmp\lightrsi-delayed-recovery-live.json'; pnpm --dir components/adapters/codex run bench:context-cleaner
- Expected: success only when clean-SHA and provider guards pass; report includes complete usage, cache, correctness, recovery, pricing, and economic status.
- [ ] node --import tsx -e "const r=JSON.parse(require('node:fs').readFileSync('C:\\tmp\\lightrsi-delayed-recovery-live.json','utf8')); if(r.executionStatus!=='complete'||r.correctnessStatus!=='pass') throw new Error('live evidence incomplete'); console.log(r.economicStatus)"
- Expected: prints pass, fail, or inconclusive from report.

**Exit Criteria:**
- Live 9Router evidence is preserved and classified, or task records exact blocking condition without claiming economic success.

### Task 6: Protect main with minimal GitHub ruleset

**Purpose:**
- Prevent direct or force pushes to main while keeping solo-maintainer friction low.

**Task Function:**
- Inspect current rules, then publish one minimal ruleset only after explicit external-write authorization.

**Template Profile:**
- Controller-selected: unresolved while task is pending
- Selection basis: external repository policy write requires authorization and exact target verification.

**Validator Profile:**
- Controller-selected: none
- Selection basis: GitHub read-back is acceptance proof.

**Specification Coverage:**
- Require pull request for main.
- Require CI / lightrsi-ci success.
- Require zero external approvals.
- Block force pushes.
- Preserve owner-selected maintainer emergency bypass only if explicitly chosen during write.

**Required Skills:**
- skill-backend-verification
- skill-verification-before-completion

**Files And Symbols:**
- Inspect: .github/workflows/ci.yml:CI, lightrsi-ci
- Inspect: https://api.github.com/repos/longdang193/LightRSI/rulesets
- Verify: same GitHub rulesets endpoint after write

**Dependencies:**
- No local code change required.
- CI / lightrsi-ci is authoritative status context from .github/workflows/ci.yml.

**Authority:**
- Preauthorized local actions: read-only GitHub ruleset/status inspection and local policy documentation.
- Stop for: ruleset write without explicit approval, missing authentication, unknown existing rules, or bypass request.

**Steps:**
- [ ] Read existing rulesets and branch protection for longdang193/LightRSI and confirm main target.
- [ ] After explicit authorization, create or update one main ruleset with pull request, CI / lightrsi-ci, zero approvals, force-push block, and owner-selected bypass policy.
- [ ] Read ruleset back and verify target, enforcement, status context, approval count, force-push restriction, and bypass actors.

**Verification:**
- [ ] Read-back of https://api.github.com/repos/longdang193/LightRSI/rulesets after external write.
- Expected: one effective main policy has requested pull request, CI, approval, force-push, and bypass settings.

**Exit Criteria:**
- main protection is read-back verified, or task remains blocked with exact authorization or permission reason.

### Task 7: Fresh local verification and plan reconciliation

**Purpose:**
- Prove combined local implementation and reconcile evidence without overstating blocked provider or external results.

**Task Function:**
- Run final focused checks, inspect diff, and record outcomes and deferrals in this plan.

**Template Profile:**
- Controller-selected: unresolved while task is pending
- Selection basis: final proof spans benchmark, transport, performance, and external-gate status.

**Validator Profile:**
- Controller-selected: none
- Selection basis: lead controller owns final reconciliation.

**Specification Coverage:**
- Every implementation outcome has fresh proof or explicit blocker.
- No unrelated files or speculative architecture enter batch.

**Required Skills:**
- skill-verification-before-completion
- skill-plan-document-reviewer

**Files And Symbols:**
- Verify: components/adapters/codex/tests/compaction-route.test.ts
- Verify: components/adapters/codex/tests/upstream.test.ts
- Verify: components/adapters/codex/scripts/benchmark-context-cleaner.ts
- Verify: docs/superpowers/experiments/2026-10-09-context-cleaner-delayed-recovery.json
- Verify: git diff --check and repository status

**Dependencies:**
- Tasks 1 through 4 complete.
- Tasks 5 and 6 report accepted evidence or explicit blocked status.

**Authority:**
- Preauthorized local actions: run local tests, typechecks, benchmark report inspection, diff checks, and plan status reconciliation.
- Stop for: failed required proof, unrecorded scope changes, stale task claims, provider retry, external writes, commit, push, or merge.

**Steps:**
- [ ] Run focused adapter tests and adapter typecheck.
- [ ] Run mock delayed-recovery benchmark and inspect five scenario oracles.
- [ ] Run repository contract and whitespace checks.
- [ ] Review plan once for exact path, symbol, dependency, authority, and verification consistency; fix plan defects inline.
- [ ] Record live-provider and GitHub outcomes as verified, blocked, or inconclusive; do not change proposed status to completed.

**Verification:**
- [ ] pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/upstream.test.ts tests/compaction-route.test.ts
- Expected: focused adapter suites pass.
- [ ] pnpm --dir components/adapters/codex run typecheck
- Expected: adapter typecheck passes.
- [ ] $env:LIGHTRSI_BENCHMARK_MODE='mock'; $env:LIGHTRSI_BENCHMARK_MANIFEST='docs/superpowers/experiments/2026-10-09-context-cleaner-delayed-recovery.json'; $env:LIGHTRSI_BENCHMARK_REPETITIONS='1'; $env:LIGHTRSI_BENCHMARK_OUTPUT='C:\tmp\lightrsi-delayed-recovery-mock.json'; pnpm --dir components/adapters/codex run bench:context-cleaner
- Expected: mock report remains complete and all scenario oracles pass.
- [ ] git diff --check
- Expected: no whitespace errors.
- [ ] python "$HOME/.agents/project-os/scripts/validate_repo_contracts.py" --repo-root . --fast
- Expected: repository contract validation passes or reports only pre-existing unrelated findings.

**Exit Criteria:**
- Local proof is fresh, provider and external limitations are recorded, plan paths and commands match repository truth, and no completion claim exceeds evidence.

## Verification

- pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/upstream.test.ts tests/compaction-route.test.ts
- pnpm --dir components/adapters/codex run typecheck
- Mock delayed-recovery benchmark with tracked manifest and five scenario oracles.
- Full five-repetition 9Router benchmark with temporary clean-SHA manifest when explicitly authorized.
- git diff --check
- python "$HOME/.agents/project-os/scripts/validate_repo_contracts.py" --repo-root . --fast
- GitHub ruleset read-back for longdang193/LightRSI when external write is authorized.

## Completion Criteria

The plan is ready for completion verification when:

1. Five delayed scenarios execute through one dispatcher and each has scenario-specific correctness oracle.
2. Fixture IDs are manifest-defined strings and canonical manifest is tracked without duplicated scenario or pricing truth.
3. Compact capability status is process-local, bounded, shared by JSON and streaming paths, and caches only 404 unsupported or 2xx supported.
4. Compact projection avoids deep JSON cloning while preserving input immutability and ordinary-route behavior.
5. Focused adapter tests, typecheck, mock benchmark, diff check, and repository contract validation pass.
6. 9Router evidence is complete and economically classified, or remains inconclusive with exact guard/provider failure recorded.
7. main protection is read-back verified, or remains blocked with exact external authorization or permission reason.
8. Deferred architecture items remain untouched.
9. skill-verification-before-completion returns verified before plan status changes from proposed to completed.
