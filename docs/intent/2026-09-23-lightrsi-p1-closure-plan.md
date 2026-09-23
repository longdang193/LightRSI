---
layer: change
artifact_type: plan
status: completed
template_id: implementation-plan
contract_version: "1"
name: LightRSI Five P1 Closure
targets:
  - components/packages/foundation/artifact-store/src/archive-recovery/index.ts
  - components/packages/features/reduction/src/reduction/tool-payload-router.ts
  - components/packages/features/cleaner/src/contracts.ts
  - components/adapters/codex/src/context-cleaner/bridge.ts
  - components/products/cli/src/clean.ts
  - components/products/cli/src/clean-renderer.ts
---

# LightRSI Five P1 Closure

## Verdict Review

The recommendation is directionally sound: close correctness and agent-facing integration gaps before further optimization. Source review confirms three specific gaps:

1. `canonicalDuplicateValue()` recursively removes every `id` key, including application payload fields. Inspection also computes duplicate evidence eagerly and linearly searches for each item size.
2. The shared exact-reference resolver searches `tool-result-archives`, while existing writers support additional archive locations. Cleaner CLI projection/rendering drops duplicate and pressure evidence, and CLI has no preview command despite a service-level preview API.
3. TAP selection uses a fixed continuation-line count instead of preserving complete diagnostic blocks; execution metadata is not rendered consistently.

The preview concern needs narrower wording: current code JSON-serializes both baseline and candidate payloads, so the pasted recommendation does not prove those representations differ. Prove parity with normal Codex request encoding before changing it. Concrete defect: `netSavedChars` is computed from UTF-8 byte lengths. Report characters and bytes separately.

Pressure has a source gap. Codex response collection captures provider `usage`, but inspected runtime does not expose an authoritative context-window limit or reserved-output budget to Cleaner inspection. Keep pressure `unknown` until these values come from an existing authoritative host/config source; do not invent a model-limit registry or infer pressure from characters or cache-read tokens.

The completed plan `docs/superpowers/plans/2026-09-22-lightrsi-rtk-ccr-context-cleaner-plan.md` remains historical evidence. This follow-up closes gaps still visible at `4f1be2b`; it does not reopen historical read classification or repeat completed work.

## Goal

Complete the five P1 objectives—RTK diagnostic fidelity, CCR exact and focused recovery, duplicate-occurrence discovery, cache-aware release preview, and context-pressure attention—through existing Reduction, artifact-store, Context Cleaner, Codex adapter, and CLI owners. Preserve explicit release authority, exact recovery, and unknown-state behavior.

## Implementation Outcomes

- Every `artifactRef` from a supported writer root recovers exact archived bytes through normal recovery tools.
- RTK selectors preserve actionable diagnostic blocks and execution outcome.
- Agents can request bounded duplicate evidence, preview exact occurrence release, and inspect revision-bound pressure evidence through existing CLI.
- Preview remains read-only; provider-cache outcomes come only from actual receipts.
- Pressure remains unknown unless current usage, context limit, reserved output, and revision are authoritative.

## Approved Additive Scope — End-to-End Performance

Approved by the user on 2026-09-23. Keep measurement inside existing runtime and benchmark owners; do not redesign architecture or add runtime overhead without a measured benefit.

- Compare raw forwarding, pre-change implementation at `4f1be2b37b2166f2fffd973b9c4b8b849190729b`, post-change implementation, and relevant features in isolation using pinned fixtures and representative Codex/9Router traffic where existing safe access is available.
- Primary metric: total tokens, cost, and latency per successfully completed task, including recovery overhead. Label cost estimates separately when provider pricing is unavailable.
- Capture actual provider cache-hit evidence and cached-token counts, TTFT, p50/p95 end-to-end request latency, local processing time, CPU, memory, and disk I/O. Do not infer provider cache hits from equal payload hashes.
- Cover diagnostic fidelity and exact recovery; cold/warm recovery; early/late archive lookup; cache impact of early/late history releases; cumulative Cleaner releases and multi-turn continuation.
- Reuse existing harnesses first. Report unsupported metrics as unavailable with exact reason; add measurement instrumentation only after identifying a gap, and keep it outside runtime hot paths where possible. Preserve raw prompts, tool arguments, and credentials from reports.
## Approved Measurement Protocol

- Revision arms: raw controls supplied by each existing harness; pre-change implementation at `4f1be2b37b2166f2fffd973b9c4b8b849190729b`; post-change candidate on this branch. Use existing feature-isolation arms only: Reduction `raw`/`generic`/`command-aware`, Cleaner `baseline`/`cleaner`, and CCR indexed early/late plus missing/stale-index paths. Do not claim unrepresented feature arms.
- Pinned workloads: `tap-failure-flood-v1`, `tsc-diagnostic-flood-v1`, Cleaner `short/noisy` and `long/noisy`, and artifact-store archive fixtures. Preserve identical inputs across revisions.
- Recovery/cache cases: early/late archive positions; first lookup after index absence or cold state versus repeat lookup; early and late history releases; cumulative Cleaner releases, restart, and continuation. Capture cache keys/prefix hashes for comparison, but count cache hits only from provider usage receipts.
- Sampling: preserve each existing harness default and report actual sample counts. Context Cleaner uses 5 repetitions per fixture with `LIGHTRSI_BENCHMARK_ARM_ORDER=alternating`; do not invent a performance pass threshold. Separate mock measurements from live-provider observations.
- Primary calculation: for each successful task, sum actual input/output tokens and recovery overhead; divide totals/cost/latency by successful tasks and report success count separately. Use pinned provider pricing only for dollar cost; otherwise report cost as unavailable or a clearly labeled estimate.
- Latency/resources: report TTFT and end-to-end p50/p95 only where timestamp evidence exists. Existing Node heap/timing metrics remain distinct from OS process CPU time, peak memory, and I/O bytes; sample OS counters outside runtime hot paths. If a metric cannot be measured reliably, record it as unavailable with the reason instead of substituting bytes, hashes, or cache-read tokens.
- Keep benchmark output free of raw prompts, tool arguments, and credentials. Add measurement instrumentation only after the baseline proves a specific gap; do not add runtime-path overhead.

## Approved Deferrals — 2026-09-23

- The user approved keeping authoritative Codex context-capacity discovery and live Codex/9Router provider measurement for later. Do not invent capacity inputs or claim live-provider metrics from mock runs.
- Tasks 1–4 and locally verifiable performance work may be preserved and reviewed as partial scope after fresh verification. This does not complete all five P1 objectives; context-pressure attention and live-provider performance evidence remain deferred.
## Execution Approach

- Mode: inline sequential
- Coordination: git-tracked
- Required skills: `skill-systematic-debugging`, `skill-test-driven-development`, `skill-backend-verification`, `skill-performance-optimization`, `skill-verification-before-completion`.
- Isolation: branch `codex/lightrsi-p1-closure`, worktree `C:\Users\HOANG PHI LONG DANG\.codex\worktrees\lightrsi-p1-closure-v2\LightMem2`, based at the recorded base commit.
- Commit policy: no commits during execution; no push, merge, PR, branch deletion, or worktree removal.
- Preauthorized local actions: create the named branch/worktree; edit named source/test/doc owners; run declared local tests, benchmarks, and approved provider measurements; preserve unrelated worktree changes.
- User-approval actions: push, merge, PR creation, branch/worktree cleanup, destructive recovery, and writes outside the named worktree.
- Parallel ownership: none; archive resolver and Reduction router are shared correctness owners; Cleaner CLI/evidence work follows sequentially.
- Sequential fallback: Tasks 0–4, then Task 6; Task 5 remains deferred until authoritative capacity inputs exist.

## Coordination State

- Coordination owner: lead controller
- Coordination schema: 2
- Branch: `codex/lightrsi-p1-closure`
- Base commit: `4f1be2b37b2166f2fffd973b9c4b8b849190729b`
- Expected workspace: `C:\Users\HOANG PHI LONG DANG\.codex\worktrees\lightrsi-p1-closure-v2\LightMem2` at candidate `7ffffbc583bbeaa84c46807fa445ab6547b85148`; primary checkout and staged plan preserved
- Next action: no further local closure work; resume Task 5 and live-provider measurement only through separate approved integration when authoritative capacity inputs and provider access exist.
- Deferred by user on 2026-09-23: the current Codex runtime/config exposes no authoritative context-window limit or reserved-output budget for pressure. No provider-related environment variables or Codex benchmark `.env` were configured, so live provider measurement was not run; mock-only runs cannot prove provider tokens, cost, cache receipts, or live Codex/9Router task completion.

| Task | State | Workspace | Executor | Dependencies | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Task 0 | completed | `codex/lightrsi-p1-closure` | codex | none | pinned P1 regressions and performance evidence | Baseline at `4f1be2b37b2166f2fffd973b9c4b8b849190729b` recorded; candidate checks and serial benchmark matrix passed. Measurement gaps documented below. |
| Task 1 | completed | `codex/lightrsi-p1-closure` | codex | Task 0 | exact recovery across supported roots and consumers | Archive-store 9/9, MCP 15/15, OpenClaw 124/124; 50-sample recovery matrix verified exact content in early/late, missing/stale-index, and missing-artifact cases. |
| Task 2 | completed | `codex/lightrsi-p1-closure` | codex | Task 0 | RTK diagnostic-block and execution-state regressions | Reduction tests, pinned TAP/TypeScript fixtures, and isolated raw/generic/command-aware benchmark passed. |
| Task 3 | completed | `codex/lightrsi-p1-closure` | codex | Task 0 | duplicate equivalence and CLI inspection regressions | Codex bridge and CLI tests passed; nested payload IDs preserved; opt-in inspection caps and omission counts tested. |
| Task 4 | completed | `codex/lightrsi-p1-closure` | codex | Task 0 | comparable preview, side-effect proof, CLI coverage | Cleaner, Codex bridge, and CLI tests passed; codec-equivalent preview and no-write behavior verified. |
| Task 5 | deferred with user approval | `codex/lightrsi-p1-closure` | codex | Task 0 | revision-bound usage and authoritative capacity evidence | Usage collection exists, but authoritative capacity inputs remain unavailable. Pressure remains `unknown`; no registry or estimate invented. Resume when approved source contract is available. |
| Task 6 | completed | `codex/lightrsi-p1-closure` | codex | Tasks 1–4; Task 5 disposition | focused tests, typechecks, benchmarks, workspace validation | Fresh workspace tests, typechecks, build, listed local benchmarks, and diff check passed. Four active objectives are closed; Task 5 pressure and live-provider evidence remain explicitly deferred and do not block this approved closure scope. |

## Measurement Report — 2026-09-23

Candidate measurements ran serially on the approved worktree using Node `v24.15.0`, Windows, pinned repository fixtures, and default benchmark samples. The base revision was measured earlier on the same fixture/harness; cross-run timing is directional, not a statistically controlled live-provider A/B. Raw prompts and tool payloads were not included here.

| Area | Base | Candidate | Result |
| --- | --- | --- | --- |
| Recovery, indexed early/late, 1,000 entries | median ~1.36 ms | 1.05 / 0.92 ms; p95 1.83 / 1.11 ms; 50 samples each | Exact content; no late-position penalty. |
| Recovery, missing-index rebuild, 1,000 entries | median ~307.7 ms | 290.65 / 318.24 ms median/p95 | Exact content; first-read 283.47 ms. |
| Recovery, missing artifact, 1,000 entries | median ~573.9 ms | 549.78 / 687.13 ms median/p95 | Correct miss; cold archive scan remains expensive. |
| Reduction, repeated read-state, 8,000 events | 33.2 / 54.1 ms median/p95 | 32.68 / 49.60 ms | About 1.6% lower median and 8.3% lower p95. |
| Reduction, 5 MB JSON route | 3.21 ms median | 3.04 ms median | About 5.3% lower median. |
| RTK command-aware TAP fixture | raw 11,957 B | 863 B, 0.256 ms median, 8 evidence lines | 92.8% fewer output bytes; actionable diagnostic tests pass. |
| RTK command-aware TypeScript fixture | raw 10,229 B | 723 B, 0.198 ms median, 8 evidence lines | 92.9% fewer output bytes; diagnostic tests pass. |
| Forwarding, long-history, concurrency 1 | 8.39 / 10.67 ms p50/p95 | 7.00 / 11.93 ms | p50 improves; p95 rises 11.8%. |
| Forwarding, long-history, concurrency 4 | 12.00 / 13.46 ms p50/p95 | 11.63 / 14.21 ms | p50 improves slightly; p95 rises 5.6%. |
| Forwarding, long-history, concurrency 16 | 38.22 / 43.40 ms p50/p95 | 43.04 / 53.29 ms | Watch regression: p50 +12.6%, p95 +22.8%; requires matched rerun before code optimization. |
| Context Cleaner, mock baseline arm | 75.66 / 100.13 ms p50/p95 | 76.39 / 102.47 ms | 10 comparable pairs overall; baseline arm remains within small cross-run variation. |
| Context Cleaner, mock Cleaner arm | 97.82 / 228.11 ms p50/p95 | 97.83 / 226.78 ms | Similar to prior run; 280 turns per arm, all 20 candidate runs passed with complete timing. |

**Fresh verification — 2026-09-23:** `pnpm test`, `pnpm typecheck`, `pnpm build`, all four listed benchmark commands, and `git diff --check` passed. This verifies local behavior and mock/local performance only; approved live-provider and capacity-source deferrals remain.

**Fresh forwarding watch:** candidate-only rerun reported long-history concurrency-16 p95 `59.626 ms` and nested-block concurrency-16 p95 `489.043 ms`. These lack matched base samples in this run; treat as unconfirmed timing signals, not attributable regressions. Rerun matched conditions before optimizing.

**Matched forwarding rerun — 2026-09-23:** pre-change `4f1be2b` versus candidate `7ffffbc`, identical harness (`15` samples, `3` warmups). Long-history concurrency-16: p50 `55.165 → 59.971 ms` (`+8.7%`), p95 `156.157 → 72.046 ms` (`-53.9%`). Nested-block concurrency-16: p50 `50.808 → 52.336 ms` (`+3.0%`), p95 `346.104 → 67.563 ms` (`-80.5%`). Prior p95 watch regression did not reproduce; keep code unchanged and do not optimize from this run.

**Unavailable metrics and limits:** `bench:context-cleaner` returned zero provider-usage records. It runs against mock upstreams, so actual input/output tokens, cost per successfully completed live task, provider cache-hit rate, cached-token count, TTFT, and live Codex/9Router continuation are unavailable. Its request-byte totals are not token estimates. Forwarding reports local request timing and JS heap/allocation proxies, not OS CPU, peak process memory, disk I/O, or provider latency. No harness currently measures those OS counters. Cleaner mock benchmark compares baseline and Cleaner arms, but does not establish cache impact from early/late releases with actual provider receipts. Do not infer any of these values from fixture bytes, hashes, or timing proxies.

**Priority:** Keep indexed CCR lookup; cold/stale-index rebuild and missing-artifact scans remain highest measured recovery costs. Re-run concurrency-16 forwarding only if later evidence shows a repeatable regression. Add no runtime telemetry or provider-cache prediction without measured need and receipt-backed evidence.

## Invariants

1. `artifactRef` resolves exact bytes; legacy `dataKey` latest-version behavior remains unchanged.
2. Occurrence fingerprints remain release-validation identity. Duplicate membership is evidence only, never release authority.
3. Cleaner preview and inspection are side-effect-free. Only explicit agent-approved release uses existing validation and receipt ownership.
4. Unknown or stale usage/cache evidence remains explicitly unknown.
5. RTK reduction preserves actionable diagnostic content and known execution outcome, or provides exact recovery for omitted content.
6. Recovery search stays bounded in output and reports completeness and continuation; exact-reference fallback never silently truncates its search.
7. No new archive registry, recovery engine, Cleaner estimator, automatic pruning, or parallel runtime subsystem.

## Task Breakdown

### Task 0: Reproduce and Pin Current Contracts

**Purpose:** Turn each reported gap into a focused regression before edits.
**Task Function:** Baseline verification.
**Template Profile:**

- Controller-selected: `unresolved`
- Selection basis: execution-time profile selection after plan approval.
**Specification Coverage:** All five P1 objectives.
**Required Skills:** `skill-systematic-debugging`, `skill-test-driven-development`, `skill-performance-optimization`.
**Files And Symbols:**

- `components/packages/features/reduction/tests/tool-payload-router.test.ts`
- `components/packages/foundation/artifact-store/tests/archive-recovery.test.ts`
- `components/adapters/codex/tests/context-cleaner-bridge.test.ts`
- `components/products/cli/tests/clean.test.ts`
- `components/adapters/codex/src/context-history/sse-item-collector.ts`
- `components/adapters/codex/src/router-cache-telemetry.ts`

**Dependencies:** None.
**Authority:**

- Preauthorized local actions: Run focused tests and inspect source; do not change source in this task.
- Stop for: a defect cannot be reproduced or repository state changes.
**Steps:**

1. Pin fixtures for nested application `id` fields, duplicate envelope identities, long TAP expected/actual blocks, and known/unknown completion.
2. Capture references emitted by Reduction, persisted tool results, and supported workspace archives; exercise normal recovery entry points.
3. Capture Cleaner inspection and preview through CLI, not only service-level tests.
4. Trace response `usage` to persisted response identity. Record whether an authoritative model context limit and reserved-output budget exist in current runtime/config.
5. Record baseline duplicate-inspection and preview overhead plus CCR early/late indexed, cold-rebuild, and missing-reference measurements using existing scripts. Capture raw forwarding, base implementation, candidate implementation, and isolated Reduction/RTK/CCR/Cleaner effects on pinned fixtures and representative Codex/9Router traffic; include recovery overhead, task completion, tokens/cost/latency per successful task, actual provider cache receipts, TTFT/p50/p95, CPU/memory/disk, fidelity, exact recovery, early/late releases, and cumulative multi-turn continuation. Mark unavailable metrics with exact harness or access gap.

**Verification:** Run focused tests named in Tasks 1–4 and `pnpm --dir components/packages/foundation/artifact-store bench:recovery`. Record reproductions and baseline without raw prompts or provider secrets.
**Exit Criteria:** Each implementation task has a failing regression or verified contract test; pressure-source availability is recorded; baseline metrics are measured or explicitly classified unavailable without unsupported estimates.

### Task 1: Resolve Advertised CCR References Across Existing Roots

**Purpose:** Recover every supported advertised `artifactRef` through the normal interface, regardless of existing writer root.
**Task Function:** Shared recovery closure.
**Template Profile:**

- Controller-selected: `unresolved`
- Selection basis: execution-time profile selection after plan approval.
**Specification Coverage:** CCR focused retrieval.
**Required Skills:** `skill-systematic-debugging`, `skill-test-driven-development`, `skill-backend-verification`.
**Files And Symbols:**

- `components/packages/foundation/artifact-store/src/archive-recovery/archive-paths.ts`
- `components/packages/foundation/artifact-store/src/archive-recovery/index.ts`
- `components/packages/foundation/artifact-store/src/archive-recovery/tool-result-persist.ts`
- `components/packages/foundation/artifact-store/tests/archive-recovery.test.ts`
- `components/products/mcp/src/index.ts`
- `components/adapters/openclaw/src/context-stack/page-in/recovery-tool.ts`

**Dependencies:** Task 0.
**Authority:**

- Preauthorized local actions: Modify artifact-store recovery and direct consumers only; run listed tests and benchmark.
- Stop for: workspace recovery requires a new state owner or a new index format/registry.
**Steps:**

1. Enumerate existing write roots from `defaultArchiveDir()`, `archiveContent()`, and `planToolResultPersistence()`.
2. Extend the existing artifact-store resolver to check its digest-sharded index and supported roots, validate digest and content, then use existing exact fallback behavior.
3. Keep root discovery and index repair in artifact-store; MCP and OpenClaw continue using the shared resolver.
4. Preserve legacy `dataKey` lookup behavior and existing bounded search, completeness, and continuation contracts.
5. For every real writer path, capture its emitted reference, restart the resolver/service, and recover exact bytes through MCP and OpenClaw entry points.

**Verification:**

- `pnpm --dir components/packages/foundation/artifact-store test`
- `pnpm --dir components/products/mcp test`
- `pnpm --dir components/adapters/openclaw test`
- `pnpm --dir components/packages/foundation/artifact-store bench:recovery`

Prove supported roots, corrupt/missing-index repair, digest-mismatch rejection, bounded search continuation, and unchanged latest `dataKey` selection.
**Exit Criteria:** Every emitted reference from supported roots recovers exact content through normal tools; fallback reports no false miss.

### Task 2: Preserve Complete RTK Diagnostic Blocks and Outcome

**Purpose:** Keep selected test/compiler failures actionable after Reduction.
**Task Function:** Reduction behavior correction.
**Template Profile:**

- Controller-selected: `unresolved`
- Selection basis: execution-time profile selection after plan approval.
**Specification Coverage:** RTK-style command-aware filtering.
**Required Skills:** `skill-systematic-debugging`, `skill-test-driven-development`, `skill-backend-verification`.
**Files And Symbols:**

- `components/packages/features/reduction/src/reduction/tool-payload-router.ts`
- `components/packages/features/reduction/tests/tool-payload-router.test.ts`
- `components/packages/features/reduction/tests/exec-output-truncation-recovery.test.ts`

**Dependencies:** Task 0.
**Authority:**

- Preauthorized local actions: Correct existing selectors and tests only; run listed checks.
- Stop for: command provenance is ambiguous, or work requires a new parser framework or broader command activation.
**Steps:**

1. Group TAP failure identity, location, error, expected/actual, continuation, stack, and execution metadata as one evidence block.
2. Apply existing output budget to whole blocks. Mark omitted values and preserve exact `artifactRef`; never leave empty `expected:` or `actual:` labels.
3. Keep completion `complete`, `incomplete`, and `unknown` distinct; emit exit code only when present in trusted execution metadata.
4. Preserve TypeScript location, code, message, duplicate count, compiler summary, and incomplete status under the same budget.
5. Keep selectors gated by normalized command provenance and generic routing for unknown or mixed output.

**Verification:**

- `pnpm --dir components/packages/features/reduction test`
- `pnpm --dir components/packages/features/reduction typecheck`

Test long continuations beyond current limits, omitted decisive values, complete/nonzero exit, incomplete stream, unknown status, and mixed-output fallback. Assert exact recovery when evidence exceeds budget.
**Exit Criteria:** Selected failures preserve diagnostic semantics and execution outcome, or identify omissions with usable exact recovery.

### Task 3: Make Duplicate Evidence Correct, Bounded, and Visible

**Purpose:** Discover equivalent eligible occurrences without stripping application data or adding routine inspection cost.
**Task Function:** Cleaner inspection integration.
**Template Profile:**

- Controller-selected: `unresolved`
- Selection basis: execution-time profile selection after plan approval.
**Specification Coverage:** Duplicate-occurrence discovery.
**Required Skills:** `skill-test-driven-development`, `skill-backend-verification`.
**Files And Symbols:**

- `components/adapters/codex/src/context-cleaner/bridge.ts`
- `components/adapters/codex/tests/context-cleaner-bridge.test.ts`
- `components/packages/features/cleaner/src/contracts.ts`
- `components/packages/features/cleaner/src/control-service.ts`
- `components/products/cli/src/clean.ts`
- `components/products/cli/src/clean-renderer.ts`
- `components/products/cli/src/usage.ts`
- `components/products/cli/tests/clean.test.ts`

**Dependencies:** Task 0.
**Authority:**

- Preauthorized local actions: Extend existing inspection contracts, implementation, and CLI tests only; run listed checks.
- Stop for: implementation requires persisting duplicate groups or making them release recommendations.
**Steps:**

1. Canonicalize only known top-level Codex envelope identity fields. Preserve nested application objects, including nested `id`.
2. Index snapshot item sizes by stable ID once; avoid per-item linear lookups.
3. Make duplicate hashing opt-in through `clean --inspect <session-id> --duplicates`; keep existing inspection cheap and backward-compatible.
4. Bound returned groups and occurrence IDs with omitted counts and `available`/`unavailable` status; never truncate silently.
5. Render duplicate evidence and revision in the existing CLI inspection view.
6. Keep occurrence fingerprints and explicit release validation unchanged.

**Verification:**

- `pnpm --dir components/adapters/codex test`
- `pnpm --dir components/packages/features/cleaner test`
- `pnpm --dir components/products/cli test`
- `pnpm --dir components/adapters/codex typecheck`

Assert duplicate envelope IDs group identical eligible content; nested IDs or changed payload stay distinct; normal inspect skips hashing; bounded results report omissions; duplicate membership never authorizes release.
**Exit Criteria:** Agent can request accurate bounded duplicate evidence without changing release authority.

### Task 4: Expose Comparable, Side-Effect-Free Release Preview

**Purpose:** Show actual candidate request impact before explicit release.
**Task Function:** Cleaner preview integration.
**Template Profile:**

- Controller-selected: `unresolved`
- Selection basis: execution-time profile selection after plan approval.
**Specification Coverage:** Cache-aware release preview.
**Required Skills:** `skill-test-driven-development`, `skill-backend-verification`.
**Files And Symbols:**

- `components/adapters/codex/src/context-cleaner/bridge.ts`
- `components/adapters/codex/tests/context-cleaner-bridge.test.ts`
- `components/packages/features/cleaner/src/contracts.ts`
- `components/packages/features/cleaner/src/control-service.ts`
- `components/packages/features/cleaner/src/orchestrator.ts`
- `components/products/cli/src/clean.ts`
- `components/products/cli/src/clean-renderer.ts`
- `components/products/cli/src/usage.ts`
- `components/products/cli/tests/clean.test.ts`

**Dependencies:** Task 0.
**Authority:**

- Preauthorized local actions: Reuse `previewRelease()` and context-rewrite backend; run listed tests and typechecks.
- Stop for: preview would write lifecycle state or normal request encoding requires an external provider contract change.
**Steps:**

1. Characterize normal Codex request encoding. Compare baseline and candidate with the same encoder, model, instructions, tools, continuation, and serialization. Return unknown when equivalence cannot be established.
2. Report selected/validated/deferred/rejected counts; gross released characters; net encoded characters; net UTF-8 bytes; earliest changed history item; unchanged prefix count; and provider-cache outcome.
3. Correct `netSavedChars` to character units and expose byte delta separately. Never predict provider cache-hit percentages.
4. Add `clean --session <id> --preview-release <occurrence-evidence.json>` using existing ID/fingerprint validation and render preview output.
5. Reject stale revision, duplicate IDs, invalid fingerprints, and empty selection. Leave state directory unchanged.

**Verification:**

- `pnpm --dir components/packages/features/cleaner test`
- `pnpm --dir components/adapters/codex test`
- `pnpm --dir components/products/cli test`
- `pnpm --dir components/adapters/codex typecheck`

Use Unicode content to distinguish character and byte counts. Assert common encoding, unknown provider outcome without actual receipts, stale selection rejection, and unchanged state files.
**Exit Criteria:** CLI preview accurately describes comparable encoded requests and creates no lifecycle state.

### Task 5: Wire Revision-Bound Context-Pressure Attention

**Purpose:** Surface advisory pressure only from trustworthy current-session usage and capacity evidence.
**Task Function:** Codex usage-source integration.
**Template Profile:**

- Controller-selected: `unresolved`
- Selection basis: execution-time profile selection after plan approval.
**Specification Coverage:** Context-pressure attention signal.
**Required Skills:** `skill-systematic-debugging`, `skill-test-driven-development`, `skill-backend-verification`.
**Files And Symbols:**

- `components/adapters/codex/src/context-history/sse-item-collector.ts`
- `components/adapters/codex/src/context-cleaner/bridge.ts`
- `components/adapters/codex/tests/context-cleaner-bridge.test.ts`
- `components/packages/features/cleaner/src/contracts.ts`
- `components/products/cli/src/hosts/cleaner.ts`
- `components/products/cli/src/clean-renderer.ts`
- `components/products/cli/tests/clean.test.ts`

**Dependencies:** Task 0.
**Authority:**

- Preauthorized local actions: Reuse response usage and pressure contracts; run listed tests and typechecks.
- Stop for: no authoritative context limit/reserved-output source exists, or completion would require a new registry, character estimator, background collector, or automatic cleanup.
**Steps:**

1. Trace Codex response `usage` from `sse-item-collector.ts` through its current retention path and verify session/response identity. Do not assume usage remains available to inspection. Cache-read token counts are not total context usage.
2. Connect evidence only when used-token count, authoritative model limit, reserved-output budget, current history revision, and observation timestamp all match the inspected session.
3. Reuse existing pressure bands. Stale, incomplete, malformed, or missing evidence renders `unknown` with source/freshness reason.
4. Render pressure through existing CLI inspection without release recommendations or automatic actions.
5. If current runtime/config has no authoritative limit or output reservation, stop this task as blocked and return `unknown`; request an approved source contract before adding configuration or a registry.

**Verification:**

- `pnpm --dir components/adapters/codex test`
- `pnpm --dir components/packages/features/cleaner test`
- `pnpm --dir components/products/cli test`
- `pnpm --dir components/adapters/codex typecheck`

Test revision/session match and mismatch, stale data, missing limit/reservation, cache-only telemetry, malformed usage, and each pressure band. Assert no Cleaner lifecycle side effects.
**Exit Criteria:** Pressure is trustworthy when complete inputs exist and explicitly unknown otherwise. Task 5 is deferred by user approval; it does not block closure of four active objectives.

### Task 6: Final Verification

**Purpose:** Prove all completed objectives together and reconcile any blocked objective.
**Task Function:** Final verification.
**Template Profile:**

- Controller-selected: `unresolved`
- Selection basis: execution-time profile selection after plan approval.
**Specification Coverage:** All five P1 objectives and preserved invariants.
**Required Skills:** `skill-verification-before-completion`.
**Files And Symbols:** All task-owned source, test, and benchmark files listed above.
**Dependencies:** Tasks 1–4; Task 5 disposition.
**Authority:**

- Preauthorized local actions: Run listed checks and benchmarks only.
- Stop for: an unrelated worktree change or a failed required check. Do not commit, publish, merge, or clean branches/worktrees.

**Steps:** Run focused checks first, then listed full-scope checks. Record approved deferrals and unavailable evidence without weakening acceptance criteria; close approved active scope without claiming unavailable pressure or live-provider evidence.
**Verification:** See `## Verification`.

## Verification

After Tasks 1–5, run focused checks, then the listed package and benchmark commands. For the approved performance scope, run the existing Codex forwarding and context-cleaner benchmarks in matched baseline/candidate configurations; use live provider mode only with approved configured access. Report measured values separately from estimates.

```powershell
pnpm --dir components/packages/foundation/artifact-store test
pnpm --dir components/packages/foundation/artifact-store typecheck
pnpm --dir components/packages/features/reduction test
pnpm --dir components/packages/features/reduction typecheck
pnpm --dir components/packages/features/cleaner test
pnpm --dir components/packages/features/cleaner typecheck
pnpm --dir components/products/mcp test
pnpm --dir components/adapters/openclaw test
pnpm --dir components/adapters/codex test
pnpm --dir components/adapters/codex typecheck
pnpm --dir components/products/cli test
pnpm --dir components/products/cli typecheck
pnpm --dir components/packages/foundation/artifact-store bench:recovery
pnpm --dir components/packages/features/reduction bench:hotspots
pnpm --dir components/adapters/codex run bench:context-cleaner
pnpm --dir components/adapters/codex run bench:forwarding
git diff --check
```

Run workspace `pnpm test`, `pnpm typecheck`, and `pnpm build` only after focused checks pass. Compare identical fixtures; report measured results separately from estimates.

## Post-merge RTK/CCR Correctness Erratum — 2026-09-23

PR #34 remains historically complete for its approved scope. Follow-up
verification found and closed four narrower defects without changing release
authority or runtime architecture:

- trusted workspace `artifactRef` recovery now scans the existing workspace
  archive directory after missing or stale derived indexes, verifies content,
  and repairs the sharded lookup;
- CCR search now admits bounded evidence blocks, reports `scanComplete`,
  `resultsComplete`, `truncated`, and first-unreturned `nextStartLine`
  separately, and emits archive-relative recovery guidance for oversized lines;
- RTK TAP summaries keep multiline `expected`, `actual`, and `stack` bodies
  attached to their headers in source order;
- CLI Cleaner preview now renders existing transport character and UTF-8 byte
  deltas separately from gross and encoded savings.

Fresh focused tests, typechecks, MCP/OpenClaw coverage, Codex coverage, local
recovery/reduction benchmarks, and full workspace verification passed. One
unrelated Cleaner concurrency test was flaky on its first run; rerun passed.
Context-pressure wiring and provider-backed measurements remain explicitly
deferred because authoritative capacity, reservation, and provider evidence
are unavailable.

## Completion Criteria

1. Every reference emitted by supported persistence paths recovers exact content through normal MCP/OpenClaw recovery after resolver restart.
2. CCR search stays bounded, navigable, and explicit about incomplete scans.
3. RTK filtering preserves actionable diagnostic blocks and known execution status, with exact recovery for omissions.
4. Duplicate discovery preserves application payload identity, is opt-in and bounded, and is visible in CLI inspection.
5. Preview validates current revision, compares equivalent encoded requests, reports character and byte units separately, and writes no state.
6. Pressure uses revision-bound provider usage plus authoritative model capacity and output reservation; otherwise it reports unknown. Do not mark all five P1 objectives complete while those inputs are unavailable.
7. No automatic release, archive registry, second recovery engine, or historical-read classification change.

## Final RTK/CCR Correctness Closure — 2026-09-23

Follow-up against merged `main` at `7138156` closes the remaining agreed RTK
and CCR correctness blockers without changing runtime architecture:

- CCR search now admits matches under one shared output budget before deriving
  response text or `structuredContent`; metadata contains only admitted bounded
  entries, exact omission markers, and first-unreturned continuation.
- MCP recovery forwards the canonical bounded CCR page without exposing omitted
  full match text through structured content.
- Nested TAP failures use indentation-aware sibling boundaries; multiline
  `expected`, `actual`, and `stack` values, including empty-inline fields, stay
  attached to their owning failure and preserve source order.

Focused artifact-store, MCP, and Reduction tests plus typechecks pass. Full
workspace verification and existing recovery/Reduction benchmarks remain the
acceptance gate. Cache-aware preview, duplicate discovery, context-pressure
runtime wiring, live-provider evaluation, and speculative optimization remain
closed or deferred as previously recorded.

## Final RTK/CCR Boundary Stabilization — 2026-09-23

Follow-up against merged `main` at `8f923a5` closes two reproducible boundary
cases without changing runtime architecture:

- RTK nested TAP selection now builds per-failure ranges, preserves actionable
  child failures emitted before parent summaries, isolates siblings, and keeps
  multiline evidence attached in source order.
- CCR search now returns `search_output_budget_insufficient` with exact
  archive-relative recovery coordinates when no evidence or omission marker can
  fit the requested budget. It emits no repeated continuation cursor, and MCP
  maps the condition to `isError: true` without exposing full match text.

Focused Reduction, artifact-store, and MCP tests; full workspace tests,
typecheck, and build; package typechecks; recovery and Reduction benchmarks;
and `git diff --check` all pass. Cache-aware preview, duplicate discovery,
context-pressure runtime wiring, live-provider evaluation, and speculative
optimization remain closed or deferred.
