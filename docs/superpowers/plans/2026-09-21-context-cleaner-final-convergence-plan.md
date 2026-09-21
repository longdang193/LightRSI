---
artifact_type: plan
contract_version: "1"
template_id: implementation-plan
status: completed
layer: change
name: context-cleaner-final-convergence
targets:
  - components/packages/features/cleaner/src/contracts.ts
  - components/packages/features/cleaner/src/removal-safety.ts
  - components/packages/features/cleaner/src/orchestrator.ts
  - components/packages/features/cleaner/src/control-service.ts
  - components/packages/features/cleaner/src/host-execution-bridge.ts
  - components/packages/features/cleaner/src/clean-claim-store.ts
  - components/packages/features/cleaner/src/clean-receipt-store.ts
  - components/packages/features/cleaner/src/clean-store-support.ts
  - components/adapters/codex/src/context-cleaner/runtime.ts
  - components/adapters/codex/src/context-cleaner/applied-receipt.ts
  - components/adapters/codex/src/context-cleaner/bridge.ts
  - components/adapters/codex/src/context-rewrite/rebase-epoch.ts
  - components/adapters/codex/src/context-rewrite/rebase-request.ts
  - components/adapters/codex/src/context-rewrite/fallback.ts
  - components/adapters/codex/src/context-rewrite/provider-continuation.ts
  - components/adapters/codex/src/context-history/effective-history.ts
  - components/adapters/codex/src/proxy-runtime.ts
  - components/products/cli/src/clean.ts
  - components/products/cli/src/hosts/cleaner.ts
  - components/products/cli/src/clean-renderer.ts
  - components/packages/features/cleaner/tests
  - components/adapters/codex/tests
  - components/products/cli/tests
---

# Context Cleaner Final Convergence

## Goal

Make agent-directed occurrence pruning the sole live Cleaner decision and
execution path while preserving Host history, transactions, claims, locks,
epochs, receipts, and recovery.

## Review Result

The two reviews of commit `379aa85` agree: format-aware occurrence compilation
improved, but agent-directed pruning is not yet the sole end-to-end workflow.
Remaining defects are integration and ownership defects.

Verified findings:

1. Committed exclusions are not proven to reapply on cumulative continuation or restart.
2. Committed-epoch recovery can lose persisted `occurrenceSelections` before dispatch.
3. Current dirty workspace contains cumulative `inputFormat` wiring fixes; verify, do not duplicate.
4. Agent evidence and legacy task evaluation remain competing safety owners.
5. Analysis, execution, and result revisions are conflated.
6. Explicit mutation lacks trusted Host/session binding at its execution boundary.
7. CLI remains task-oriented and file-oriented.
8. Task and attribution fields still influence downstream execution.
9. Content/ordinal matching is not durable identity; broad deferred gates can block unrelated pruning.
10. Estimation and task analysis remain explicit-release prerequisites without safety need.

Live-provider and performance behavior were not established. Keep both separate.

## Scope

Make agent-directed occurrence pruning the only canonical Cleaner decision and
execution path. Preserve Host history, journal, claims, locks, epochs, receipts,
transactions, provider validation, and recovery. Add no registry, removal ledger,
background service, controller, or duplicate transaction store.

Task and attribution data remain compatibility readers. Translate old inputs once
into occurrence selections and protection evidence; never run a second
eligibility algorithm.

Cumulative pruning must not require `previous_response_id`, encrypted-reasoning
replay, or response-chain reconstruction. Keep replay checks only for actual
response-chain reconstruction. Keep stable response IDs where identity or
recovery requires them.

Do not edit or expand
`docs/superpowers/plans/2026-09-19-context-cleaner-safety-autonomy-follow-up-plan.md`.
The prior plan's Task 6 remains deferred and untouched.

Do not commit, push, merge, alter credentials, or run real-provider/performance
probes without separate authorization.

## Baseline Reconciliation

Start from LightRSI `main` at `379aa85`; preserve unrelated working-tree changes.
Treat current dirty changes as baseline: shared cumulative `inputFormat` wiring,
input-only prefix support, response-item filtering, duplicate ambiguity rejection,
and their focused regressions.

Re-run focused proof before modifying those files. Remove
`components/adapters/codex/scripts/live-cumulative-probe.ts` before completion
unless an approved task promotes it to a maintained test.

## Design Invariants

- Host history owns what exists; persisted release evidence owns pruning intent.
- One occurrence evaluator owns approval and execution safety.
- Stable Host/journal identity selects removals; content alone never does.
- Ambiguity, missing protection proof, missing trusted binding, or unsupported
  mutation preserves context and emits diagnostics.
- Active task status alone does not protect unrelated obsolete occurrences.
- Committed exclusions apply to later cumulative requests without matching new
  identical content by text.
- Existing claims, locks, epochs, receipts, recovery, and transactions remain
  the idempotency boundary.
- Cleaner never expands authority, budgets, delegation, or provider permissions.

## Implementation Outcomes

- Committed occurrence evidence survives preparation, commit, restart, and recovery.
- Cumulative pruning uses stable occurrence identity without universal response-chain prerequisites.
- Unrelated dirty history does not block independently verified pruning.
- CLI exposes stable occurrence inspection and release through existing Cleaner services.
- Legacy task and attribution data remain compatibility readers, not competing safety owners.

## Execution Approach

- Mode: `inline sequential`
- Coordination: `git-tracked`
- Isolation: `current workspace`; preserve pre-existing dirty changes
- Executor: `codex`
- Required skills: `skill-systematic-debugging`, `skill-test-driven-development`, `skill-backend-verification`, `skill-verification-before-completion`
- Commit policy: no commits during implementation unless separately requested
- User approval required for: push, merge, credential changes, destructive recovery, and external provider writes
- Parallel ownership: none; Cleaner, Host history, and transaction state share ownership
- Order: recovery → evaluator/binding → revision fencing → cumulative continuation → scoped uncertainty → CLI inspection/release → legacy-owner removal → fresh verification

## Coordination State

- Coordination owner: `single lead controller`
- Coordination schema: `1`
- Branch: `main`
- Base commit: `379aa85`
- Expected workspace: current dirty baseline plus this plan and focused implementation changes
- Next action: none; implementation and fresh verification complete
- Blockers: none

| Task | State | Workspace | Executor | Depends On | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Task 1 | completed | current | codex | none | recovery preserves occurrence evidence | recovery regression passes; occurrence evidence reaches execution reconstruction |
| Task 2 | completed | current | codex | Task 1 | one evaluator and trusted binding | evaluator and bound-session regressions pass |
| Task 3 | completed | current | codex | Task 2 | revision meanings stay distinct | analysis/execution revisions remain distinct; unrelated growth accepted |
| Task 4 | completed | current | codex | Tasks 2–3 | cumulative continuation and restart | committed cumulative mutation plan reconstructs after restart |
| Task 5 | completed | current | codex | Task 4 | scoped uncertainty | cumulative unrelated deferred history passes; response-chain uncertainty still refuses |
| Task 6 | completed | current | codex | Tasks 2–5 | direct occurrence inspection/release | CLI occurrence inspection and release path use shared service boundary |
| Task 7 | completed | current | codex | Tasks 1–6 | no task-metadata accounting gate | occurrence accounting no longer depends on task metadata |
| Task 8 | completed | current | codex | Tasks 1–7 | fresh local checks and probe | package suites, typechecks, CLI build, contract validation, and 8-turn canonical-provider cumulative probe pass |

## Task Breakdown

### Task 1: Preserve occurrence evidence through recovery

**Task Function:**

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: source inspection, implementation, focused tests, and evidence updates.
- Stop for: provider writes, credential changes, push, merge, or destructive recovery.

Fix shared recovery so committed occurrence approval evidence cannot be dropped
before execution reconstruction. Pass the canonical persisted receipt into
`deriveCleanStoredExecution()` from `recoverCodexCleanerCommittedEpoch()`.
Preserve `receipt.evidence.occurrenceSelections` when converting an applied
receipt into recovery input. Require occurrence evidence for occurrence execution
and keep legacy task receipts readable through the compatibility boundary.

**Files and Symbols:**

- `components/adapters/codex/src/context-cleaner/runtime.ts`: recovery path.
- `components/packages/features/cleaner/src/host-execution-bridge.ts`: stored execution derivation.
- `components/adapters/codex/src/context-cleaner/applied-receipt.ts`: evidence validation.
- Cleaner and Codex recovery/receipt tests.

**Verification:**

Add RED/GREEN regression proof. Scheduled occurrence execution survives
committed-epoch recovery, retains exact `occurrenceSelections`, and reaches one
dispatch instead of `cleaner_runtime_receipt_scope_invalid`. Legacy task receipt
recovery remains readable without becoming a second selection policy.

### Task 2: Unify occurrence safety and bind mutation to Host

**Task Function:**

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: source inspection, implementation, focused tests, and evidence updates.
- Stop for: provider writes, credential changes, push, merge, or destructive recovery.

Make explicit occurrence release the only safety decision. Translate legacy task
selection into occurrence targets and occurrence-scoped protection evidence once;
then evaluate every target through `evaluateContextCleanOccurrence()`. Remove
active-task-status vetoes not backed by current occurrence retention or dependency
conflict. Enforce supplied `retain` and dependency evidence.

Require trusted bound Host/session context in `executeApprovedClean()` and shared
callers. A caller-supplied session ID is data, not mutation authority. Keep
inspection separate from mutation authorization.

**Files and Symbols:**

- `components/packages/features/cleaner/src/removal-safety.ts`: evaluator.
- `components/packages/features/cleaner/src/contracts.ts`: trusted execution shape.
- `components/packages/features/cleaner/src/orchestrator.ts`: compatibility translation.
- `components/adapters/codex/src/context-cleaner/bridge.ts`: execution boundary.
- `components/packages/features/cleaner/src/control-service.ts` and tests.

**Verification:**

Add focused tests for active parent plus obsolete child release, known dependency
protection, missing protection evidence, untrusted cross-session mutation,
trusted mutation, and idempotent retry. Trace all callers of
`executeApprovedClean` and `evaluateContextCleanOccurrence`; no caller retains a
parallel task-first eligibility decision.

### Task 3: Separate analysis, execution, and result revisions

**Task Function:**

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: source inspection, implementation, focused tests, and evidence updates.
- Stop for: provider writes, credential changes, push, merge, or destructive recovery.

Define and enforce:

- analysis revision: Host state inspected for selection;
- execution revision: Host state validated immediately before dispatch;
- result revision: state established by committed provider response.

Keep analysis revision as provenance, bind claim/prepared execution to actual
validated execution revision, and record result revision in applied receipt.
Allow unrelated history growth when selected occurrence identity remains valid.
Reject selected occurrence drift, session mismatch, or unsafe journal changes.

**Files and Symbols:**

- `components/packages/features/cleaner/src/clean-claim-store.ts`: admission.
- `components/packages/features/cleaner/src/clean-store-support.ts` and `clean-receipt-store.ts`: persistence.
- `components/adapters/codex/src/context-cleaner/runtime.ts`: claim creation/refresh.
- `components/adapters/codex/src/context-cleaner/applied-receipt.ts`: settlement.
- `components/adapters/codex/src/context-rewrite/rebase-epoch.ts`: execution identity.

**Verification:**

Prove analyze → release → unrelated Host growth → prepare → dispatch → commit →
applied receipt → restart recovery. Assert revision meanings and selected-drift
refusal. Assert uncertain dispatch cannot duplicate provider calls.

### Task 4: Reapply committed exclusions on cumulative continuation

**Task Function:**

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: source inspection, implementation, focused tests, and evidence updates.
- Stop for: provider writes, credential changes, push, merge, or destructive recovery.

Use existing committed Cleaner records and receipts to reconstruct applicable
exclusions during every ordinary cumulative request, including after restart.
Apply exclusions before provider forwarding without reopening selection or requiring
estimator, registry, response-chain, or `previous_response_id` capability checks.
Match stable occurrence identity; do not remove newly introduced identical payload.

Reconcile current dirty cumulative-format wiring, not duplicate it. Keep
response-chain reconstruction checks only on response-chain paths.

**Files and Symbols:**

- `components/adapters/codex/src/proxy-runtime.ts`: ordinary continuation.
- `components/adapters/codex/src/context-history/effective-history.ts`: history/identity.
- `components/adapters/codex/src/context-rewrite/rebase-request.ts`: cumulative filtering.
- `components/adapters/codex/src/context-rewrite/provider-continuation.ts`: continuation/restart.
- `components/adapters/codex/src/context-rewrite/fallback.ts` and `rebase-epoch.ts`: gates/identity.

**Verification:**

Normal proxy integration: release old tool-call/output pair, send cumulative
continuation, append unrelated output, send again, introduce new identical
content, restart, send again. Old occurrence stays excluded, new occurrence stays,
receipt evidence remains applied, and dispatch is not duplicated.

### Task 5: Make identity and uncertainty occurrence-scoped

**Task Function:**

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: source inspection, implementation, focused tests, and evidence updates.
- Stop for: provider writes, credential changes, push, merge, or destructive recovery.

Use Host/journal occurrence identity as canonical correspondence. Keep
content/ordinal matching only as compatibility fallback that fails closed on
ambiguity. Remove broad `deferredItems` or incomplete-history gates when they
concern unrelated occurrences; preserve refusal for selected uncertainty,
protocol closure, active mutation, or required recovery.

Keep one shared effective-history classification. Add no history ledger or global
uncertainty registry.

**Files and Symbols:**

- `components/adapters/codex/src/context-history/effective-history.ts`: identity/evidence.
- `components/adapters/codex/src/context-rewrite/rebase-request.ts`: selected validation.
- `components/adapters/codex/src/context-rewrite/fallback.ts` and backend: scoped refusal.
- Effective-history and rebase tests.

**Verification:**

Cover long dirty sessions with unrelated unresolved/deferred items, selected tool
pair closure, duplicate identical content, missing IDs, malformed journal segments,
and ambiguous correspondence. Safe unrelated pruning proceeds; selected
uncertainty refuses without mutation.

### Task 6: Expose direct occurrence inspection and release

**Task Function:**

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: source inspection, implementation, focused tests, and evidence updates.
- Stop for: provider writes, credential changes, push, merge, or destructive recovery.

Make normal CLI agent-directed instead of task-first. Add compact occurrence
inspection with stable reference, fingerprint, preview/shape, estimated size,
and protection reason. Add direct release and status commands through the
existing service/transaction boundary. Accept structured input or stdin; retain
file JSON only for automation compatibility. Do not require hand-authored task
IDs or mandatory Confirm for explicit occurrence release.

**Files and Symbols:**

- `components/products/cli/src/clean.ts`: command wiring.
- `components/products/cli/src/hosts/cleaner.ts`: occurrence projection/service calls.
- `components/products/cli/src/clean-renderer.ts`: occurrence/receipt rendering.
- CLI tests and Cleaner service contract tests.

**Verification:**

Run CLI inspect → release → status against a bound local session. Output contains
exact occurrence references and protection diagnostics; release reaches existing
transaction boundary; task selection remains compatibility only.

### Task 7: Remove downstream legacy owners and simplify explicit release

**Task Function:**

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: source inspection, implementation, focused tests, and evidence updates.
- Stop for: provider writes, credential changes, push, merge, or destructive recovery.

After Tasks 1–6 pass, delete or bypass only superseded live task-first decisions.
Retain readers needed for old plans, receipts, claims, and recovery. Remove
estimator/recommendation work from explicit occurrence release; keep optional
inspection support if existing callers need it. Compute accounting from selected
occurrences, not task IDs, so valid release cannot report zero savings solely
because task metadata is absent.

Trace every removed symbol and caller. Preserve unrelated lifecycle scheduling,
history, eviction, transaction, and recovery paths.

**Files and Symbols:**

- Cleaner orchestrator/control/receipt/claim modules.
- Codex Cleaner runtime and bridge compatibility readers.
- CLI projection and renderer.
- Tests and documentation stating task-first prerequisites.

**Verification:**

Search for old live decision symbols and task-first gates. Remaining uses must be
compatibility readers, migration diagnostics, or historical display. Prove
explicit release with no registry, disabled estimator, active Project OS
objective, and no persisted attribution.

### Task 8: Fresh local verification and plan reconciliation

**Task Function:**

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: source inspection, implementation, focused tests, and evidence updates.
- Stop for: provider writes, credential changes, push, merge, or destructive recovery.

Run focused tests after each task, then full local proof. Reconcile this plan's
ledger with actual changes and evidence. Keep prior plans historical; do not
rewrite their completion claims or touch deferred Task 6.

**Verification:**

```text
pnpm --dir components/packages/features/cleaner test
pnpm --dir components/packages/features/cleaner run typecheck
pnpm --dir components/adapters/codex test
pnpm --dir components/adapters/codex run typecheck
pnpm --dir components/products/cli test
pnpm --dir components/products/cli run typecheck
pnpm --dir components/products/cli run build
git diff --check
python "$HOME/.agents/project-os/scripts/validate_repo_contracts.py" --repo-root . --fast
```

Backend proof must include forwarded-request assertions, receipt state, final
Host/journal state, restart recovery, rollback/idempotency, and duplicate-dispatch
protection. Record provider limitations without credentials. Live-provider and
performance evidence remain separate deferred follow-ups.

## Verification

- `pnpm --dir components/packages/features/cleaner test`
- `pnpm --dir components/packages/features/cleaner run typecheck`
- `pnpm --dir components/adapters/codex test`
- `pnpm --dir components/adapters/codex run typecheck`
- `pnpm --dir components/products/cli test`
- `pnpm --dir components/products/cli run typecheck`
- `pnpm --dir components/products/cli run build`
- `git diff --check`
- `python "$HOME/.agents/project-os/scripts/validate_repo_contracts.py" --repo-root . --fast`

### Live Probe Follow-up

- 2026-09-21: The first two real-provider 8-turn probes through the canonical
  `~/.codex/tokenpilot.env` failed deterministically at `rebaseCommitted=false`.
- Root cause: canonical estimator environment enabled the lifecycle planner inside
  the provider smoke harness; its deferred lifecycle owner preempted the explicit
  rebase mutation plan, so only native continuation replay ran.
- Classification: runtime/test-harness double-owner issue, not provider transport
  failure and not Context Cleaner safety failure.
- Patch: provider smoke explicitly disables task-state estimation; regression test
  proves rebase ownership remains stable when estimator environment is configured.
- Fresh real-provider probe passed: 8 continuation turns, core capability replay,
  committed rebase, evicted sentinel absent, retained sentinel present, restart
  mapping preserved, and 11,278 observed saved input tokens.
- Focused provider smoke suite passed: `11/11`; adapter typecheck and
  `git diff --check` passed.

## Completion Criteria

### Final Acceptance Scenario

```text
Fresh bound Codex session
No registry
Estimator disabled
Active Project OS objective
        ↓
CLI inspect exact occurrences
        ↓
Release obsolete investigation and complete tool pair
        ↓
One occurrence-set eligibility decision
        ↓
History advances before dispatch
        ↓
Normal cumulative request forwards exact retained history
        ↓
Applied receipt preserves release and execution evidence
        ↓
Continuation and restart preserve committed exclusions
        ↓
New identical occurrence remains retained
        ↓
No duplicate provider dispatch
```

Completion requires:

1. Occurrence evidence survives prepare, commit, restart, and recovery.
2. One evaluator owns explicit release safety.
3. Trusted Host/session binding protects mutation.
4. Unrelated history growth does not invalidate verified selection.
5. Selected occurrence drift and selected uncertainty fail closed.
6. Cumulative pruning has no universal response-chain prerequisite.
7. Committed exclusions do not resurrect or remove new identical data.
8. Applied receipt records actual execution/result revisions and savings.
9. CLI inspect/release/status works without task IDs or hand-authored JSON.
10. No superseded live task-first owner remains.
11. Existing Host, transaction, claim, lock, epoch, receipt, and recovery
    guarantees remain intact.
12. Prior deferred Task 6 and separate live/performance follow-ups remain
    untouched and out of scope.

## Handoff

Implementation and fresh local verification completed on 2026-09-21. Git commit,
push, merge, and branch disposition require separate authorization. Real-provider
and performance follow-ups remain separate from this plan.
