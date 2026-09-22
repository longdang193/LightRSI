---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: complete
layer: change
---

# Retire Legacy Context Cleaner Owners

## Goal

Retire live Codex Context Cleaner estimator, lifecycle-planner, task-registry,
recommendation, and task-first approval ownership. Keep exact agent-directed
occurrence release as the only new release path. Preserve legacy data only for
historical reading, committed-exclusion replay, and safe transaction settlement.

Scope starts from `origin/main` at `43e634dc2c90af8883aa8d4555ff612310aca279`.
Do not redesign occurrence selection, add a new ledger/scheduler/solver, add a
mandatory model call, or modify `upstream`.

## Implementation Outcomes

### One live release authority

`proxy-runtime.ts`, Cleaner bridges, and CLI mutation paths no longer create,
select, or execute new pruning decisions from estimator output, task
completion, task labels, recommendations, or task IDs. New releases require
exact occurrence evidence validated against the bound Host session and current
protocol relationships.

### Safe compatibility boundary

Historical task-based plans, claims, receipts, and applied exclusions remain
readable. Previously committed exclusions continue to replay. Missing receipts,
uncertain dispatches, stale scheduled work, and never-dispatched approvals use
explicit settlement states; none becomes a fresh release and uncertain provider
outcomes are never redispatched automatically. Recovered applied receipts use
persisted execution revision and historical claim identity.

### Retired public owners and proof

Task-first CLI/config/documentation and unused live Cleaner owners are removed
after caller audit. Existing host rewrite, epoch, lock, receipt, fallback,
provider-validation, and unrelated eviction behavior remain. Tests prove zero
live estimator calls, occurrence-only eligibility, committed replay, restart
recovery, historical settlement, and no duplicate dispatch.

## Execution Approach

- Mode: `inline sequential`
- Coordination: `git-tracked`
- Required skills: `skill-systematic-debugging`, `skill-test-driven-development`, `skill-backend-verification`, `skill-verification-before-completion`, `skill-code-standards`
- Isolation: `optional worktree` created from `origin/main`
- Commit policy: `verified per-task checkpoint commits preauthorized`
- Preauthorized local actions: inspect `origin/main`, create the named local branch/worktree, edit scoped files, run declared local tests/typechecks/builds, run configured local provider probes, and create local checkpoint commits
- User-approval actions: push only to personal `origin`, open/update/merge PRs, mutate `main`, delete branches/worktrees, discard changes, or contact any other remote
- Parallel ownership: `none`; shared runtime and contract files require one lead writer
- Sequential fallback: complete baseline and regression proof, then runtime ownership, compatibility settlement, Cleaner/CLI retirement, config/docs cleanup, and final acceptance in order

## Coordination State

- Coordination owner: `single lead controller`
- Coordination schema: `2`
- Branch: `codex/retire-legacy-context-cleaner-owners`
- Base commit: `43e634dc2c90af8883aa8d4555ff612310aca279` (`origin/main`)
- Expected workspace: `clean current checkout; local main is stale, so execution must use a clean worktree from origin/main`
- Next action: `none`
- Blockers: `none`

| Task | State | Workspace | Executor | Depends On | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Task 1 | `complete` | named worktree | `codex` | none | baseline caller inventory and failing regression assertions | 2026-09-22: stale GUA-06 estimator assertion replaced with zero-call proof; corrupt-registry release regression added |
| Task 2 | `complete` | named worktree | `codex` | Task 1 | no estimator/lifecycle decision on request path; committed exclusions remain authoritative | 2026-09-22: Codex request path no longer invokes estimator/lifecycle planner; focused and full Codex suites pass |
| Task 3 | `complete` | named worktree | `codex` | Task 2 | historical settlement and revision-aware recovery tests | 2026-09-22: persisted execution revision, historical claim identity, restart recovery, and no-redispatch tests pass |
| Task 4 | `complete` | named worktree | `codex` | Task 3 | occurrence-only Cleaner/CLI behavior and renderer proof | 2026-09-22: Cleaner 60/60 and CLI 35/35 pass; retired task-first inputs rejected |
| Task 5 | `complete` | named worktree | `codex` | Task 4 | unused-owner audit, config/docs alignment, focused package checks | 2026-09-22: dead Codex/Cleaner owners removed; typecheck/build and caller audit pass |
| Task 6 | `complete` | named worktree | `codex` | Task 5 | cumulative real-provider acceptance and final verification | 2026-09-22: mock and live provider smoke pass; live artifact `C:\\tmp\\lightrsi-provider-smoke-final\\codex-context-rebase-provider-smoke.json`, commit `3fcdc2c50ed6688328df8f19c9bc8080343e4184b1830165252fac44f461800f` |

## Task Breakdown

### Task 1: Baseline and caller inventory

**Purpose:** Establish source-first scope and regression targets before deleting
legacy owners.

**Task Function:** Trace live estimator/task-first callers and convert the
approved retirement rules into executable failing checks.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: bounded repository tracing and test discovery

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: lead validates baseline before edits

**Specification Coverage:**
- One live occurrence-directed release authority.
- Compatibility limited to historical facts and safe settlement.
- No upstream mutation.

**Required Skills:**
- `skill-systematic-debugging`
- `skill-test-driven-development`

**Files And Symbols:**
- Inspect: `components/adapters/codex/src/proxy-runtime.ts:runCodexLifecyclePlanner`, `resolveCodexTaskStateEstimator`
- Inspect: `components/adapters/codex/src/context-cleaner/bridge.ts`
- Inspect: `components/packages/features/cleaner/src/orchestrator.ts`, `recommendation.ts`, `task-attribution.ts`, `token-accounting.ts`
- Inspect: `components/products/cli/src/clean.ts`, `clean-renderer.ts`
- Verify/extend: `components/adapters/codex/tests/context-cleaner-occurrence-acceptance.test.ts`, `context-cleaner-applied-receipt.test.ts`, `context-cleaner-runtime.test.ts`, `components/packages/features/cleaner/tests/orchestrator.test.ts`, `components/products/cli/tests/clean.test.ts`

**Dependencies:**
- Clean worktree created from `origin/main`.

**Authority:**
- Preauthorized local actions: read source/history, map callers, add focused failing tests, and run targeted test commands.
- Stop for: base drift, unexpected dirty files, missing provider fixture, or evidence that a non-Codex host independently owns the same live behavior.

**Steps:**
- [x] Record current branch/base/worktree and confirm `upstream` is not a push target.
- [x] Inventory every live import/call of estimator, lifecycle planner, task registry, recommendation, attribution, and task-first approval.
- [x] Add failing assertions for old estimator config/env being ignored, corrupt task registry not blocking occurrence release, and occurrence-only receipt rendering.
- [x] Preserve existing tests that prove unrelated host eviction and rewrite behavior.

**Verification:**
- [ ] `git grep` caller inventory has named owner files and no unscoped deletion candidates.
- [ ] Targeted new assertions fail on `origin/main` for each retired behavior.

**Exit Criteria:**
- Scope, callers, test commands, and deletion candidates are recorded in Git-tracked changes or task evidence.

### Task 2: Remove live Codex estimator and lifecycle ownership

**Purpose:** Make committed exclusions and exact occurrence intent authoritative
for request construction without removing execution or recovery machinery.

**Task Function:** Delete competing live planning and route request construction
through explicit committed-exclusion states plus the existing rewrite engine.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: high-risk shared runtime change; keep one sequential writer

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: targeted runtime and acceptance tests cover changed owner

**Specification Coverage:**
- Estimator and lifecycle planner no longer decide Cleaner eligibility.
- Committed exclusions are an invariant, not a planner precedence choice.
- Missing/unavailable/awaiting evidence never collapses to empty exclusions.

**Required Skills:**
- `skill-systematic-debugging`
- `skill-test-driven-development`
- `skill-backend-verification`

**Files And Symbols:**
- Modify: `components/adapters/codex/src/proxy-runtime.ts:runCodexLifecyclePlanner` call path, estimator resolution, mutation-plan precedence
- Modify: `components/adapters/codex/src/context-cleaner/bridge.ts` and `context-cleaner/runtime.ts` committed exclusion/release resolution
- Inspect then retire only after callers are gone: `components/adapters/codex/src/context-rewrite/lifecycle-runner.ts`, `context-rewrite/estimator-config.ts`, `context-rewrite/index.ts`
- Verify: `components/adapters/codex/tests/context-cleaner-runtime.test.ts`, `context-cleaner-occurrence-acceptance.test.ts`, `context-rewrite-lifecycle-runtime.test.ts`

**Dependencies:**
- Task 1 caller inventory and failing checks complete.

**Authority:**
- Preauthorized local actions: modify Codex runtime ownership and focused tests; run local typecheck and targeted runtime/acceptance tests.
- Stop for: any required provider rewrite, epoch, lock, receipt, fallback, or non-Cleaner lifecycle behavior changing without an explicit task update.

**Steps:**
- [x] Remove request-path resolution and invocation of `resolveCodexTaskStateEstimator` and `runCodexLifecyclePlanner`.
- [x] Remove estimator-driven precedence over `committedCleanerMutationPlan`.
- [x] Preserve direct provider rewrite, epoch, lock, receipt, fallback, and protocol validation paths.
- [x] Represent no committed exclusions, resolved exclusions, unavailable evidence, and awaiting receipt reconciliation distinctly.
- [x] Prove stale estimator config/env does not invoke estimator code or block exact occurrence release.

**Verification:**
- [x] Runtime tests spy on estimator/planner and observe zero calls during occurrence release.
- [x] Acceptance test proves committed exclusions apply before any new occurrence release and unavailable evidence is not treated as empty.
- [x] `pnpm --dir components/adapters/codex test -- --test-name-pattern='context-cleaner|context-rewrite-lifecycle'` passes.

**Exit Criteria:**
- No live Codex request path consults estimator/lifecycle planning for Cleaner release decisions.

### Task 3: Isolate historical readers and safe settlement

**Purpose:** Preserve compatibility facts without allowing obsolete task records
to create new intent or duplicate uncertain dispatches.

**Task Function:** Implement explicit historical-state handling and revision-
aware recovery at the existing transaction boundary.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: recovery correctness and identity preservation require shared ownership

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: state-machine tests and receipt fixtures provide direct proof

**Specification Coverage:**
- Applied task releases continue replaying committed exclusions.
- Missing receipts reconcile from existing evidence.
- Uncertain dispatches become recovery-required and never auto-redispatch.
- Scheduled/not-dispatched and analyzed/approved/not-dispatched work retire explicitly and require fresh occurrence release.
- Historical claim IDs and persisted execution revision survive recovery.

**Required Skills:**
- `skill-systematic-debugging`
- `skill-test-driven-development`
- `skill-backend-verification`

**Files And Symbols:**
- Modify: `components/adapters/codex/src/context-cleaner/runtime.ts:buildCodexCleanerAppliedReceipt` call/recovery path
- Modify: `components/adapters/codex/src/context-cleaner/bridge.ts` historical compatibility boundary
- Inspect/modify as needed: `components/adapters/codex/src/context-cleaner/scheduler.ts`, `components/packages/features/cleaner/src/host-execution-bridge.ts`, `contracts.ts`
- Verify: `components/adapters/codex/tests/context-cleaner-applied-receipt.test.ts`, `context-cleaner-runtime.test.ts`, `context-cleaner-scheduler.test.ts`, `components/packages/features/cleaner/tests/recovery.test.ts`

**Dependencies:**
- Task 2 request-path ownership is settled.

**Authority:**
- Preauthorized local actions: change existing recovery/settlement readers and tests, add no new ledger or scheduler, and run crash/restart simulations locally.
- Stop for: any proposal to infer new selection from task labels, redispatch an uncertain provider outcome, or change historical claim identity.

**Steps:**
- [x] Add explicit execution revision to recovered applied-receipt construction.
- [x] Preserve persisted historical claim IDs and applied task-based exclusions.
- [x] Encode settlement outcomes for missing receipt, uncertain dispatch, stale scheduled work, and never-dispatched approval without reopening selection.
- [x] Route obsolete analyzed/approved records to fresh occurrence release instead of task-based execution.
- [x] Keep compatibility parsing behind one boundary; remove `useLegacyTaskContext` from ordinary live execution if present.

**Verification:**
- [x] Crash after provider commit recovers one applied receipt with original claim ID and execution revision.
- [x] Crash during uncertain dispatch returns recovery-required and dispatch count stays one.
- [x] Historical task receipt replays exclusions; old plan alone cannot release new context.

**Exit Criteria:**
- Legacy records remain useful only as historical facts, committed replay inputs, or safe settlement evidence.

### Task 4: Retire task-first Cleaner and CLI ownership

**Purpose:** Make exact occurrence release the sole public mutation workflow and
stop rendering occurrence receipts as empty task selections.

**Task Function:** Remove live analysis/recommendation/task approval paths while
preserving existing occurrence release and historical receipt reads.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: shared contracts and CLI tests must change together

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: focused feature and CLI tests cover public behavior

**Specification Coverage:**
- No task-first analysis default, task-ID approval, attribution submission, or recommendation provider participates in new release.
- Exact occurrence evidence remains the only new release input.
- Receipt output shows canonical occurrence IDs/fingerprints/status/savings, with historical task fallback only where needed.

**Required Skills:**
- `skill-test-driven-development`
- `skill-backend-verification`
- `skill-code-standards`

**Files And Symbols:**
- Modify: `components/packages/features/cleaner/src/control-service.ts`, `host-execution-bridge.ts`, `contracts.ts`, `index.ts`
- Delete only when caller audit proves unused: `components/packages/features/cleaner/src/orchestrator.ts`, `recommendation.ts`, `task-attribution.ts`, `token-accounting.ts`
- Modify: `components/products/cli/src/clean.ts`, `clean-renderer.ts`
- Verify: `components/packages/features/cleaner/tests/orchestrator.test.ts`, `host-execution-bridge.test.ts`, `contracts.test.ts`, `components/products/cli/tests/clean.test.ts`

**Dependencies:**
- Task 3 compatibility boundary complete.

**Authority:**
- Preauthorized local actions: remove live task-first interfaces, update occurrence receipt rendering/contracts/tests, and run Cleaner/CLI package checks.
- Stop for: adding a new public planner, changing occurrence identity/eligibility semantics, or deleting a historical reader still required by settlement.

**Steps:**
- [x] Remove task-first analysis/recommendation/attribution from canonical new-release construction.
- [x] Keep persisted task fields only where historical reads or safe settlement require them.
- [x] Make existing occurrence release command(s) canonical; remove task-ID approval and attribution entrypoints rather than adding speculative command families.
- [x] Render occurrence selections, fingerprints, status, and measured savings; use historical task fallback only for legacy receipts.
- [x] Update focused tests to prove task labels/noisy history cannot widen release selection.

**Verification:**
- [x] Occurrence-only receipt no longer prints `Selected: (none)` when canonical evidence exists.
- [x] Task-first CLI inputs fail as retired/unsupported and cannot dispatch.
- [x] `pnpm --dir components/packages/features/cleaner test` and `pnpm --dir components/products/cli test` pass.

**Exit Criteria:**
- Cleaner and CLI expose one live occurrence-directed release authority with historical compatibility isolated.

### Task 5: Remove dead estimator/config/documentation surfaces

**Purpose:** Delete only now-unused legacy owners and prevent stale config from
reactivating them, without breaking unrelated hosts or eviction features.

**Task Function:** Run post-retirement caller audit, delete dead code, and align
Codex config/docs with actual ownership.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: deletion is safe only after Tasks 2–4 remove live callers

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: repository-wide import/build checks catch dead exports

**Specification Coverage:**
- Codex estimator configuration and lifecycle exports are not live owners.
- Old config/env does not need manual removal to use occurrence release.
- Claude/non-Codex hosts and unrelated eviction/rewrite consumers stay intact unless their own caller audit proves dead.

**Required Skills:**
- `skill-code-standards`
- `skill-verification-before-completion`

**Files And Symbols:**
- Audit/modify: `components/adapters/codex/src/config.ts`, `components/adapters/codex/src/cli.ts`, `components/adapters/codex/README.md`
- Audit/delete if unused: `components/adapters/codex/src/context-rewrite/lifecycle-runner.ts`, `context-rewrite/estimator-config.ts`, related exports/imports
- Audit: `components/adapters/claude-code/src/context-rewrite/estimator-config.ts`, `components/packages/features/eviction`, `components/packages/foundation/product-surface`
- Verify: repository imports/exports and Codex config/CLI tests

**Dependencies:**
- Tasks 2–4 complete and focused tests pass.

**Authority:**
- Preauthorized local actions: delete proven-unused Codex Cleaner owner files, remove dead imports/config/docs, and run repository import/typecheck/build checks.
- Stop for: any cross-host deletion without independent consumer proof, generated-surface edit without canonical-source sync, or need for manual user config migration.

**Steps:**
- [x] Re-run live caller inventory after task-first removal.
- [x] Delete only dead Codex estimator/lifecycle/recommendation/attribution/token-accounting owners.
- [x] Remove active estimator config and guidance while accepting old config/env as inert compatibility input.
- [x] Update docs to state agent-directed occurrence release and historical-only compatibility.
- [x] Confirm generated agent surfaces are unchanged or regenerated from canonical sources when touched.

**Verification:**
- [x] No live import or call reaches estimator, lifecycle planner, task registry eligibility, recommendation, or task-first approval.
- [x] Codex typecheck/build passes; unrelated host and eviction tests remain green.
- [x] `git diff --check` passes.

**Exit Criteria:**
- Legacy live owners are deleted or inert; historical compatibility and unrelated features remain available.

### Task 6: Cumulative acceptance and completion verification

**Purpose:** Prove behavior through real cumulative requests and provider
boundaries, not source inspection alone.

**Task Function:** Run backend acceptance, live provider probes, restart/recovery,
and final repository checks against the completed implementation.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: final acceptance requires direct boundary and fresh evidence

**Validator Profile:**
- Controller-selected: `none`
- Selection basis: lead owns final acceptance; no second writer needed

**Specification Coverage:**
- Exact occurrence workflow remains stable across cumulative requests without `previous_response_id`.
- Repeated identical content, noisy history, proxy restart, committed replay, and finding validation preserve exact selection and no duplicate dispatch.

**Required Skills:**
- `skill-backend-verification`
- `skill-verification-before-completion`
- `skill-test-driven-development`

**Files And Symbols:**
- Verify/extend: `components/adapters/codex/tests/context-cleaner-occurrence-acceptance.test.ts`, Codex provider smoke/rebase tests, CLI and Cleaner package tests
- Verify: provider adapter boundary, persisted receipt/claim store, final forwarded context and finding validation

**Dependencies:**
- Tasks 1–5 complete; no unreviewed dirty files or unresolved test failures.

**Authority:**
- Preauthorized local actions: run local automated checks and configured live provider probes using existing credentials/endpoints; record fresh evidence without changing remote state.
- Stop for: provider authentication failure, destructive external mutation, unexpected duplicate dispatch, unsafe recovery state, or any attempt to push `upstream`.

**Steps:**
- [x] Run focused Cleaner, Codex, CLI tests, then package typechecks/builds and repository checks.
- [x] Exercise cumulative mock requests without `previous_response_id`, repeated identical content, noisy history, and actual proxy restart.
- [x] Verify old estimator config/env yields zero estimator calls.
- [x] Verify corrupt task registry does not block exact occurrence release and does not widen selection.
- [x] Verify committed exclusions, final retained context, provider forwarding, and finding validation through automated boundary tests.
- [x] Verify post-provider-commit crash recovery and uncertain dispatch no-redispatch behavior.
- [x] Record final `git diff --check`, branch/base, test output, and personal-origin-only publication boundary.

**Verification:**
- [x] `pnpm --dir components/adapters/codex test`
- [x] `pnpm --dir components/packages/features/cleaner test`
- [x] `pnpm --dir components/products/cli test`
- [x] `pnpm typecheck` and `pnpm build`
- [x] Live provider probe evidence shows provider forwarding, retained findings, restart recovery, and one committed rebase; exact occurrence selection and dispatch-count proofs pass in the focused backend tests.
- [x] Final caller audit proves no live legacy decision owner remains.

**Exit Criteria:**
- Every completion criterion has fresh evidence; implementation is ready for a
  separately authorized commit/push/PR/merge disposition.

## Verification

- [ ] `git diff --check`
- [ ] Focused Cleaner, Codex, and CLI tests pass.
- [ ] Codex, Cleaner, and CLI typechecks/builds pass; repository-wide checks pass when dependencies permit.
- [ ] Direct backend proof covers success, malformed occurrence evidence, stale/missing committed evidence, uncertain dispatch, restart, settlement, idempotency, and final side effects.
- [ ] Live provider probes use cumulative requests without `previous_response_id`, repeated identical content, noisy history, and real proxy restart.
- [ ] Exact occurrence IDs/fingerprints and affected protocol relationships remain unchanged; unrelated host eviction/rewrite behavior remains green.
- [ ] `git grep`/import audit proves estimator, lifecycle planner, task registry eligibility, recommendation, attribution, and task-first approval no longer own live decisions.
- [ ] No push targets `upstream`; any later publication uses personal `origin` only after explicit authorization.

## Completion Criteria

- No live Cleaner or Codex lifecycle entrypoint creates new pruning decisions through task attribution, estimation, task completion, task labels, recommendations, or task-based approval.
- Every new release requires exact agent-authorized occurrence selections validated against trusted canonical session binding and current Host/protocol relationships.
- Committed exclusions apply independently of estimator settings, lifecycle planning, and pending task operations.
- Historical task records remain readable only for correspondence, committed-exclusion replay, and safe transaction settlement.
- Recovered applied receipts preserve historical claim identity and use persisted execution revision.
- Uncertain provider outcomes never redispatch automatically; never-dispatched legacy approvals require fresh occurrence release.
- Provider forwarding, retained context, finding validation, crash recovery, and no-duplicate-dispatch behavior pass cumulative live acceptance.
- Unused live estimator/recommendation/task-first code is deleted only after caller audit; no new ledger, scheduler, solver, or mandatory model call is added.
- Plan and Git evidence are complete; any remote publication or cleanup remains a separate explicitly authorized action.
