---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: completed
layer: change
name: context-cleaner-agent-selection-follow-up
targets:
  - components/packages/features/cleaner/src/contracts.ts
  - components/packages/features/cleaner/src/orchestrator.ts
  - components/packages/features/cleaner/src/token-accounting.ts
  - components/packages/features/cleaner/src/recommendation.ts
  - components/packages/features/cleaner/src/control-service.ts
  - components/packages/features/eviction/src/task-update-mapper.ts
  - components/packages/features/eviction/src/types.ts
  - components/packages/foundation/history/src/registry.ts
  - components/packages/foundation/history/src/types.ts
  - components/packages/foundation/history/tests/registry.test.ts
  - components/adapters/codex/src/context-cleaner/bridge.ts
  - components/adapters/codex/src/context-rewrite/lifecycle-runner.ts
  - components/products/cli/src/clean.ts
  - components/packages/features/cleaner/tests
  - components/packages/features/eviction/tests
  - components/adapters/codex/tests
  - components/products/cli/tests
---

# Context Cleaner Agent Selection Follow-up

## Goal

Connect verified, scoped attribution evidence to one agent-controlled Cleaner
selection path after the existing dirty-history work is complete. Reuse the
existing registry, plan, claim, rewrite, and recovery contracts. Do not add a
second controller, task ledger, region lifecycle, or mutation engine.

The existing `2026-09-19-context-cleaner-safety-autonomy-follow-up-plan.md`
remains authoritative. Its Task 6 stays unchanged and deferred. This follow-up
uses current source contracts and verified findings; it does not require Task 6
to run first, claim Task 6 evidence, or expand, renumber, or edit Task 6.

## Verified Review Findings

### Findings still live
2. `processedTurnRanges` stores turn numbers only. No content, dependency, or
   history-revision evidence invalidates old coverage. `lastProcessedTurnSeq`
   remains independently writable. Source:
   `components/packages/foundation/history/src/registry.ts:35-59,221-263`.
3. Delta coverage is derived only from messages and tool records. A valid
   observation-only turn can produce an empty delta and fail the planner's
   `empty_delta_window` gate. Source:
   `components/packages/foundation/history/src/delta.ts:58-97` and
   `components/packages/features/eviction/src/lifecycle-planner.ts:282-284`.
4. Task spans use update arrival order. `firstTurnAbsId` stays at the first
   stored value and `lastTurnAbsId` uses the last appended supporting turn;
   delayed earlier evidence can create reversed bounds. Source:
   `components/packages/features/eviction/src/task-update-mapper.ts:111-119`.
5. Codex Cleaner analysis throws on any incomplete, deferred, unresolved, or
   reason-coded history instead of returning protected evidence. Source:
   `components/adapters/codex/src/context-cleaner/bridge.ts:202-207`.
6. No supported active-agent attribution submission exists. Cleaner accepts
   task IDs for selection, but task evidence enters through the estimator
   lifecycle; the CLI exposes no attribution update operation. Sources:
   `components/packages/features/eviction/src/lifecycle-planner.ts:263-299` and
   `components/products/cli/src/clean.ts:16-64`.
7. Empty dependency mappings currently have no explicit meaning. “No recorded
   dependency” and “dependency evidence unavailable” are indistinguishable.
   Selection must protect the latter.

### Findings already fixed; preserve, do not redesign

- `buildCodexLifecycleInput` now fails closed when duplicate or other unscoped
  semantic attribution errors coexist with a blocked turn; only explicitly
  scoped source, tool, and message reasons can preserve unrelated turns.
  Regression proof exists in
  `components/adapters/codex/tests/context-rewrite-lifecycle-input.test.ts`.
- Sole-owner execution validation already rejects shared items in
  `components/packages/features/cleaner/src/removal-safety.ts:31-34`; regression
  proof exists in `components/packages/features/cleaner/tests/removal-safety.test.ts:44-52`.
- Claim admission and cancellation already arbitrate under one plan lock;
  regression proof exists in
  `components/packages/features/cleaner/tests/clean-state-coordinator.test.ts:216-258`.
- Same-selection approval retries already replay existing receipts under the
  lock; proof exists in
  `components/packages/features/cleaner/tests/clean-state-coordinator.test.ts:156-214`.
- Recommendation inference is already optional. Missing providers fall back to
  deterministic `keep`/`protected` results, and approval checks `selectable`.
  Preserve `components/packages/features/cleaner/src/recommendation.ts:204-239`.

## Implementation Outcomes

### Scoped partial-history evidence

Cleaner analysis returns a faithful snapshot with scoped protection reasons.
Only occurrences with current ownership, completion, retention, dependency, and
revision evidence become selectable. Unscoped uncertainty fails closed.

### Agent-controlled attribution and selection

Active agent decisions enter the existing registry update path with adapter-
resolved occurrence references and fingerprints. Estimator and recommendation
providers remain optional assistance and cannot override accepted agent input.

### One execution contract

Short and long sessions use the same plan, approval, claim, rewrite, receipt,
recovery, and no-resend behavior. Existing safety and idempotency guarantees
remain unchanged.

## Non-Goals

- Editing or expanding old plan Task 6.
- Fixing dirty-history attribution, coverage freshness, observation-only
  watermarking, chronological spans, or live autonomy in this plan before Task 6
  is completed.
- Automatic eviction, periodic triggers, new registries, Cleaner MCP exposure,
  provider API changes, routing changes, or cache-policy redesign.
- Treating adapter inspection or empty dependency records as proof of semantic
  independence.

## Execution Approach

- Mode: `subagent-ready`
- Coordination: `git-tracked`
- Required skills: `skill-systematic-debugging`, `skill-test-driven-development`, `skill-backend-verification`, `skill-code-standards`, `skill-plan-document-reviewer`, `skill-verification-before-completion`
- Isolation: current LightRSI workspace
- Commit policy: no commits during execution
- Preauthorized local actions: inspect current source, modify follow-up scope, and run declared local checks; implementation stays within this plan's files and contracts
- User-approval actions: push, merge, publication, external provider calls, destructive recovery, or changing old plan Task 6
- Parallel ownership: none; contract, adapter, and CLI changes share one sequential lane
- Sequential fallback: complete Tasks 1–2 before Task 3; complete Task 3 before Task 4

## Coordination State

- Coordination owner: `single lead controller`
- Coordination schema: `2`
- Branch: `main`
- Base commit: `3ff8885`
- Expected workspace: `LightRSI main with follow-up implementation changes`
- Next action: branch finishing only; no commit, merge, push, or publication authorized
- Blockers: none

| Task | State | Workspace | Executor | Depends On | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Task 1 | `completed` | current | `codex` | current source contracts and verified findings | focused history/cleaner tests | scoped protection and fail-closed refusal pass |
| Task 2 | `completed` | current | `codex` | Task 1 | registry and attribution tests | CLI/control-service submission, CAS, provenance, replay/conflict tests pass |
| Task 3 | `completed` | current | `codex` | Task 2 | retention and dependency tests | missing/unsafe evidence protected; release/outgoing evidence selectable |
| Task 4 | `completed` | current | `codex` | Task 3 | synthetic integration and recovery tests | short/long-compatible local contract and retry/recovery suites pass |

## Task Breakdown

### Task 1: Expose partial history as protected Cleaner evidence

**Purpose:**
- Stop converting scoped history uncertainty into session-wide analysis failure.
- Keep unscoped ambiguity and invalid identity fail-closed.

**Task Function:**
- Contract correction and adapter integration.

**Template Profile:**
- Controller-selected: `normal`
- Selection basis: current effective-history and semantic-mapping contracts are sufficient; Task 6 remains deferred.

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: independent review of uncertainty boundaries and protected-item behavior.

**Specification Coverage:**
- Use one snapshot contract for complete and partial history.
- Return reason-coded protected evidence; never label uncertainty as clean.
- Preserve current stable IDs, fingerprints, system/developer protection, and
  provider-valid execution requirements.

**Required Skills:**
- `skill-test-driven-development`, `skill-backend-verification`, `skill-code-standards`

**Files And Symbols:**
- Inspect: `components/adapters/codex/src/context-history/effective-history.ts:buildCodexEffectiveHistoryView`
- Inspect: `components/adapters/codex/src/context-rewrite/semantic-mapping.ts:buildCodexRawSemanticTurns`
- Modify: `components/packages/features/cleaner/src/contracts.ts:ContextCleanSnapshot`
- Modify: `components/adapters/codex/src/context-cleaner/bridge.ts:readCleanSnapshot`
- Modify: `components/packages/features/cleaner/src/orchestrator.ts:analyzeContextCleanSession`
- Verify: `components/adapters/codex/tests/context-cleaner-bridge.test.ts` and
  `components/packages/features/cleaner/tests/orchestrator.test.ts`

**Dependencies:**
- Current effective-history and semantic-mapping contracts, plus focused regression tests. Do not resume old Task 6 from this plan.

**Authority:**
- Preauthorized local actions: modify Cleaner snapshot evidence and focused tests only.
- Stop for: missing scoped provenance, new registry/controller design, or any edit to old Task 6.

**Steps:**
- [x] Define the smallest evidence extension needed to carry history reason codes and protected occurrence IDs.
- [x] Return partial snapshots with protected/deferred items; reserve throws for identity, corruption, and unscoped uncertainty.
- [x] Map evidence into plan reasons and task `selectable` state without allowing recommendation output to weaken deterministic protection.
- [x] Add regressions for scoped dirty history, unscoped ambiguity, unresolved calls, and complete history.

**Verification:**
- [x] `pnpm --dir components/packages/features/cleaner exec node --import tsx --test --test-concurrency=1 tests/orchestrator.test.ts tests/recommendation.test.ts`
- [x] `pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/context-cleaner-bridge.test.ts`
- Expected: scoped uncertainty produces an analyzable protected plan; unscoped uncertainty refuses analysis.

**Exit Criteria:**
- Cleaner exposes useful partial evidence without treating incomplete history as complete.

### Task 2: Add one evidence-backed agent submission contract

**Purpose:**
- Let active agent decisions produce accepted task evidence without manual registry edits or a second ledger.

**Task Function:**
- Host-neutral input validation, registry CAS integration, and adapter binding.

**Template Profile:**
- Controller-selected: `normal`
- Selection basis: choose lowest profile that can safely handle identity, revision, and persistence boundaries.

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: verify caller authority cannot invent occurrence identity or bypass registry validation.

**Specification Coverage:**
- Agent submissions use task updates already consumed by
  `mapTaskUpdatesToRegistryPatch`, wrapped in one accepted request contract.
- Supported entry point: `ContextCleanerControlService.submitAttribution` and
  `lightrsi <host> clean --submit-attribution <submission-file>`.
- Minimum request contract: bound `hostId` and `sessionId`; caller/authority
  reference; stable `submissionId`; adapter-issued evidence references;
  `evidenceRevision`; per-task completion, unresolved-question, and retention
  decision; explicit invalidation conditions.
- Adapter resolves references to current occurrences and computes authoritative
  fingerprints before mapping the update.
- Registry version, session identity, lifecycle evidence, completion evidence,
  and unresolved-question rules remain mandatory.
- Identical submissions replay the accepted outcome. Changed or conflicting
  submissions fail closed without overwriting it.
- Estimator suggestions remain optional and cannot replace or widen an accepted
  agent decision.

**Required Skills:**
- `skill-test-driven-development`, `skill-backend-verification`, `skill-code-standards`

**Files And Symbols:**
- Inspect: `components/packages/features/eviction/src/task-update-mapper.ts:mapTaskUpdatesToRegistryPatch`
- Inspect: `components/packages/foundation/history/src/registry.ts:applySessionTaskRegistryPatch`
- Modify: `components/packages/features/eviction/src/types.ts:SemanticTaskUpdate`
- Modify: `components/packages/foundation/history/src/types.ts:TaskState` and the existing registry persistence path for minimal decision provenance.
- Modify: `components/packages/features/cleaner/src/contracts.ts` for the submission request type.
- Modify: `components/packages/features/cleaner/src/control-service.ts:ContextCleanerControlService` and
  `components/products/cli/src/clean.ts` for the required entry point.
- Modify: `components/adapters/codex/src/context-rewrite/lifecycle-runner.ts:runCodexLifecyclePlanner`
- Verify: `components/packages/features/eviction/tests/task-update-mapper.test.ts`, `components/packages/foundation/history/tests/registry.test.ts`, and adapter lifecycle tests.

**Dependencies:**
- Task 1 complete.

**Authority:**
- Preauthorized local actions: add one validated submission path using existing registry persistence and CAS.
- Stop for: caller-supplied fingerprints, unbound session IDs, direct registry file writes, or a second task ledger.

**Steps:**
- [x] Define the typed submission request and `--submit-attribution <submission-file>` CLI surface before implementation.
- [x] Validate caller/session binding, submission ID, evidence revision, and adapter-issued references.
- [x] Resolve references through the adapter, compute fingerprints, and reject missing, stale, shared, or cross-session occurrences.
- [x] Persist minimal provenance in the existing task registry and reuse `mapTaskUpdatesToRegistryPatch` plus registry version checks.
- [x] Make identical submissions idempotent and conflicting submissions fail closed.
- [x] Add tests with estimator disabled, below batch threshold, recommendation provider absent, stale evidence, and repeated submission.

**Verification:**
- [x] `pnpm --dir components/packages/features/eviction exec node --import tsx --test --test-concurrency=1 tests/task-update-mapper.test.ts`
- [x] `pnpm --dir components/packages/foundation/history exec node --import tsx --test --test-concurrency=1 tests/registry.test.ts`
- [x] `pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/context-rewrite-lifecycle-runtime.test.ts`
- Expected: accepted agent evidence persists once with provenance; identical retries replay; invalid, stale, or conflicting evidence leaves accepted state unchanged.

**Exit Criteria:**
- Active agent can submit evidence-backed attribution through one validated path; estimator remains optional assistance.

### Task 3: Make retention and dependency evidence explicit

**Purpose:**
- Distinguish agent-authorized retention decisions from missing dependency evidence.

**Task Function:**
- Contract and deterministic eligibility correction.

**Template Profile:**
- Controller-selected: `normal`
- Selection basis: small schema change with direct safety consequences.

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: verify unknown dependency state never becomes selectable.

**Specification Coverage:**
- The active agent owns semantic usefulness and retention choice under Project OS
  authority. LightRSI owns structural validation and execution safety.
- Persist one retention decision with: decision maker, covered task/item/evidence
  references, evidence revision, and invalidation conditions.
- Shared ownership remains protected.
- Dependency direction matters: retained active/dependent work that requires a
  removal target blocks cleanup; a removed task's use of retained resources does
  not automatically block it.
- Unknown retention or dependency evidence remains protected and reason-coded.
- Do not infer semantic independence from complete adapter inspection or an empty
  relation map.

**Required Skills:**
- `skill-test-driven-development`, `skill-backend-verification`, `skill-code-standards`

**Files And Symbols:**
- Inspect: `components/packages/features/cleaner/src/token-accounting.ts:buildContextCleanBreakdown`
- Inspect: `components/packages/features/cleaner/src/removal-safety.ts:evaluateContextCleanRemoval`
- Modify: `components/packages/features/cleaner/src/contracts.ts:ContextCleanTaskBreakdown` and retention evidence types
- Modify: `components/packages/features/cleaner/src/token-accounting.ts:buildContextCleanBreakdown`
- Modify: `components/packages/foundation/history/src/types.ts:TaskState` only for the provenance already defined in Task 2.
- Verify: Cleaner accounting, removal-safety, and contract tests.

**Dependencies:**
- Task 2 provides adapter-bound dependency evidence.

**Authority:**
- Preauthorized local actions: add minimum retention provenance and dependency-direction evidence using existing task state.
- Stop for: new dependency graph storage, semantic inference without evidence, or selection based on recommendation alone.

**Steps:**
- [x] Add explicit retention provenance and dependency-direction evidence to the existing task breakdown.
- [x] Protect unknown retention/dependency evidence and shared ownership with concrete reason codes.
- [x] Allow outgoing use of retained resources when no retained work depends on the target and all other checks pass.
- [x] Add tests for retained-active-to-target dependency, target-to-retained-resource use, shared ownership, missing evidence, and recommendation-provider absence.

**Verification:**
- [x] `pnpm --dir components/packages/features/cleaner exec node --import tsx --test --test-concurrency=1 tests/token-accounting.test.ts tests/removal-safety.test.ts tests/recommendation.test.ts`
- Expected: only agent-authorized, structurally valid tasks remain selectable; provider absence does not change deterministic safety.

**Exit Criteria:**
- Cleaner never treats absent dependency records as proof of independence.

### Task 4: Prove one short/long selection and recovery contract

**Purpose:**
- Prove agent selection uses existing execution, claim, receipt, rewrite, and recovery paths.

**Task Function:**
- End-to-end backend verification and CLI contract proof.

**Template Profile:**
- Controller-selected: `normal`
- Selection basis: integration risk spans adapter, Cleaner, and CLI boundaries.

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: independent boundary and failure-path review.

**Specification Coverage:**
- One short session and one long session use identical selection and validation.
- Successful provider dispatch with local persistence failure is reconciled, not resent.
- Uncertain dispatch remains `recovery_required`.
- Same-selection retries replay; different selections conflict.
- Live autonomy and dirty-history pilot remain owned by old Task 6 and are not
  claimed by this task.

**Required Skills:**
- `skill-backend-verification`, `skill-test-driven-development`, `skill-verification-before-completion`

**Files And Symbols:**
- Inspect: `components/products/cli/src/clean.ts:handleCleanCommand`
- Inspect: existing Cleaner host execution and Codex rewrite tests.
- Modify: `components/products/cli/src/clean.ts` only if the validated attribution/selection command needs a minimal surface.
- Verify: CLI, Cleaner runtime, Codex bridge, rebase pipeline, and receipt recovery tests.

**Dependencies:**
- Tasks 1–3 complete.

**Authority:**
- Preauthorized local actions: run synthetic and local integration checks through existing test harnesses.
- Stop for: live provider mutation, automatic resend, production pilot activation, or old Task 6 scope expansion.

**Steps:**
- [x] Exercise the required submission command, then task selection, with estimator disabled and recommendation provider absent.
- [x] Exercise a short session below the estimator batch threshold and a long synthetic session with protected uncertainty.
- [x] Exercise restart, local persistence failure, successful dispatch, uncertain dispatch, conflicting estimator evidence, and retry outcomes.
- [x] Keep synthetic proof separate from live provider validation; record one missing capability instead of weakening a gate.

**Verification:**
- [x] Focused Cleaner, eviction, Codex, and CLI tests.
- [x] `pnpm --dir components/packages/features/cleaner run typecheck`
- [x] `pnpm --dir components/packages/features/eviction run typecheck`
- [x] `pnpm --dir components/adapters/codex run typecheck`
- [x] `pnpm --dir components/products/cli run typecheck`
- Expected: one exact selection contract, no duplicate mutation, no automatic resend, protected uncertainty retained.

**Exit Criteria:**
- Short and long synthetic sessions prove the same validated agent-selection and recovery behavior. No live autonomy claim is made.

## Verification

### Local synthetic and contract proof

Run after Tasks 1–4 are unblocked and complete:

```text
pnpm --dir components/packages/features/cleaner test
pnpm --dir components/packages/features/cleaner run typecheck
pnpm --dir components/packages/features/eviction test
pnpm --dir components/packages/features/eviction run typecheck
pnpm --dir components/adapters/codex test
pnpm --dir components/adapters/codex run typecheck
pnpm --dir components/products/cli test
pnpm --dir components/products/cli run typecheck
git diff --check
```

These checks prove this follow-up's local contract only. They do not prove old
Task 6's live dirty-history or provider-cleanup gates.

### Live validation

Not authorized in this follow-up. Old Task 6 owns live provider execution,
restart/recovery evidence, and the autonomy pilot. Do not mark this plan or old
Task 6 complete from synthetic checks alone.

Run `skill-verification-before-completion` before changing this plan's status.

## Completion Criteria

1. This follow-up completes against current source contracts without resuming or expanding old plan Task 6; Task 6 remains deferred.
2. Scoped partial history remains analyzable, while unscoped uncertainty fails closed.
3. Active agent attribution uses one supported CLI/control-service contract, adapter-resolved evidence, minimal provenance, and existing registry CAS.
4. Estimator and recommendation providers remain optional assistance; later contradictory evidence invalidates eligibility without silently overwriting accepted provenance.
5. Retention authority records who decided, what evidence it covered, and what invalidates it; dependency direction is preserved.
6. Dependency unknown is explicit and never selectable.
7. Existing sole-owner, claim/cancel, approval-retry, no-resend, and recovery
   guarantees remain green.
8. Short and long synthetic sessions use one selection and execution contract.
9. Live autonomy and dirty-history completion remain unclaimed here.
10. Fresh final verification returns `verified` before status changes.

## Deferred Work

Dirty full-history attribution correctness, coverage freshness, observation-only
watermarking, chronological task spans, live provider cleanup, and the gated
autonomy pilot remain in old plan Task 6. Do not duplicate or expand that task
from this plan.
