---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: superseded
layer: change
name: lightrsi-stable-reduction-replay
targets:
  - components/adapters/codex/src/reduction.ts
  - components/adapters/codex/src/proxy-runtime.ts
  - components/packages/features/reduction/src/reduction/pipeline.ts
  - components/packages/features/reduction/src/passes/pass-tool-payload-trim.ts
  - components/packages/features/reduction/src/reduction/tool-payload-router.ts
  - components/packages/features/reduction/src/reduction/types.ts
  - components/adapters/codex/src/context-history/effective-history.ts
  - components/adapters/codex/src/context-history/request-journal.ts
  - components/adapters/codex/src/context-history/response-journal.ts
  - components/adapters/codex/src/context-history/journal-store.ts
  - components/adapters/codex/src/context-history/replayability.ts
  - components/adapters/codex/src/context-history/types.ts
  - components/adapters/codex/tests/reduction.test.ts
  - components/adapters/codex/tests/responses-codec.test.ts
  - components/adapters/codex/tests/proxy-wire-prefix.test.ts
  - components/adapters/codex/tests/context-history-journal.test.ts
  - components/adapters/codex/tests/context-history-effective-history.test.ts
  - components/adapters/codex/tests/context-history-sse-item-collector.test.ts
  - components/packages/features/reduction/tests/read-state-compaction.test.ts
  - components/packages/features/reduction/tests/tool-payload-router.test.ts
  - components/packages/features/reduction/tests/tool-payload-trim-recovery.test.ts
  - components/packages/foundation/host-adapter/tests/cache-usage.test.ts
---

# Stable Reduction Replay With Deferred Exact Reread References

## Goal

Make Codex reduction causally replayable and cache-safe without changing the model-facing representation of rereads. Preserve existing output behavior unless an explicit compaction or rebase operation authorizes rewriting. Defer exact reread substitution until existing archive recovery proves immutable, version-specific recovery and equivalent agent behavior. Do not add a new persistent reduction-state subsystem.

## Implementation Outcomes

### Wire-level append-only replay contract

With unchanged reduction configuration and append-only history, adding a later request item does not change the encoded provider-wire representation of any previously emitted input item. Explicit compaction or rebase remains the only exception. Tests cover three turns, threshold crossing, later reads and mutations, restart reload, and wire bytes rather than only internal segment text.

### Causal Codex reduction

Codex derives each tool segment's preceding user query, reduction eligibility, and disclosure state from the prefix available when that item was emitted. Ordinary `tool_payload_trim` does not use future read mutations in Codex replay mode. Case-sensitive resource identity remains distinct.

Each ordinary streaming, non-streaming, and fallback request records the accepted model-visible input representation separately from response-chain reset state. Effective-history consumers use `full`, `outlined`, or `unknown` provenance; legacy entries without emission evidence never default to full.

### Safe shared reduction execution

Reduction pass failure is fail-open only when pass mutation safety is proven through immutable/copy-on-write handlers or state restoration. Existing report entries gain pass timing without a second telemetry system. Non-Codex adapters retain current read-state behavior unless compatibility tests prove an explicit shared mode safe.

The outer reduction boundary also fails open when snapshot loading or instruction construction fails, and the recorded fallback decision replays unchanged when accepted-input evidence exists.

### Deferred exact reread references

Exact reread substitution is deferred. Existing archive recovery accepts `dataKey` and can resolve archive content, but current recovery does not establish immutable, version-specific identity or equivalent agent behavior for replacing exact rereads. Stable replay completes independently; no new reference markers are emitted and existing reread behavior remains unchanged.

### Proof and handoff readiness

Focused regression tests, cross-adapter compatibility tests, direct proxy/reduction boundary tests, and final full-suite evidence make stable replay ready for independent review. Exact reread substitution and changed-file/text/AST deltas remain deferred.

## Execution Approach

- Mode: `inline sequential`
- Coordination: `git-tracked`
- Default task executor: `codex`
- Required skills: `skill-test-driven-development`, `skill-backend-verification`, `skill-code-standards`, `skill-plan-document-reviewer`, `skill-verification-before-completion`
- Isolation: `task-specific isolated worktree`
- Commit policy: `no commits during execution`; commit and publication require separate user approval
- Preauthorized local actions: source and test edits in declared targets, focused test/typecheck/benchmark commands, local trace inspection, and plan/checklist updates
- User-approval actions: branch publication, commits, push, PR creation, merge, dependency changes, destructive cleanup, and changing persisted user configuration
- Parallel ownership: none; shared reduction contracts and Codex reduction state require ordered writes
- Sequential fallback: execute tasks in listed order; stop at each exit gate before starting the next task

## Coordination State

- Coordination owner: `single lead controller`
- Coordination schema: `2`
- Branch: `codex/stable-reduction-replay`
- Base commit: `276f06ca80181afdec49dda8bb3a63e3f7bbd466`
- Expected workspace: `clean main checkout at base commit; execute in isolated worktree`
- Next action: `await authorized Git disposition`
- Blockers: `none for stable replay; exact reread substitution remains deferred pending a verified recovery contract`

| Task | State | Workspace | Executor | Depends On | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Task 1 | `completed` | isolated worktree | `codex` | none | wire-prefix baseline and failing regression fixtures | `proxy-wire-prefix.test.ts` passes |
| Task 2 | `completed` | isolated worktree | `codex` | Task 1 | accepted-input provenance and restart tests pass | `context-history-journal.test.ts`, `context-history-effective-history.test.ts`, typecheck pass |
| Task 3 | `completed` | isolated worktree | `codex` | Task 2 | causal query and eligibility tests pass | Codex/reduction focused suites pass |
| Task 4 | `completed` | isolated worktree | `codex` | Task 3 | identity/disclosure and cross-adapter compatibility tests pass | case-sensitive fixture plus Claude Code/OpenClaw suites pass |
| Task 5 | `completed` | isolated worktree | `codex` | Task 4 | pass-error isolation and timing tests pass | nested-mutation fixture, typechecks, and hotspot benchmark pass |
| Task 6 | `completed` | isolated worktree | `codex` | Task 5 | stable replay gate and outbound-wire evidence pass | Codex wire-prefix and full adapter suites pass |
| Task 7 | `deferred` | isolated worktree | `codex` | Task 6 | immutable recovery contract and behavioral evidence approved before implementation | existing archive recovery is not sufficient for exact version-specific reread substitution |
| Task 8 | `completed` | isolated worktree | `codex` | Tasks 1–6; Task 7 deferred | final verification returns `verified`; deferral record is complete | all suites, typechecks, benchmark, diff check, and review complete |

## Task Breakdown

### Task 1: Establish wire-level replay invariant and baseline

**Purpose:**
- Create the canonical regression harness before changing reduction behavior.
- Prove the comparison is performed on encoded Responses payload items and preserves user-visible item ordering and bytes.

**Task Function:**
- Replay-invariant test design and baseline capture

**Template Profile:**
- Controller-selected: `xhigh`
- Selection basis: cross-module invariant design and high ambiguity around model-visible history.

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: independently challenge whether tests compare the provider-wire representation rather than internal intermediate objects.

**Specification Coverage:**
- Wire-level append-only replay invariant.
- Explicit compaction/rebase remains the only allowed historical rewrite.
- No new persistent reduction-state store.

**Required Skills:**
- `skill-test-driven-development`
- `skill-backend-verification`

**Files And Symbols:**
- Inspect: `components/adapters/codex/src/reduction.ts:applyBeforeCallReductionToPayload`, `buildTurnContext`
- Inspect: `components/adapters/codex/src/responses-codec.ts`
- Inspect: `components/adapters/codex/src/context-history/effective-history.ts:buildCodexEffectiveHistoryView`
- Modify: `components/adapters/codex/tests/reduction.test.ts`
- Modify: `components/adapters/codex/tests/responses-codec.test.ts`
- Verify: `components/adapters/codex/src/context-history/*`

**Dependencies:**
- Current `main` at `276f06c`.
- Existing request/response journal and Responses codec remain authoritative.

**Authority:**
- Preauthorized local actions: add deterministic fixtures and assertions in declared tests; inspect current journal and codec behavior.
- Stop for: any requirement to change provider contracts, persisted schema, or explicit rebase semantics.

**Steps:**
- [ ] Step 1: Build a three-turn fixture with a user query, tool output, later user query, unrelated tool output, repeated read, later mutation, and a threshold-crossing request.
- [ ] Step 2: Encode each reduced request using the existing Responses serialization path and capture the historical prefix by stable input-item identity.
- [ ] Step 3: Assert `R(H1 + H2)[historical prefix] === R(H1)` for unchanged configuration; add restart/session-snapshot reload coverage.
- [ ] Step 4: Add an explicit exception fixture proving compaction/rebase may change historical bytes only when the existing rebase boundary is present.

**Verification:**
- [ ] `pnpm --dir components/adapters/codex exec node --import tsx --test tests/reduction.test.ts tests/responses-codec.test.ts`
- Expected: new invariant tests fail for current request-wide/future-aware behavior, proving the harness detects the defect before implementation.

**Exit Criteria:**
- A deterministic wire-level test harness identifies historical-prefix drift and distinguishes normal replay from explicit compaction/rebase.

### Task 2: Capture accepted-input provenance and restart contract

**Purpose:**
- Record the exact input representation accepted by the provider for every ordinary request path before replay decisions depend on it.
- Keep accepted-input provenance separate from response-chain reset and parent-linkage state.

**Task Function:**
- Model-visible input provenance and journal compatibility

**Template Profile:**
- Controller-selected: `xhigh`
- Selection basis: persistence contract, streaming/non-streaming parity, and replay data-loss risk.

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: challenge ordinary, fallback, restart, and legacy-journal evidence paths.

**Specification Coverage:**
- Ordinary streaming, non-streaming, and fallback requests capture accepted input after reduction and before upstream send.
- `acceptedInputItems` evidence does not imply `committedInputItems` or clear `previous_response_id`.
- Legacy entries without emission evidence classify as `unknown`, never as full output.

**Required Skills:**
- `skill-test-driven-development`
- `skill-backend-verification`

**Files And Symbols:**
- Inspect and modify: `components/adapters/codex/src/proxy-runtime.ts` request, streaming, non-streaming, and fallback journal paths
- Inspect and modify: `components/adapters/codex/src/context-history/types.ts`, `request-journal.ts`, `response-journal.ts`, `journal-store.ts`
- Inspect and modify: `components/adapters/codex/src/context-history/effective-history.ts:buildCodexEffectiveHistoryView`
- Inspect and modify: `components/adapters/codex/src/context-history/replayability.ts`
- Modify: `components/adapters/codex/tests/context-history-journal.test.ts`, `context-history-effective-history.test.ts`, `proxy-wire-prefix.test.ts`

**Dependencies:**
- Task 1 wire-level harness and outbound input capture.
- Existing journal ownership and persisted parser remain canonical; no second history store.

**Authority:**
- Preauthorized local actions: add one accepted-input provenance field and pass it through existing journal/effective-history contracts; add ordinary, fallback, restart, and legacy fixtures.
- Stop for: changing response-chain reset semantics, adding a parallel persistent ledger, or treating raw `originalPayload` as accepted evidence.

**Steps:**
- [ ] Step 1: Capture the post-reduction input representation actually sent for streaming, non-streaming, and outer-boundary fallback paths, without setting `committed` or changing parent linkage.
- [ ] Step 2: Persist and parse accepted-input evidence through existing request/response journal types and stores; preserve absence as an explicit unknown state for legacy entries.
- [ ] Step 3: Pass accepted-input provenance into effective-history and reduction consumers; distinguish `full`, `outlined`, and `unknown` representation states.
- [ ] Step 4: Add failure-to-success-to-restart coverage proving a fallback decision remains stable when evidence exists and becomes conservative `unknown` when evidence is missing.

**Verification:**
- [ ] `pnpm --dir components/adapters/codex exec node --import tsx --test tests/context-history-journal.test.ts tests/context-history-effective-history.test.ts tests/proxy-wire-prefix.test.ts`
- Expected: accepted model-visible input is recorded on every ordinary path, reset state remains independent, and legacy entries never upgrade to full by fallback.
- [ ] `pnpm --dir components/adapters/codex run typecheck`
- Expected: journal, parser, effective-history, and proxy contracts compile without persisted-schema drift.

**Exit Criteria:**
- Replay consumers receive direct accepted-input evidence for current entries and conservative unknown state for legacy entries, including after restart.

### Task 3: Implement causal Codex replay and eligibility

**Purpose:**
- Make Codex reduction decisions depend only on the prefix available at each item.
- Remove aggregate and request-wide decisions that rewrite old history when later content arrives.

**Task Function:**
- Causal request-context construction and replay-safe eligibility

**Template Profile:**
- Controller-selected: `xhigh`
- Selection basis: stateful multi-turn behavior and cache identity risk.

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: inspect old-item stability across later turns, thresholds, and snapshot reload.

**Specification Coverage:**
- Causal `latestUserQuery`.
- Causal threshold eligibility for candidate segments and payload groups.
- No future-aware read state in ordinary Codex replay.

**Required Skills:**
- `skill-test-driven-development`
- `skill-backend-verification`

**Files And Symbols:**
- Inspect and modify: `components/adapters/codex/src/reduction.ts:buildTurnContext`, `buildAnalyzerReductionInstructions`, `applyBeforeCallReductionToPayload`
- Inspect and modify: `components/packages/features/reduction/src/passes/pass-tool-payload-trim.ts:toolPayloadTrimPass`
- Inspect: `components/packages/features/reduction/src/reduction/read-state-compaction.ts:classifyReadStates`
- Modify: `components/adapters/codex/tests/reduction.test.ts`
- Modify: `components/packages/features/reduction/tests/read-state-compaction.test.ts`

**Dependencies:**
- Task 1 wire-level invariant and fixtures.
- Task 2 accepted-input provenance and restart contract.
- Existing `ReductionPassSpec.options` supports an opt-in Codex replay mode without a new public type hierarchy.

**Authority:**
- Preauthorized local actions: modify Codex reduction and add an opt-in replay-mode branch in shared tool trimming.
- Stop for: any change to Claude Code/OpenClaw behavior without compatibility fixtures passing.

**Steps:**
- [ ] Step 1: Replace request-wide `extractLatestUserQuery` use with a left-to-right `currentUserQuery`; stamp each emitted tool segment with the query immediately preceding that item and make the trim pass consume segment-level query metadata rather than turn-level `metadata.latestUserQuery`.
- [ ] Step 2: Replace total-history trigger short-circuit and aggregate group eligibility with prefix/segment-causal eligibility; keep unchanged items eligible only under the same conditions that applied at emission.
- [ ] Step 3: Pass an explicit Codex replay-mode option to `tool_payload_trim`; in that mode, do not classify a segment using reads or mutations that occur later in the same request. Preserve existing default classifier behavior for non-Codex callers.
- [ ] Step 4: Re-run Task 1 fixtures and add threshold-crossing, later-mutation, repeated-read, and three-turn assertions with bounded prefix walks and history lookups.

**Verification:**
- [ ] `pnpm --dir components/adapters/codex exec node --import tsx --test tests/reduction.test.ts tests/responses-codec.test.ts`
- Expected: historical wire prefixes remain byte-identical across append-only turns; explicit rebase remains the only rewrite path.
- [ ] `pnpm --dir components/packages/features/reduction exec node --import tsx --test tests/read-state-compaction.test.ts`
- Expected: default shared read-state behavior remains unchanged outside explicit Codex replay mode.

**Exit Criteria:**
- Task 1 invariant passes for causal query, threshold, later mutation, repeated read, and restart scenarios without future-aware reads.

### Task 4: Preserve resource identity and historical disclosure

**Purpose:**
- Prevent case-collision and global-snapshot disclosure from changing already-emitted history.
- Make disclosure decisions attributable to each segment/item rather than a mutable global set.

**Task Function:**
- Resource identity and per-item disclosure provenance

**Template Profile:**
- Controller-selected: `high`
- Selection basis: bounded identity and state-provenance change with broad cache consequences.

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: adversarial path-collision and replay-after-restart checks.

**Specification Coverage:**
- Case-sensitive resource identity.
- Old read #1 remains outlined on replay after later read #2 discloses the same resource.
- Snapshot state cannot retroactively upgrade prior segments.

**Required Skills:**
- `skill-test-driven-development`
- `skill-backend-verification`

**Files And Symbols:**
- Inspect and modify: `components/adapters/codex/src/reduction.ts:normalizeDisclosedReadPaths`, `buildTurnContext`, `applyBeforeCallReductionToPayload`
- Inspect and modify: `components/packages/features/reduction/src/passes/pass-tool-payload-trim.ts:toolPayloadTrimPass`
- Inspect and modify: `components/packages/features/reduction/src/reduction/tool-payload-router.ts` path lookup and disclosure routing
- Inspect: `components/adapters/codex/src/session-state.ts:disclosedReadPaths`
- Inspect: `components/adapters/codex/src/context-history/effective-history.ts:buildCodexEffectiveHistoryView`
- Modify: `components/adapters/codex/tests/reduction.test.ts`
- Modify: `components/packages/features/reduction/tests/read-state-compaction.test.ts`
- Modify: `components/packages/features/reduction/tests/tool-payload-router.test.ts`

**Dependencies:**
- Task 3 causal replay mode.
- Existing session snapshot and committed-history data remain canonical; do not add a reduction ledger.

**Authority:**
- Preauthorized local actions: replace only path normalization that changes resource identity; add per-item provenance metadata using existing segment/context metadata.
- Stop for: any persisted schema migration or ambiguity about provider path semantics.

**Steps:**
- [ ] Step 1: Define one shared resource-key function preserving case while including workspace and read-window semantics; use it in Codex reduction and tool-payload-router disclosure lookup. Add distinct `FILE.ts` and `file.ts` fixtures.
- [ ] Step 2: Track whether disclosure occurred before each item/segment, not only whether the path exists in a request-global set.
- [ ] Step 3: Seed snapshot disclosure only for genuinely new items; preserve committed per-item disclosure decisions when reconstructing old history.
- [ ] Step 4: Add restart and snapshot-reload tests proving old read #1 stays outlined while new read #2 may be full.
- [ ] Step 5: Run Claude Code/OpenClaw reduction tests before accepting any shared classifier change.

**Verification:**
- [ ] `pnpm --dir components/adapters/codex exec node --import tsx --test tests/reduction.test.ts`
- Expected: case-sensitive resources remain distinct and historical disclosure output is stable after restart and later reads.
- [ ] `pnpm --dir components/packages/features/reduction test`
- Expected: shared reduction suite passes without behavior drift outside Codex replay mode.

**Exit Criteria:**
- Resource identity and disclosure provenance no longer create cache-hostile historical rewrites, with non-Codex behavior preserved.

### Task 5: Make reduction pass failure safe and observable

**Purpose:**
- Add fail-open behavior without claiming safety while nested state can be partially mutated.
- Record pass timing in existing reduction reports.

**Task Function:**
- Reduction runner mutation safety and timing telemetry

**Template Profile:**
- Controller-selected: `high`
- Selection basis: shared runner semantics and failure-path correctness.

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: prove a throwing pass cannot leak partial mutations into the next pass or final payload.

**Specification Coverage:**
- Conditional fail-open only after immutable/copy-on-write or restoration guarantee.
- Existing report schema gains `durationMs`.
- No runtime deep clone on every pass unless benchmark evidence shows no cheaper safe option.

**Required Skills:**
- `skill-test-driven-development`
- `skill-backend-verification`
- `skill-performance-optimization`

**Files And Symbols:**
- Inspect and modify: `components/packages/features/reduction/src/reduction/pipeline.ts:runReductionBeforeCall`, `runReductionAfterCall`
- Inspect and modify: `components/packages/features/reduction/src/reduction/types.ts:ReductionReportEntry`, `ReductionPassHandler`
- Inspect and modify: `components/adapters/codex/src/reduction.ts:CodexReductionReportEntry`, `summarizePassEffects`, and outer reduction boundary
- Inspect: `components/packages/features/reduction/src/passes/*`
- Modify: `components/packages/features/reduction/tests/read-state-compaction.test.ts`
- Verify: `components/adapters/codex/tests/reduction.test.ts`

**Dependencies:**
- Task 4 must establish the pass inputs and metadata that the runner protects.

**Authority:**
- Preauthorized local actions: add runner guards, copy-on-write requirements, restoration boundaries, report timing, and focused failure tests.
- Stop for: any solution that silently drops failed-pass diagnostics, mutates caller-owned payloads, or requires a new telemetry store.

**Steps:**
- [ ] Step 1: Inventory pass mutation patterns and select one safe mechanism: immutable pass contract with copy-on-write, or per-pass snapshot/restore limited to mutable fields.
- [ ] Step 2: Catch pass failures, record `pass_error` with `durationMs`, preserve the last valid context, and continue only when the selected safety mechanism proves no partial mutation escaped.
- [ ] Step 3: Propagate `durationMs` through shared `ReductionReportEntry`, Codex-local report types, and `summarizePassEffects`; keep the 5 ms value as a benchmark target, never as a runtime representation switch.
- [ ] Step 4: Add a throwing-pass fixture that mutates nested state before throwing and assert final context equals pre-pass context.
- [ ] Step 5: Add an outer reduction-boundary fallback covering snapshot loading and instruction construction failures before pass execution; persist its fallback provenance for replay.
- [ ] Step 6: Run shared and adapter tests for all affected passes.

**Verification:**
- [ ] `pnpm --dir components/packages/features/reduction test`
- Expected: throwing pass reports `pass_error`, preserves input, and does not prevent later safe passes when fail-open is allowed.
- [ ] `pnpm --dir components/packages/features/reduction run typecheck`
- Expected: report and handler contracts compile for all adapters.
- [ ] `pnpm --dir components/packages/features/reduction run bench:hotspots`
- Expected: existing hotspot benchmark runs; timing evidence is recorded without claiming it proves end-to-end replay cost.
- [ ] `pnpm --dir components/adapters/codex exec node --import tsx --test tests/reduction.test.ts tests/proxy-wire-prefix.test.ts`
- Expected: outer fallback is full and its decision remains stable across failure, later success, and restart.

**Exit Criteria:**
- Pass failure behavior is safe, observable, and bounded without runtime deep cloning by default.

### Task 6: Prove stable replay and close implementation gate

**Purpose:**
- Run the complete replay gate only after provenance, causal decisions, disclosure, and failure handling exist.
- Prove final outbound requests, not only intermediate codec objects, preserve historical prefixes.

**Task Function:**
- End-to-end replay acceptance and cost-bound verification

**Template Profile:**
- Controller-selected: `xhigh`
- Selection basis: cross-turn integration, restart behavior, and cache correctness at transport boundary.

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: independently challenge failure-to-success drift, future-read leakage, and transport/rebase rewrites.

**Specification Coverage:**
- Stable replay is its own milestone after implementation tasks 1–5.
- Existing fallback decisions remain stable when accepted-input evidence exists; missing evidence is conservative `unknown`.
- Exact reread substitution remains deferred; stable replay does not depend on Task 7.

**Required Skills:**
- `skill-backend-verification`
- `skill-verification-before-completion`

**Files And Symbols:**
- Inspect: `components/adapters/codex/src/proxy-runtime.ts`, `reduction.ts`, and context-history owners
- Modify: `components/adapters/codex/tests/proxy-wire-prefix.test.ts`, `reduction.test.ts`, `context-history-journal.test.ts`, `context-history-effective-history.test.ts`
- Verify: `components/packages/features/reduction/tests/read-state-compaction.test.ts`, `tool-payload-router.test.ts`, `tool-payload-trim-recovery.test.ts`

**Dependencies:**
- Tasks 1–5 complete with task-local proof.
- Exact-reference encoding is not required for this gate.

**Authority:**
- Preauthorized local actions: add representative replay fixtures, outbound-request capture, and bounded lookup assertions.
- Stop for: any historical prefix rewrite without explicit compaction/rebase, any future-read dependency, or any benchmark claim unsupported by workload evidence.

**Steps:**
- [ ] Step 1: Run three-turn, threshold-crossing, later-read, later-mutation, repeated-read, restart, and case-sensitive replay fixtures.
- [ ] Step 2: Capture actual outbound provider requests in at least one integration fixture and compare encoded historical prefixes after transport/rebase handling.
- [ ] Step 3: Add failure-to-success-to-restart coverage proving fallback representation stability and conservative legacy behavior.
- [ ] Step 4: Verify causal implementation uses incremental walks and bounded history lookup rather than rebuilding every preceding prefix.
- [ ] Step 5: Record stable-replay milestone evidence and record Task 7 as deferred.

**Verification:**
- [ ] `pnpm --dir components/adapters/codex exec node --import tsx --test tests/proxy-wire-prefix.test.ts tests/reduction.test.ts tests/context-history-journal.test.ts tests/context-history-effective-history.test.ts`
- Expected: actual outbound historical prefixes remain byte-identical across append-only turns and restart; only explicit rebase changes them.
- [ ] `pnpm --dir components/packages/features/reduction test`
- Expected: shared reduction behavior remains unchanged outside explicit Codex replay mode.

**Exit Criteria:**
- Stable replay gate passes with outbound-wire evidence, restart proof, failure fallback proof, and bounded causal lookup evidence.

### Task 7: Defer exact unchanged-reread references pending recovery proof

**Purpose:**
- Keep current full reread behavior unchanged.
- Do not emit model-visible reference markers in stable replay work.
- Record the contract and evidence required before exact reread substitution can replace existing output.

**Task Function:**
- Deferred protocol definition and risk boundary

**Template Profile:**
- Controller-selected: `xhigh`
- Selection basis: cross-turn history correctness, persistence boundaries, and data-loss risk.

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: independently challenge identity, truncation, rebase, and fallback conditions.

**Specification Coverage:**
- Existing archive recovery remains available for explicit recovery notices and `dataKey` lookup.
- Archive lookup alone is not proof of immutable, version-specific historical content.
- No marker substitution, new provider-facing protocol, persistent registry, or reread representation change is part of stable replay.
- Reconsider only after exact identity, content-hash verification, active-tool availability, protected recovery, conservative fallback, and equivalent-behavior evidence exist.

**Required Skills:**
- `skill-backend-verification`
- `skill-plan-document-reviewer`

**Files And Symbols:**
- Inspect only when documenting the deferral: `components/products/mcp/src/index.ts` recovery handler and `components/packages/foundation/artifact-store/src/archive-recovery/index.ts` archive lookup.
- Verify no stable-replay change emits a new reference marker or changes existing reread output.

**Dependencies:**
- Task 6 passes.
- Existing archive recovery contract remains unchanged.

**Authority:**
- Preauthorized local actions: update this plan with the deferral rationale and reconsideration gates.
- Stop for: any marker substitution, recovery behavior change, new persistent registry, or claim of exact equivalence without direct evidence.

**Steps:**
- [x] Step 1: Mark Task 7 deferred from stable replay execution.
- [x] Step 2: Record that recovery notices and `dataKey` lookup do not prove immutable, version-specific content recovery.
- [x] Step 3: Preserve current full reread output and emit no new reference marker.
- [ ] Step 4: Reconsider only after exact identity and content-hash verification, active recovery-tool availability, protected recovery, conservative full fallback, and equivalent-behavior workload evidence are available.

**Verification:**
- [x] Plan review confirms Task 7 is not required for stable replay completion.
- Expected: stable replay has no new reference markers and existing reread behavior remains unchanged.

**Exit Criteria:**
- Exact reread substitution is explicitly deferred with identity, availability, protection, fallback, and behavioral-evidence gates recorded.

### Task 8: Reconcile documentation and complete verification

**Purpose:**
- Confirm all staged outcomes against repository truth and record deferrals before approval or execution handoff.

**Task Function:**
- Final integration verification and plan reconciliation

**Template Profile:**
- Controller-selected: `high`
- Selection basis: broad cross-package verification and completion evidence.

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: independent final scope, regression, and deferral review.

**Specification Coverage:**
- All implementation outcomes, explicit non-goals, compatibility constraints, and evidence requirements.

**Required Skills:**
- `skill-verification-before-completion`
- `skill-plan-document-reviewer`

**Files And Symbols:**
- Inspect: all files listed in Tasks 1–6
- Modify: `components/adapters/codex/README.md` only when behavior or diagnostics changed
- Verify: `docs/superpowers/plans/2026-09-06-18-38-lightrsi-stable-reduction-replay-plan.md`

**Dependencies:**
- Tasks 1–6 completed with task-local proof; Task 7 remains deferred by approved plan decision.

**Authority:**
- Preauthorized local actions: update this plan's evidence, deviations, and deferrals; update maintained adapter documentation for implemented behavior.
- Stop for: failed required checks, stale branch/base, unrecorded scope expansion, or any unresolved data-loss risk.

**Steps:**
- [x] Step 1: Run Codex, Claude Code, OpenClaw, shared reduction, stabilizer, and host-adapter test suites plus all affected typechecks.
- [x] Step 2: Run representative proxy boundary tests for normal success, optional-field downgrade, client cancellation, partial stream, and no-retry-after-output behavior.
- [x] Step 3: Run `bench:hotspots` plus a representative end-to-end replay workload with identical Windows/Node inputs; record correctness and timing output separately.
- [x] Step 4: Inspect `git diff --check`, changed-file scope, generated surfaces, and persisted-schema compatibility.
- [x] Step 5: Reconcile every task checkbox, evidence field, approved Task 7 deferral, and residual risk; request independent implementation review after verification.

**Verification:**
- [x] `pnpm --dir components/adapters/codex test` — 444 passed
- Expected: all adapter tests pass.
- [x] `pnpm --dir components/adapters/claude-code test` — 203 passed
- Expected: Claude Code compatibility tests pass without shared read-state drift.
- [x] `pnpm --dir components/adapters/openclaw test` — 123 passed
- Expected: OpenClaw compatibility tests pass without shared read-state drift.
- [x] `pnpm --dir components/packages/features/reduction test` — 55 passed
- Expected: shared reduction tests pass.
- [x] `pnpm --dir components/packages/features/stabilizer test` — 53 passed
- Expected: stabilizer tests pass.
- [x] `pnpm --dir components/packages/foundation/host-adapter test` — 108 passed
- Expected: host-adapter tests pass.
- [x] `pnpm --dir components/adapters/codex run typecheck; pnpm --dir components/packages/features/reduction run typecheck; pnpm --dir components/packages/features/stabilizer run typecheck; pnpm --dir components/packages/foundation/host-adapter run typecheck`
- Expected: all typechecks pass.
- [x] `git diff --check`
- Expected: no whitespace errors.

**Exit Criteria:**
- `skill-verification-before-completion`: `verified` on 2026-09-06 after serial full-suite reruns, focused replay proof, rollback regression, benchmark, scope review, and independent implementation review.

## Verification

- `pnpm --dir components/adapters/codex test`
- `pnpm --dir components/packages/features/reduction test`
- `pnpm --dir components/packages/features/stabilizer test`
- `pnpm --dir components/packages/foundation/host-adapter test`
- `pnpm --dir components/adapters/codex run typecheck`
- `pnpm --dir components/packages/features/reduction run typecheck`
- `pnpm --dir components/packages/features/stabilizer run typecheck`
- `pnpm --dir components/packages/foundation/host-adapter run typecheck`
- `git diff --check`
- Fresh direct proxy evidence for normal success, optional-field downgrade, cancellation, partial stream, and no retry after downstream output.
- Fresh wire-level replay evidence for three turns, threshold crossing, later mutation/read, restart reload, case-sensitive paths, and explicit rebase exception.

## Verification Evidence

- Initial parallel suite run exposed two Codex rebase-smoke failures and one Claude daemon startup failure; serial focused reruns reproduced the Codex history bug, while the Claude failure did not reproduce.
- Fixed root cause: committed rebase input now takes precedence over per-request accepted input when rebuilding effective history; added restart/provider-smoke coverage.
- Fixed review finding: after-call pass failure restores nested `turnCtx` state; added regression coverage.
- Rejected case-folding review finding: case-sensitive resource identity is explicit contract and passes `applyBeforeCallReductionToPayload keeps case-sensitive read resources distinct`.
- Task 7 remains deferred; no reference marker or reread substitution was added.

## Completion Criteria

The plan is ready for completion verification when:

1. wire-level append-only replay invariant passes for unchanged reduction configuration
2. Codex query, threshold, read-trim, identity, and disclosure decisions are causal
3. shared reduction behavior remains compatible for Claude Code/OpenClaw
4. pass failure cannot leak partial nested mutation and timing is reported in existing reports
5. exact reread substitution is deferred and existing full reread behavior remains unchanged
6. reconsideration gates require immutable identity, content-hash verification, active recovery availability, protected recovery, conservative fallback, and equivalent-behavior evidence
7. changed-file/text/AST deltas remain explicitly deferred
8. all task-local and final verification commands pass
9. plan deviations, blockers, residual risks, and approved deferrals are recorded
10. `skill-verification-before-completion` returns `verified`
