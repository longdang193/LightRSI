---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: superseded
layer: change
name: context-cleaner-history-authority-simplification
targets:
  - components/packages/features/cleaner/src/removal-safety.ts
  - components/packages/features/cleaner/src/orchestrator.ts
  - components/packages/features/cleaner/src/clean-plan-store.ts
  - components/packages/features/cleaner/src/clean-state-coordinator.ts
  - components/packages/features/cleaner/src/clean-claim-store.ts
  - components/packages/features/cleaner/src/recovery.ts
  - components/packages/features/cleaner/tests/removal-safety.test.ts
  - components/packages/features/cleaner/tests/clean-plan-store.test.ts
  - components/packages/features/cleaner/tests/clean-state-coordinator.test.ts
  - components/packages/features/cleaner/tests/recovery.test.ts
  - components/packages/features/eviction/src/history-apply.ts
  - components/packages/features/eviction/src/context-mutation-plan.ts
  - components/packages/features/eviction/src/lifecycle-planner.ts
  - components/packages/features/eviction/src/task-state-estimator.ts
  - components/adapters/codex/src/context-history/replayability.ts
  - components/adapters/codex/src/context-rewrite/lifecycle-input.ts
  - components/packages/features/cleaner/src/host-execution-bridge.ts
  - components/packages/features/cleaner/src/recommendation.ts
  - components/products/cli/src/hosts/cleaner.ts
  - components/packages/features/cleaner/src/contracts.ts
  - components/packages/features/eviction/tests/lifecycle-planner.test.ts
  - components/adapters/codex/src/context-cleaner/bridge.ts
  - components/adapters/codex/src/context-cleaner/runtime.ts
  - components/adapters/codex/src/context-rewrite/lifecycle-runner.ts
  - components/adapters/codex/src/proxy-runtime.ts
  - components/adapters/codex/tests/context-cleaner-bridge.test.ts
  - components/adapters/codex/tests/context-cleaner-runtime.test.ts
  - components/adapters/codex/tests/context-cleaner-scheduler.test.ts
  - components/adapters/codex/tests/context-rewrite-lifecycle-runtime.test.ts
  - components/products/cli/src/clean.ts
  - components/products/cli/src/hosts/codex.ts
  - components/products/cli/tests/clean.test.ts
  - components/products/cli/tests/dispatch.test.ts
---

# Context Cleaner History Authority Simplification

## Goal

Simplify Context Cleaner around one decision owner, one immutable cleanup plan,
and one execution authority. Use bound host history as content truth. Keep
ownership checks, protected-content checks, applicability revalidation,
uncertain-dispatch recovery, and duplicate-generation prevention.

Do not create another service, transcript database, task controller, approval
authority, polling loop, retry layer, or mandatory human approval step.

Do not make native `previous_response_id` traffic a Cleaner prerequisite. Keep
response-chain rebase validation as a separate capability gate.

## Implementation Outcomes

### History-first safe selection

One shared host-item classification derives completion, ownership, protected
content, active dependency, incomplete exchange, and stable target fingerprints
from bound history. The same classification feeds analysis, plan creation,
execution revalidation, and recovery.

### Existing plan and receipt authorities

Keep the immutable analysis plan, agent-approved selection receipt, exclusive
execution claim, and authoritative outcome as distinct records. The analysis
plan owns analysis facts; the approval receipt owns the accepted selection;
claims serialize execution; outcomes support recovery. Scheduling, execution,
and recovery reuse the stored approved selection without reconstructing it or
manufacturing timestamps. Do not add selected task IDs to the analysis plan
solely to make one physical record. The coordinator owns dispatch
serialization and outcome state; the host adapter owns history interpretation
and supported mutation mechanics.

### Bounded attribution and recommendation

The estimator and registry may provide attribution evidence when history alone
cannot prove ownership. They do not act as a second approval authority.
Recommendation inference stays optional: deterministic evidence plus active-agent
judgment skips recommendation-model work when no eligible candidates exist, but
does not remove estimator output required to establish attribution.

### Narrow acceptance proof

Focused regression tests prove ownership, protected-content, plan-fingerprint,
claim, recovery, and no-resend behavior. One real same-agent Codex/9Router
pilot proves bound-session analysis, optional selection, status, safe outcome,
and continued work. Response-chain rebase remains separate evidence.

## Execution Approach

- Mode: `inline sequential`
- Coordination: `git-tracked`
- Required skills: `skill-systematic-debugging`, `skill-test-driven-development`, `skill-backend-verification`, `skill-verification-before-completion`, `skill-finishing-a-development-branch`
- Isolation: `current workspace`; create a worktree only if implementation overlaps active user changes
- Commit policy: `no commits during execution`
- Preauthorized local actions: inspect and modify declared LightRSI files; add focused tests; run package tests, typechecks, read-only Cleaner CLI analysis, and bounded real-session verification
- User-approval actions: commit, push, merge, publication, authentication, production cleanup, destructive recovery, or edits outside declared targets
- Parallel ownership: none; shared validation and state files require sequential edits
- Sequential fallback: feasibility and caller trace → minimal demonstrated corrections → attribution/recommendation and adapter wiring → real application pilot → final verification

## Phase Gates

1. **Feasibility:** trace attribution, selection, scheduling, execution, and
   recovery; inspect real bound Codex/9Router history; record which evidence
   proves ownership and whether the supported Host can apply removal.
2. **Minimal corrections:** change only demonstrated duplication or failed
   invariants while preserving current plans, receipts, claims, recovery, and
   fail-closed safety.
3. **Autonomous execution:** prove one normal agent analyzes, selects,
   schedules, observes actual application, and continues with an authoritative
   `applied` outcome. A safe refusal or capability gap is evidence, not
   successful cleaning.

## Coordination State

- Coordination owner: `single lead controller`
- Coordination schema: `2`
- Branch: `main`
- Base commit: `3fffbd6456244dd0c3aa3385baffbc33d765d26d`
- Expected workspace: `clean LightRSI checkout`
- Next action: `run Gate A on a completed session with persisted task attribution, then rerun Gate B`
- Blockers: `Gate B blocked: current completed sessions lack task-registry evidence; current live session has an open request with unresolved tool calls`

| Task | State | Workspace | Executor | Depends On | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Task 1 | `completed` | current | `codex` | none | shared classification and ownership tests | caller trace; fail-closed ownership and protected-content tests; live sessions refused without registry evidence |
| Task 2 | `completed` | current | `codex` | Task 1 | immutable plan reuse and recovery tests | Cleaner, Codex claim, receipt, schedule, and recovery tests pass |
| Task 3 | `completed` | current | `codex` | Tasks 1–2 | advisory estimator and adapter boundary tests | empty-task recommendation guard added; Cleaner/Codex/CLI tests pass |
| Task 4 | `blocked` | current | `codex` | Tasks 1–3 | real Codex/9Router pilot and final verification | Gate A safe refusal only; Gate B not attempted because ownership and complete history are unproven |

## Task Breakdown

### Task 1: Establish feasibility, trace callers, and prove ownership

**Purpose:**
- Trace current attribution, selection, scheduling, execution, and recovery
  callers before changing shared behavior.
- Establish what bound Host history proves about ownership, completion,
  protection, and fingerprints, and whether the actual Host supports mutation.
- Replace duplicated item interpretation only where source trace proves shared
  classification is safe.

**Task Function:**
- Trace callers, record feasibility evidence, define the smallest justified
  classification change, and add red/green regression proof.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: shared safety primitive; low ambiguity after source trace

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: independent review of ownership and protected-content gates

**Specification Coverage:**
- Correct session and safe selection are mandatory.
- Do not remove ownership checks before history can establish them.

**Required Skills:**
- `skill-systematic-debugging`
- `skill-test-driven-development`
- `skill-backend-verification`

**Files And Symbols:**
- Inspect: `components/packages/features/eviction/src/history-apply.ts:computeClosureDeferredTaskInfo`
- Inspect: `components/packages/features/eviction/src/context-mutation-plan.ts:buildContextMutationPlan`
- Inspect: `components/packages/features/cleaner/src/removal-safety.ts:evaluateContextCleanRemoval`
- Inspect: `components/adapters/codex/src/context-history/replayability.ts`, `components/adapters/codex/src/context-rewrite/lifecycle-input.ts`, `components/packages/features/cleaner/src/host-execution-bridge.ts`, `components/packages/features/cleaner/src/contracts.ts`
- Modify: same files only when feasibility and caller trace prove a shared classification change is required
- Verify: `components/packages/features/cleaner/tests/removal-safety.test.ts`, eviction history/plan tests

**Dependencies:**
- Current source and tests; no registry or estimator changes first.

**Authority:**
- Preauthorized local actions: inspect declared symbols, add focused failing/passing tests, and modify declared classification files
- Stop for: ownership cannot be proven from trusted history, or a new authority/store appears necessary

**Steps:**
- [x] Step 1: Trace every classifier, task-ID reader, protected-item check, selection reader, and removal-safety caller.
- [x] Step 2: Record an evidence matrix for session, content, ownership, completion, retention, mutation, and single execution.
- [x] Step 3: Run or inspect a bounded real-session mutation probe without changing registry state or adding credentials.
- [x] Step 4: Define one canonical item classification and stable target fingerprint input only where feasibility evidence supports it.
- [x] Step 5: Route analysis and execution revalidation through it without changing protected-content defaults.
- [x] Step 6: Add tests for exclusive ownership, shared ownership, active dependency, incomplete exchange, and protected evidence.

**Verification:**
- [x] `pnpm --dir components/packages/features/cleaner test`
- Expected: new tests fail before change and pass after; shared targets remain rejected.

**Exit Criteria:**
- Feasibility record identifies trusted ownership evidence and actual Host mutation support.
- Existing registry-dependent safety remains when history cannot prove ownership.
- Any shared classification change is limited to demonstrated duplication and preserves protected-content defaults.

### Task 2: Preserve approved selection and reuse it through execution/recovery

**Purpose:**
- Preserve the existing analysis plan and approval receipt as separate
  immutable decisions reused by all later stages.
- Remove selection/timestamp reconstruction from scheduling, execution, retry,
  and recovery paths.

**Task Function:**
- Consolidate plan identity, applicability validation, claim fencing, and
  outcome recovery around existing stores.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: high-risk state transition; controller retains authority

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: inspect idempotency, uncertain dispatch, and crash recovery

**Specification Coverage:**
- Plan is immutable.
- Revalidation may reject a plan but never silently rewrites it.
- Uncertain dispatch is never automatically repeated.

**Required Skills:**
- `skill-systematic-debugging`
- `skill-test-driven-development`
- `skill-backend-verification`

**Files And Symbols:**
- Inspect/modify: `components/packages/features/cleaner/src/clean-plan-store.ts`
- Inspect/modify: `components/packages/features/cleaner/src/clean-state-coordinator.ts:transitionContextCleanApproval`, `transitionContextCleanSchedule`, `recoverContextCleanState`
- Inspect/modify: `components/packages/features/cleaner/src/clean-claim-store.ts:saveContextCleanExecutionClaim`, `recoverContextCleanStateUnlocked`
- Inspect/modify: `components/packages/features/cleaner/src/orchestrator.ts:analyzeContextCleanSession`, `approveContextCleanSelection`, `finalizeContextCleanSchedule`
- Verify: cleaner plan, coordinator, claim, receipt, and recovery tests

**Dependencies:**
- Task 1 classification and fingerprints.

**Authority:**
- Preauthorized local actions: modify existing plan/claim/coordinator/recovery paths and add focused regression tests
- Stop for: a second transaction authority, mutable plan rewrite, automatic resend, or schema migration with no recovery path

**Steps:**
- [x] Step 1: Confirm the analysis plan remains immutable and the approval receipt remains the canonical accepted selection; do not merge their records.
- [x] Step 2: Reuse the stored approved selection in schedule, execution revalidation, receipt generation, and recovery.
- [x] Step 3: Replace registry-version-only invalidation only where equivalent identity, target-content, protected-boundary, capability, current-retention, and unresolved-outcome evidence exists.
- [x] Step 4: Preserve existing claim fencing and terminal outcome recovery; remove duplicate selection logic only after tests pass.

**Verification:**
- [x] `pnpm --dir components/packages/features/cleaner test`
- Expected: same-selection retry is idempotent; changed selection conflicts; uncertain dispatch reaches recovery without resend; stale target rejects safely.

**Exit Criteria:**
- Analysis plan, approval receipt, execution claim, and outcome remain distinct and authoritative for their own decisions.
- Schedule, execution, and recovery use stored approved selection without independent reconstruction.
- Coordinator is sole dispatch/outcome authority; adapter remains mutation executor.

### Task 3: Remove demonstrated duplication and align adapter/CLI boundaries

**Purpose:**
- Keep attribution evidence available when needed while removing unnecessary
  recommendation inference and duplicated boundary decisions.
- Keep observation independent from rewrite settings without weakening
  fail-closed mutation checks.

**Task Function:**
- Remove unnecessary recommendation dependencies and route existing adapter/CLI
  calls through canonical plan validation.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: cross-layer contract change; source-first implementation

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: inspect adapter boundary and refusal behavior

**Specification Coverage:**
- Attribution evidence and recommendation inference remain separate concerns.
- No recommendation-model call when deterministic evidence and active-agent
  judgment suffice; estimator evidence remains when needed for attribution.
- Observation runs regardless of rewrite mode.

**Required Skills:**
- `skill-test-driven-development`
- `skill-backend-verification`

**Files And Symbols:**
- Inspect/modify: `components/packages/features/eviction/src/lifecycle-planner.ts:planLifecycleEviction`
- Inspect/modify: `components/packages/features/eviction/src/task-state-estimator.ts`
- Inspect/modify: `components/adapters/codex/src/context-history/replayability.ts`
- Inspect/modify: `components/adapters/codex/src/context-rewrite/lifecycle-input.ts`
- Inspect/modify: `components/packages/features/cleaner/src/host-execution-bridge.ts`
- Inspect/modify: `components/packages/features/cleaner/src/recommendation.ts`
- Inspect/modify: `components/products/cli/src/hosts/cleaner.ts`
- Inspect/modify: `components/packages/features/cleaner/src/contracts.ts`
- Inspect/modify: `components/adapters/codex/src/context-cleaner/bridge.ts:createCodexContextCleanerBridge`
- Inspect/modify: `components/adapters/codex/src/context-cleaner/runtime.ts:prepareCodexCleanerRebase`, `revalidateCodexCleanerPreparedRebase`
- Inspect/modify: `components/adapters/codex/src/context-rewrite/lifecycle-runner.ts:runCodexLifecyclePlanner`, `revalidateCodexLifecyclePreparedPlan`
- Inspect/modify: `components/products/cli/src/clean.ts:handleCleanCommand`, `components/products/cli/src/hosts/codex.ts:createCodexCliBridge`
- Verify: lifecycle, estimator, adapter bridge/runtime, CLI clean, and dispatch tests

**Dependencies:**
- Tasks 1–2 complete; plan contract and classification stable.

**Authority:**
- Preauthorized local actions: change advisory estimator handling, observation wiring, and CLI/adapter validation in declared files
- Stop for: bypassing session binding, weakening protected-content checks, or introducing a new registry/controller

**Steps:**
- [x] Step 1: Separate attribution evidence from recommendation inference; preserve estimator output when required to establish ownership.
- [x] Step 2: Skip recommendation-model work when deterministic analysis finds no eligible candidates or active-agent judgment is sufficient.
- [x] Step 3: Run observation/lifecycle attribution independent of response-chain rewrite settings.
- [x] Step 4: Ensure CLI status, selection, schedule, and execution all use the same bound session and immutable plan.

**Verification:**
- [x] `pnpm --dir components/adapters/codex exec node --import tsx --test tests/context-cleaner-bridge.test.ts tests/context-cleaner-runtime.test.ts tests/context-cleaner-scheduler.test.ts tests/context-rewrite-lifecycle-runtime.test.ts`
- [x] `pnpm --dir components/products/cli test`
- Expected: missing estimator is advisory for analysis, mutation still fails closed on missing ownership/applicability proof, and observation remains active when rewrite is disabled.

**Exit Criteria:**
- Registry/estimator is not a second approval authority, but required attribution evidence remains available.
- Recommendation inference is optional and skipped when unnecessary.
- Adapter and CLI expose one validation path and preserve refusal/recovery behavior.

### Task 4: Run real pilot and close with separate capability gates

**Purpose:**
- Validate two separate gates on actual Codex/9Router traffic without inventing
  a new mutation architecture.
- Gate A proves attribution and analysis. Gate B proves actual application.

**Task Function:**
- Execute bounded live verification and record evidence; no implementation edits
  unless a proven defect blocks the declared exit criteria.

**Template Profile:**
- Controller-selected: `none (lead controller)`
- Selection basis: live evidence and acceptance control require lead ownership

**Validator Profile:**
- Controller-selected: `review`
- Selection basis: independent check of session binding, selection, outcome, and continuation

**Specification Coverage:**
- Complete useful work, preserve findings, optionally analyze/select, continue
  ordinary work, inspect outcome once.
- No manual registry edits, forced credentials, periodic polling, or mutation
  retry under unchanged conditions.
- Safe refusal is valid safety evidence but does not count as successful
  context cleaning.

**Required Skills:**
- `skill-backend-verification`
- `skill-verification-before-completion`

**Files And Symbols:**
- Inspect: `components/products/cli/src/hosts/codex.ts:createCodexCliBridge`
- Verify: `lightrsi codex clean --session SESSION_ID`, `--status PLAN_ID`, and existing pilot evidence
- Record: plan evidence only; do not create a runtime registry or durable second transcript

**Dependencies:**
- Tasks 1–3 complete; real session has reliable host binding.

**Authority:**
- Preauthorized local actions: run read-only Cleaner analysis/status and one bounded same-agent pilot on a user-approved test session
- Stop for: production mutation, shared-context target, missing ownership proof, uncertain dispatch, authentication change, or registry editing

**Steps:**
- [x] Step 1: Run Gate A binding and analysis on completed normal-agent sessions and the current live session.
- [x] Step 2: Record whether existing bound history proves ownership and completion; retain registry-dependent safety when it does not.
- [ ] Step 3: For Gate B, select only proven exclusively owned completed work and run one supported application attempt.
- [ ] Step 4: Continue original objective and record authoritative `applied`, safe refusal, or recovery-required outcome.
- [x] Step 5: If mutation prerequisites fail, inspect existing supported Host alternatives before proposing any new mutation mechanism.
- [ ] Step 6: Record response-chain rebase as a separate capability gate; do not manufacture `previous_response_id`.

**Live Probe Evidence (2026-09-20):**
- `lightrsi codex doctor`: proxy, hooks, recovery MCP, daemon, 9Router, and estimator healthy.
- Completed sessions `codex-synth-76b4ab59-fb0b-4b40-9166-47ab37979527`, `codex-synth-c47484df-6b1e-4164-ac79-32920d2fac8a`, and `codex-synth-eebbd5b7-4062-4741-be39-afdb6e778087`: analysis succeeded, selected none, fallback `yes`, reason `task_registry_unavailable`.
- Current session `codex-synth-58d5200b-a621-42d6-a3df-dc253a19bf9a`: refused with `codex_clean_snapshot_incomplete:history_replay_incomplete,history_unresolved_tool_calls`.
- Failure classification: missing task registry is runtime/data-state; incomplete history and unresolved tool calls are live-session state. No source patch, registry edit, credential change, retry, or mutation is justified.
- Existing Host path remains the only supported mutation path: `clean --plan <plan-id> --select <task-id[,task-id...]>`; it requires proven selectable ownership and complete history.

**Verification:**
- [x] `lightrsi codex clean --status PLAN_ID`
- [x] `pnpm --dir components/packages/features/cleaner test`
- [x] `pnpm --dir components/adapters/codex test`
- [x] `pnpm --dir components/products/cli test`
- Expected: bound session is exact, unsafe/shared targets are refused, no duplicate execution occurs, and ordinary work continues.

**Exit Criteria:**
- Gate A proves sufficient attribution and analysis, or records exact missing evidence while retaining the safe registry path.
- Gate B proves actual application through the supported Host and authoritative `applied` outcome. A capability gap blocks autonomous-cleaning completion; it does not count as success.
- Response-chain transport remains separately classified, and existing supported alternatives are investigated before any new mutation architecture is proposed.

## Verification

- `pnpm --dir components/packages/features/cleaner typecheck`
- `pnpm --dir components/packages/features/eviction typecheck`
- `pnpm --dir components/adapters/codex typecheck`
- `pnpm --dir components/products/cli typecheck`
- `pnpm --dir components/packages/features/cleaner test`
- `pnpm --dir components/adapters/codex test`
- `pnpm --dir components/products/cli test`
- `git diff --check`
- Confirm no new service, registry authority, transcript store, approval loop,
  polling loop, or automatic retry was added.

## Completion Criteria

The plan is ready for completion verification when:

1. feasibility evidence identifies trusted ownership and supported Host mutation
2. any shared history classification supplies only demonstrated ownership,
   protection, completion, and target-fingerprint facts
3. analysis plan, approval receipt, execution claim, and outcome remain distinct
   records with one authority per decision
4. stored approved selection is reused through schedule, execution, and recovery
5. coordinator dispatch/outcome authority and adapter mutation authority are
   explicit and non-competing
6. estimator/registry data is not a second approval authority; required
   attribution evidence remains available, and recommendation inference is
   skipped when unnecessary
7. uncertain dispatch remains recovery-required and never auto-resends
8. focused tests and typechecks pass across Cleaner, Eviction, Codex adapter,
   and CLI surfaces
9. Gate A and Gate B provide attribution, actual application, authoritative
   outcome, retained evidence, and continuation; safe refusal alone is not
   successful cleaning
10. response-chain rebase remains a separate capability gate
11. no unrelated files, public policy surfaces, credentials, or external runtime
   state are changed

The plan remains `active` until Gate B proves supported application and an
authoritative outcome, or the user explicitly closes it as a capability-blocked
pilot.
