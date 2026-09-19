---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: active
layer: change
name: context-cleaner-safety-autonomy-follow-up
targets:
  - components/packages/features/cleaner/src/removal-safety.ts
  - components/packages/features/cleaner/src/clean-claim-store.ts
  - components/packages/features/cleaner/src/clean-state-coordinator.ts
  - components/packages/features/cleaner/src/clean-store-support.ts
  - components/packages/features/cleaner/src/clean-receipt-store.ts
  - components/packages/features/cleaner/src/orchestrator.ts
  - components/packages/features/cleaner/tests/removal-safety.test.ts
  - components/packages/features/cleaner/tests/clean-plan-store.test.ts
  - components/packages/features/cleaner/tests/clean-receipt-store.test.ts
  - components/packages/features/cleaner/tests/clean-state-coordinator.test.ts
  - components/packages/features/cleaner/tests/recovery.test.ts
  - components/adapters/codex/src/context-cleaner/runtime.ts
  - components/adapters/codex/tests/context-cleaner-runtime.test.ts
  - components/adapters/codex/tests/context-cleaner-scheduler.test.ts
---

# Context Cleaner Safety and Autonomy Follow-up

## Goal

Harden Context Cleaner for autonomous use without creating a second governance or context-management controller. Fix sole-owner enforcement, claim admission and ownership, claim/cancel arbitration, interrupted-transaction recovery, and approval retry behavior; preserve conservative uncertain-provider recovery; define standing permission in Project OS as a separate canonical policy change.

## Implementation Outcomes

- Selected items are removable only when current attribution proves one owner.
- Claim acquisition, approval replay, and cancellation are atomic per plan.
- Same-selection retries replay existing outcomes; conflicting selections fail closed.
- Uncertain provider dispatch remains recovery-required and is never resent automatically.
- Project OS grants narrow standing permission for exclusively owned internal context without expanding authority.


## Verdict Review

The verdict is directionally correct and identifies three remaining LightRSI defects:

1. `evaluateContextCleanRemoval` accepts an item when the selected task appears in
   `item.taskIds`; it does not require the selected task to be the sole verified
   owner. Analysis protects shared items, but execution revalidation can still
   admit a newly shared item.
2. `cancelContextCleanPlan` reads the execution claim before acquiring the plan
   lock, then transitions state under the lock. Claim acquisition can win after
   the read and before cancellation, so claim and cancel do not make one atomic
   decision.
3. Approval is not idempotent for a repeated selection. A retry rebuilds an
   `approved` receipt with a new timestamp and can conflict with an existing
   approval even when selection, plan, session, and revision are unchanged.

The verdict's uncertain-provider-outcome requirement remains valid. Current
`dispatch_started` and `recovery_required` handling already refuses automatic
resend; keep that behavior and add an end-to-end regression proof for provider
success followed by failed local persistence.

Existing protections must be reused, not replaced:

- `attributeItems` already protects shared and malformed protocol items during
  analysis.
- `buildContextCleanBreakdown` already blocks active, unresolved, incomplete,
  and non-evictable tasks.
- Approval already accepts task IDs rather than caller-supplied item IDs or
  digests.
- The completed transaction plan already owns durable claims, schedule
  recovery, revision fencing, and public status compatibility.

## Live Probe Finding

The first successful TokenPilot-routed probe produced an analyzed plan with no
task IDs. Root cause: `loadSessionTaskRegistry` intentionally returns an empty
registry when task-state estimation is disabled or no registry has been
persisted; the Cleaner then preserves all items as unassigned but only reports
`recommendation_provider_unavailable`, hiding the missing attribution source.

The shared Cleaner orchestrator now adds `task_registry_unavailable` and marks
the result as fallback-used when registry attribution is absent. It does not
invent task boundaries or expose unassigned context for deletion. Focused
regression proof covers the Codex boundary and shared orchestrator path.

Task 6 remains blocked until a supported session produces eligible task
registry entries; no registry edits or estimator credentials are authorized by
this plan.

## Decisions

- Keep the public statuses unchanged: `analyzed`, `approved`, `scheduled`,
  `applied`, `stale`, `cancelled`, and `failed`.
- Require sole ownership at execution time: every selected item must have exactly
  one current task ID, and it must equal the selected task.
- Run claim acquisition, approval retry handling, and cancellation arbitration
  under the same per-plan lock. Recover pending transaction intent before reading
  plan, receipt, or claim state. Preserve `CONTEXT_CLEAN_LOCK_ORDER`.
- A claim write authorizes dispatch only when its outcome is successful or unchanged
  for the current claim identity; a returned `value` with `bypassed: true` never
  proves ownership. Matching `mutationPlanId` alone is insufficient.
- Same-plan, same-selection approval retries return the existing approval or its
  later scheduled outcome. Same-plan, different-selection retries fail closed.
- Canonical retry outcomes are:
  - `approved` + same selection: return approval and continue scheduling;
  - pending schedule pointer + same selection: recover and finish finalization;
  - `scheduled` or `applied` + same selection: return existing outcome;
  - `approved`, `scheduled`, or terminal + different selection: conflict without
    replacement.
- Preserve `recovery_required`; never resend a provider operation after dispatch
  may have started without explicit reconciliation evidence.
- Do not add automatic cleaning, a Cleaner MCP server, a durable Project OS task
  ledger, a Cleaner task mapping registry, cross-Host support, or a second
  context-management engine.
- Keep the first integration CLI-driven with explicit session identity. Add a
  programmatic adapter only after a pilot proves the CLI cannot bind the active
  session or enforce eligible task IDs reliably.

## Cross-Repository Governance Pair

Project OS policy is a separate repository change, not a LightRSI runtime
controller. In `C:\Users\HOANG PHI LONG DANG\repos\project-OS-starter`, add one
canonical standing-permission paragraph to
`docs/operating_system/templates/agents/root-AGENTS.template.md`:

> Within a bound Host session, an agent may clean context belonging exclusively
> to completed internal work when reusable findings and required evidence are
> durable and no active or dependent work requires the removed content. Current
> instructions, user constraints, unresolved work, shared dependencies, and
> evidence awaiting review remain protected. Cleaning never expands authority,
> budgets, delegation rights, or external-action permissions. Preserve context
> whenever removability or required retention is uncertain. This permission applies only when a supported Cleaner capability is available and the current session is reliably bound; missing capability, uncertain retention, or ambiguous attribution leaves context unchanged.

That change must regenerate `AGENTS.md` and adapter surfaces through
`scripts/sync_agent_adapters.py`. Do not edit generated files directly. Do not
require CoS acceptance for every lane-local clean; CoS remains authoritative for
Project OS task acceptance, shared dependencies, and evidence completion.

The Project OS checkout currently contains unrelated user changes. Preserve them;
the governance task requires its own reviewable branch or worktree and its own
PR. It is a dependency for policy rollout, not a prerequisite for LightRSI unit
and integration correctness.

## Execution Approach

- Mode: `subagent-ready`
- Coordination: `git-tracked`
- Executor: controller-selected; use Codex when delegation does not reduce risk
- Required skills: `skill-test-driven-development`, `skill-backend-verification`,
  `skill-code-standards`, `skill-plan-document-reviewer`,
  `skill-verification-before-completion`
- Isolation: current approved LightRSI workspace; separate Project OS worktree
- Commit policy: no commits before task-local proof; commit, push, PR, and merge remain separate authorized finishing actions after verification
- Shared write rule: Cleaner contract/store/orchestrator changes remain one
  sequential lane; Codex regression proof follows them
- Stop for: public status changes, automatic provider resend, caller-supplied
  target digests, new coordination state, automatic cleaning triggers, MCP
  exposure, or transport/cache behavior changes

## Coordination State

- Coordination owner: `single lead controller`
- Coordination schema: `2`
- Branch: `codex/context-cleaner-safety-autonomy-follow-up` (create at activation from `origin/main`)
- Base commit: `becf974aa3a3575e7a8dd23f2b937f8a5ecf802e`
- Expected workspace: `new LightRSI follow-up branch at activation; Project OS uses a separate checkout`
- Next action: `obtain a reliably bound supported Codex session, then run Task 6 pilot`
- Blockers: `Task 6 requires reliable session binding, supported Host traffic, eligible registry state, and agent-initiated CLI invocation`

| Task | State | Workspace | Executor | Depends On | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Task 1 | `completed` | current workspace | `codex` | none | ownership, rejected-claim, retry, race, and recovery-order tests | Cleaner focused tests pass |
| Task 2 | `completed` | current workspace | `codex` | Task 1 | removal-safety and Codex bridge tests | Cleaner and bridge focused tests pass |
| Task 3 | `completed` | current workspace | `codex` | Task 1 | locked approval, claim, and cancellation tests | approval replay and cancel/claim arbitration pass |
| Task 4 | `completed` | current workspace | `codex` | Tasks 2–3 | uncertain-dispatch and receipt recovery tests | Codex targeted suite and typecheck pass |
| Task 5 | `completed` | separate Project OS checkout | `codex` | none | sync drift and contract validation | policy sync, drift check, and contract validation pass |
| Task 6 | `blocked` | current runtime environment | `codex` | Tasks 2–5 | pilot measurements and stop-condition review | no reliably bound agent-initiated session available; CLI help verified only |

## Task Breakdown

### Task 1: Add regression proof for safety, ownership, retry, and recovery

**Template Profile:**

- Controller-selected: `normal`

**Validator Profile:**

- Controller-selected: `review`

**Required Skills:**

- `skill-test-driven-development`
- `skill-backend-verification`
- `skill-code-standards`

**Files:**

- `components/packages/features/cleaner/tests/removal-safety.test.ts`
- `components/packages/features/cleaner/tests/clean-plan-store.test.ts`
- `components/packages/features/cleaner/tests/clean-receipt-store.test.ts`
- `components/packages/features/cleaner/tests/clean-state-coordinator.test.ts`

**Steps:**

- Add a removal-safety case where an item has `taskIds: [selectedTask,
  otherTask]`; assert rejection with a shared/ownership reason.
- Add a repeated approval case with identical plan, revision, and selection;
  assert the second call returns the existing approval without changing the
  approved selection or creating a conflicting receipt.
- Add a repeated approval case with a different selection; assert conflict and
  unchanged stored approval.
- Add a claim-versus-cancel race test using one temporary plan and the existing
  per-plan lock; assert exactly one operation wins and the final state cannot be
  both claimed and cancelled.
- Add a rejected-claim-write test where the store returns an existing claim with
  `bypassed: true` and `clean_claim_owner_conflict`; assert the current attempt
  cannot dispatch or treat the returned claim as its own.
- Add an interrupted-transaction test proving pending intent recovery runs before
  retry identity and selection comparison.
- Retain existing idempotent schedule and terminal replay assertions.

**Verification:**

```text
pnpm --dir components/packages/features/cleaner test
pnpm --dir components/packages/features/cleaner run typecheck
```

**Exit criteria:** Tests fail on current code for sole ownership, rejected claim
ownership, approval retry, claim/cancel atomicity, and recovery ordering; they pass
after Tasks 2–4.

**Authority:**

- Preauthorized local actions: add declared regression tests and run Cleaner
  checks.
- Stop for: changing production behavior in this task, changing public status,
  or weakening protected-item assertions.

### Task 2: Enforce sole ownership in shared removal evaluation

**Template Profile:**

- Controller-selected: `normal`

**Validator Profile:**

- Controller-selected: `review`

**Required Skills:**

- `skill-test-driven-development`
- `skill-backend-verification`
- `skill-code-standards`

**Files and symbols:**

- Modify `components/packages/features/cleaner/src/removal-safety.ts:evaluateContextCleanRemoval`
- Verify `components/packages/features/cleaner/src/task-attribution.ts:attributeItems`
- Verify `components/packages/features/cleaner/src/token-accounting.ts:buildContextCleanBreakdown`

**Steps:**

- Change item validation from membership-only to exact ownership: item must have
  one non-blank task ID and that ID must equal the selected task.
- Preserve system/developer, fingerprint, revision, missing-item, lifecycle,
  active-task, unresolved-task, and evictable-task checks.
- Keep shared-item analysis behavior unchanged; this task hardens the execution
  boundary against ownership drift after analysis.
- Map the new failure to the existing safe bypass path without changing public
  status vocabulary.

**Verification:**

```text
pnpm --dir components/packages/features/cleaner test
pnpm --dir components/packages/features/cleaner run typecheck
pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/context-cleaner-bridge.test.ts tests/context-cleaner-runtime.test.ts tests/context-cleaner-scheduler.test.ts
pnpm --dir components/adapters/codex test
```

**Exit criteria:** No approved execution can target an item shared by multiple
tasks, even when the selected task is present in the current item attribution.

**Authority:**

- Preauthorized local actions: edit the declared removal evaluator and tests;
  run Cleaner and Codex checks.
- Stop for: changing analysis attribution, public statuses, provider transport,
  or task lifecycle vocabulary.

### Task 3: Make approval, claim, and cancellation one locked decision

**Transaction sequence:**

- Acquire existing per-plan lock.
- Recover pending transaction intent through the existing coordinator.
- Read consistent plan, receipt, and claim state.
- Validate scheduled state, identity, lifecycle, selection, and claimant ownership.
- Replay the canonical outcome or perform one transition.
- Release the lock.

**Template Profile:**

- Controller-selected: `normal`

**Validator Profile:**

- Controller-selected: `review`

**Required Skills:**

- `skill-test-driven-development`
- `skill-backend-verification`
- `skill-code-standards`

**Files and symbols:**

- Modify `components/packages/features/cleaner/src/clean-store-support.ts:withContextCleanStoreLock`
- Modify `components/packages/features/cleaner/src/clean-claim-store.ts` to expose
  an internal unlocked claim read used only while holding the plan lock
- Modify `components/packages/features/cleaner/src/clean-state-coordinator.ts` to
  expose an internal unlocked transition used only while holding the plan lock
- Modify `components/packages/features/cleaner/src/clean-receipt-store.ts` to
  preserve canonical same-selection replay and different-selection conflict
- Modify `components/packages/features/cleaner/src/orchestrator.ts:approveContextCleanSelection`
  and `cancelContextCleanPlan`
- Update `components/packages/features/cleaner/tests/clean-plan-store.test.ts`,
  `clean-receipt-store.test.ts`, and `clean-state-coordinator.test.ts`

**Steps:**

- Keep first approval, claim acquisition, and cancellation inside one
  `withContextCleanStoreLock` critical section per plan.
- A new claim is admissible only after pending intent recovery confirms scheduled
  state, matching host/session/revision/selection identity, and no incompatible
  claim.
- Approval behavior:
  - no existing approval: persist approved receipt and plan transition;
  - existing approval with identical selected task set and identity: return the
    existing receipt unchanged;
  - existing approval with different selection, session, host, or revision:
    return conflict without overwriting state;
  - scheduled or terminal receipt: replay existing outcome, never reopen it.
- Cancellation behavior:
  - read claim while holding the plan lock;
  - if claim exists, return `execution_in_progress` and do not transition;
  - if no claim exists, transition to `cancelled` while still holding the same
    lock;
  - make repeated cancellation replay the existing terminal receipt.
- Keep claim owner-token and claim-ID fencing. Do not change lock order or public
  status values.
- In `ensureCodexCleanerExecutionClaim`, require a successful/unchanged write
  outcome for the current claim ID and owner token before returning a claim. A
  conflict or bypassed write returns a reserved/recovery result and cannot reach
  provider dispatch.
- Ensure the execution runtime cannot acquire a claim after cancellation has
  committed, and cancellation cannot commit after claim acquisition has
  committed.

**Verification:**

```text
pnpm --dir components/packages/features/cleaner test
pnpm --dir components/packages/features/cleaner run typecheck
pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/context-cleaner-bridge.test.ts tests/context-cleaner-runtime.test.ts tests/context-cleaner-scheduler.test.ts
pnpm --dir components/adapters/codex test
```

**Exit criteria:** Same-selection approval and cancellation retries are
idempotent; conflicting selections fail closed; claim and cancel have one
winner under concurrent execution.

**Authority:**

- Preauthorized local actions: edit declared Cleaner lock/store/orchestrator
  boundaries and tests; run Cleaner and Codex checks.
- Stop for: adding a second controller, changing lock order, adding a new
  coordination ledger, or changing public status values.

### Task 4: Preserve uncertain-provider recovery with Codex proof

**Template Profile:**

- Controller-selected: `normal`

**Validator Profile:**

- Controller-selected: `review`

**Required Skills:**

- `skill-test-driven-development`
- `skill-backend-verification`
- `skill-code-standards`

**Files and symbols:**

- Verify or minimally modify `components/adapters/codex/src/context-cleaner/bridge.ts` and `components/adapters/codex/src/context-cleaner/runtime.ts`
- Verify `components/packages/features/cleaner/src/recovery.ts`
- Extend `components/adapters/codex/tests/context-cleaner-bridge.test.ts` and `components/adapters/codex/tests/context-cleaner-runtime.test.ts`
- Extend `components/adapters/codex/tests/context-cleaner-scheduler.test.ts`
- Extend `components/packages/features/cleaner/tests/recovery.test.ts` only when
  shared recovery vocabulary needs coverage

**Steps:**

- Prove a rejected claim write cannot authorize dispatch, including when the
  rejected result carries an existing claim value.
- Prove a provider dispatch that may have succeeded followed by failed local
  persistence enters `recovery_required` or equivalent reserved state.
- Prove the next request reconstructs committed evidence when available.
- Prove the next request does not resend provider work when dispatch state is
  `dispatch_started` or `recovery_required`.
- Prove claim cleanup failure preserves a conservative retry/recovery signal and
  does not report `applied` without durable evidence.
- Preserve existing Codex session mutation exclusion, response-chain rewrite,
  journal, and cache behavior.

**Verification:**

```text
pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/context-cleaner-bridge.test.ts tests/context-cleaner-runtime.test.ts tests/context-cleaner-scheduler.test.ts
pnpm --dir components/adapters/codex test
pnpm --dir components/adapters/codex run typecheck
pnpm --dir components/packages/features/cleaner test
```

**Exit criteria:** Uncertain provider outcomes never trigger automatic resend;
applied receipts require committed host evidence and honest savings metrics.

**Authority:**

- Preauthorized local actions: edit declared Codex Cleaner runtime only when the
  regression proves a gap; add runtime and scheduler tests.
- Stop for: provider replay, transport changes, cache changes, or new runtime
  persistence outside existing journals and receipts.

### Task 5: Land Project OS standing-permission policy separately

**Template Profile:**

- Controller-selected: `normal`

**Validator Profile:**

- Controller-selected: `review`

**Required Skills:**

- `skill-code-standards`
- `skill-backend-verification`

**Repository:** `C:\Users\HOANG PHI LONG DANG\repos\project-OS-starter`

**Files and commands:**

- Modify `docs/operating_system/templates/agents/root-AGENTS.template.md`
- Generate with `python scripts/sync_agent_adapters.py --all-platforms`
- Verify with `python scripts/sync_agent_adapters.py --all-platforms --check`
- Verify with `python scripts/validate_repo_contracts.py --repo-root . --fast`

**Steps:**

- Add the approved standing-permission paragraph from this plan to canonical
  root guidance under normal personal-local execution guidance.
- State that agents may clean exclusively owned completed internal work without
  repeated CoS approval, while current instructions, unresolved work, shared
  dependencies, and evidence awaiting acceptance remain protected.
- State that Cleaner permission does not expand authority, budgets, delegation,
  or external-action permissions.
- State that missing Cleaner capability, unreliable session binding, uncertain
  retention, or ambiguous attribution leaves context unchanged.
- Treat policy preparation and generated-surface validation as complete before
  pilot activation; do not globally activate permission based on policy sync alone.
- Regenerate all derived agent surfaces.
- Review generated diff for user changes before commit; do not overwrite the
  existing dirty Project OS checkout.

**Verification:**

```text
python scripts/sync_agent_adapters.py --all-platforms --check
python scripts/validate_repo_contracts.py --repo-root . --fast
```

**Exit criteria:** Canonical policy and generated surfaces agree; no new grant
schema, Cleaner ledger, CoS approval loop, or generated-file hand edit exists.

**Authority:**

- Preauthorized local actions: edit the canonical Project OS template in the separate checkout,
  regenerate declared surfaces, and run declared validators in its separate
  checkout.
- Stop for: overwriting unrelated user changes, editing generated surfaces by
  hand, or changing Runtime Grant semantics.

### Task 6: Run narrow single-agent pilot and measure usefulness

**Template Profile:**

- Controller-selected: `normal`

**Validator Profile:**

- Controller-selected: `review`

**Required Skills:**

- `skill-backend-verification`
- `skill-verification-before-completion`

**Files:** No production source change. Record results in the implementation PR
or task evidence, not a new runtime registry.

**Steps:**

- Use existing explicit CLI flow with a verified Codex session ID:

```text
 lightrsi codex clean --session SESSION_ID
 lightrsi codex clean --plan PLAN_ID --select TASK_ID[,TASK_ID...]
 lightrsi codex clean --status PLAN_ID
```

- Before the pilot, prove the agent can identify the intended session without
  guessing, traffic traverses the supported LightRSI Host adapter, the existing
  registry identifies genuinely completed eligible work, no manual registry
  modification is required, and status/recovery outcomes are readable.
- Pilot one long-running single-agent implementation task containing multiple
  completed investigations or debugging cycles.
- Clean only exclusively owned completed internal work after findings and proof
  are durable; preserve active work, shared context, unresolved failures, and
  evidence needed for review.
- Measure uncached input cost, end-to-end latency, repeated investigation,
  task correctness, acceptance success, stale/recovery incidents, and applied
  savings. Do not judge success by removed-token count alone.
- Require agent-initiated operation: the agent decides cleaning is useful,
  invokes the existing CLI, selects eligible tasks, observes the outcome, and
  continues the original task without repeated human confirmation.
- If a human chooses the session, selects every task, and executes every command,
  record the result as supervised operation, not autonomous maintenance.
- Stop the pilot if any shared item is selected, cancellation/claim ownership is
  ambiguous, uncertain dispatch is resent, or evidence needed for acceptance is
  lost.

**Exit criteria:** Pilot demonstrates safe agent-initiated maintenance with no
  manual registry edits, or produces one concrete missing capability before any
  adapter, automatic trigger, or MCP surface is proposed. Policy rollout remains
  staged until pilot safety and usefulness are reviewed.

**Authority:**

- Preauthorized local actions: run the existing explicit Cleaner CLI against a
  user-approved test session and record bounded measurements.
- Stop for: production automatic cleaning, deletion of shared context, loss of
  acceptance evidence, or any uncertain provider resend.

## Verification

Run from LightRSI root after Tasks 1–4; run targeted Codex tests before the full adapter suite:

```text
pnpm --dir components/packages/features/cleaner test
pnpm --dir components/packages/features/cleaner run typecheck
pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/context-cleaner-bridge.test.ts tests/context-cleaner-runtime.test.ts tests/context-cleaner-scheduler.test.ts
pnpm --dir components/adapters/codex test
pnpm --dir components/adapters/codex run typecheck
pnpm --dir components/products/cli test
pnpm --dir components/products/cli run typecheck
pnpm --dir components/products/cli run build
git diff --check
python C:\Users\HOANG PHI LONG DANG\.agents\project-os\scripts\validate_repo_contracts.py --repo-root . --fast
```

Run Project OS validation after Task 5 in its separate checkout using the commands listed there.

## Completion Criteria

Completion requires:

1. Sole ownership is enforced at execution, not only at analysis.
2. Claim acquisition and cancellation have one locked winner.
3. Same-selection approval and scheduling retries are idempotent.
4. Different selections cannot overwrite an existing approval.
5. Uncertain provider outcomes remain recovery-required and are never resent.
6. Existing transaction, revision, protocol-closure, journal, rewrite, and cache behavior remains unchanged outside Cleaner-selected mutation.
7. Project OS standing permission is canonical and generated surfaces are synced.
8. `skill-verification-before-completion` returns `verified` before changing plan status from `proposed`.

## Non-Goals

- Automatic periodic or threshold-triggered cleaning.
- Cleaner MCP exposure.
- Cleaner task IDs becoming Project OS task IDs.
- Persistent cross-repository mapping or coordination ledger.
- DeepAgents, Tura, Claude, or other Host runtime convergence without separate
  evidence.
- Provider replay after uncertain dispatch.
- Prompt-cache or transport policy changes.
