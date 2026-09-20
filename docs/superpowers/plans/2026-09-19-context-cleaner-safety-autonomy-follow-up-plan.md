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
  - components/adapters/codex/src/context-cleaner/bridge.ts
  - components/adapters/codex/src/context-history/effective-history.ts
  - components/adapters/codex/src/context-rewrite/lifecycle-input.ts
  - components/adapters/codex/src/context-rewrite/fallback.ts
  - components/adapters/codex/src/context-rewrite/rebase-request.ts
  - components/adapters/codex/src/context-rewrite/lifecycle-runner.ts
  - components/adapters/codex/src/context-rewrite/estimator-config.ts
  - components/adapters/codex/src/proxy-runtime.ts
  - components/adapters/codex/src/daemon.ts
  - components/adapters/codex/tests/e2e.test.ts
  - components/adapters/codex/tests/config.test.ts
  - components/adapters/codex/tests/context-cleaner-runtime.test.ts
  - components/adapters/codex/tests/context-cleaner-scheduler.test.ts
  - components/adapters/codex/tests/context-rewrite-lifecycle-runtime.test.ts
  - components/adapters/codex/tests/context-rewrite-lifecycle-runner.test.ts
  - components/adapters/codex/tests/context-rebase-pipeline.test.ts
  - components/adapters/codex/tests/daemon.test.ts
  - components/packages/features/eviction/src/lifecycle-planner.ts
  - components/packages/features/eviction/src/task-state-estimator.ts
  - components/packages/features/eviction/tests/lifecycle-planner.test.ts
  - components/presets/tokenpilot/src/policy.ts
  - components/products/cli/src/clean.ts
  - components/products/cli/src/hosts/codex.ts
  - components/products/cli/tests/clean.test.ts
  - components/products/cli/tests/dispatch.test.ts
---

# Context Cleaner Safety and Autonomy Follow-up

## Goal

Harden Context Cleaner for autonomous use without creating a second governance or context-management controller. Fix sole-owner enforcement, claim admission and ownership, claim/cancel arbitration, interrupted-transaction recovery, and approval retry behavior; preserve conservative uncertain-provider recovery; define standing permission in Project OS as a separate canonical policy change.

## Implementation Outcomes

- Selected items are removable only when current attribution proves one owner.
- Claim acquisition, approval replay, and cancellation are atomic per plan.
- Same-selection retries replay existing outcomes; conflicting selections fail closed.
- Uncertain provider dispatch remains recovery-required and is never resent automatically.
- Successful or uncertain provider dispatch never triggers a second generation only
  because local persistence failed.
- Task attribution can update independently from estimator-selected automatic eviction.
- Automatic eviction remains disabled by default until measured pilot evidence proves
  net benefit and acceptable interactive latency.
- Project OS grants narrow standing permission for exclusively owned internal context without expanding authority.

## Current Active Scope

- Completed evidence retained: Tasks 1–4 and 7–8. Their task sections remain
  immutable evidence, not active execution work.
- Task 5: policy is prepared; publication and activation remain separate
  authorized actions and are not required for adapter unit tests.
- Task 6: complete history correctness, operational separation, and then run a
  gated agent-initiated autonomy pilot.
- Task 9: deferred and non-blocking.

## Status Semantics

- `implementation verified`: declared code and focused checks pass.
- `implementation partial`: a bounded delivery passes its focused checks, but
  one or more downstream history, execution, or live-pilot gates remain open.
- `delivery committed`: verified implementation is recorded in Git.
- `policy prepared`: canonical policy and generated surfaces are ready; activation
  has not occurred.
- `policy activated`: standing permission is enabled for its declared scope.
- `pilot validated`: attribution, execution, recovery, and agent-initiated
  behavior meet the three Task 6 evidence gates.


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

## Historical Probe Finding

The first successful TokenPilot-routed probe produced an analyzed plan with no
task IDs. `loadSessionTaskRegistry` intentionally returns an empty registry
when LightRSI has not persisted attribution; the Cleaner preserves all items
as unassigned and fails closed. This does not prove Project OS lacks a task
registry. The missing source is inside LightRSI's attribution producer path.

The shared Cleaner orchestrator now adds `task_registry_unavailable` and marks
the result as fallback-used when attribution is not available. Codex Cleaner
plans also expose `Attribution: disabled|waiting|failing|empty|available`.
The current fresh native two-turn probe reports `waiting`; lifecycle trace
reason `insufficient_pending_turns` shows the estimator was not reached and no
registry writer ran. This historical result does not establish attribution
readiness from a fixed turn count. Focused regression proof covers disabled,
waiting, empty, and available states. No task boundaries are invented and no
unassigned context is exposed for deletion.

Task 6 remains implementation-partial, not verified end to end.
Commit `250648d` plus current uncommitted changes prove stable occurrence
identity for ID-less cumulative items, explicit-head consistency, cumulative
attribution progress, estimator persistence, pending-turn and watermark
diagnostics, ambiguous-history refusal, Cleaner readiness states, and the
existing rebase validation path in focused synthetic/runtime tests. They do
not yet prove a clean native session reaches persisted attribution through the
live host, full-history execution and recovery through a real provider, or
live autonomous cleanup. `task_registry_unavailable` means usable LightRSI
attribution is absent; it does not prove missing Project OS integration.
Project OS supplies policy and retention authority. LightRSI owns attribution
persistence.

Full-history attribution and full-history mutation are separate capabilities.
Attribution may become available before Cleaner can safely apply removal. No
registry edits or Project OS registry writer are authorized by this plan.

The September 20, 2026 live probe enabled `contextRewrite` with no mutation
plan and restarted the supported Codex daemon. A controller-created child task
did not provide clean native traffic: its replay contained orphan
`function_call_output` items for controller operations, and the lifecycle
trace reported `semantic_tool_result_invalid` and
`semantic_tool_closure_incomplete`. Cleaner returned `Attribution: waiting`.
The probe also exposed one shared adapter defect: replayability classifies a
verified `codex_app` host observation as `observation_only`, but semantic
mapping still sends every attributed `function_call_output` through provider
tool closure. The same item shape now has focused red/green regression in
Task 6A. This does not prove every controller follow-up is contamination;
provenance must distinguish host observation from orphan or cross-session
result. Keep strict closure validation and do not synthesize registry state.

The user-created native task supplied on September 20, 2026 produced five
clean ordinary turns in session `codex-synth-8bbf0f2a-27ea-4025-b052-3e0eae03e149`.
Cleaner replay passed semantic validation, but the lifecycle trace deferred
with `insufficient_pending_turns`; `attemptedEstimator` and
`registryPersisted` remained false. This is the configured batching gate
(`batchTurns: 5`) counting pending delta turns, not a fixed visible-prompt
count. No source defect or attribution-writer defect is established. Continue
that native task through its own UI until the estimator is attempted; do not
send follow-ups through controller tools, which can contaminate replay with
orphan tool-result items.

The September 20, 2026 implementation verification passed 484 adapter tests,
108 focused history/bridge/rebase/lifecycle tests, 92 Cleaner tests, 48
eviction tests, 34 CLI tests, adapter and workspace typechecks, CLI build,
and Project OS fast contract validation. A live clean probe against session
`codex-synth-8bbf0f2a-27ea-4025-b052-3e0eae03e149` refused with
`codex_clean_snapshot_incomplete`; journal inspection found mixed native probe
traffic plus a controller `function_call_output` and unresolved tool closure.
This is runtime probe contamination, not evidence of an attribution-writer
defect. Cleaner correctly remains fail-closed.

## Post-Current-Branch Follow-up Verdict

The latest consolidated review is accepted as a bounded follow-up, not a second
architecture. It is reconciled against current branch evidence; live probes are
recorded separately. Each reported defect gets a failing regression proof before
production edits.

Required corrections:

1. `components/adapters/codex/src/context-rewrite/fallback.ts` must distinguish
   pre-dispatch, confirmed rejection, successful dispatch, and uncertain dispatch.
   A completed rebased response followed by local journal or epoch persistence
   failure must not send the original request again.
2. Claim admission must recover pending transaction intent under the existing
   plan lock before admitting a new claim. Reconciled `scheduled` state,
   identity, selection, and ownership remain required.
3. Existing claims require explicit owner-token proof for reuse. Matching
   mutation identity alone never authorizes another process to adopt a claim.
4. Cancellation and selection retries return stored canonical receipts,
   selections, and timestamps. Reordered same-selection retries must not create
   new transaction identity.
5. Estimator observation must be separable from automatic eviction. Reuse the
   existing canonical eviction configuration path if it can express the split;
   do not add a duplicate policy field without proving the existing path cannot.
6. Automatic eviction stays off by default. Preflight, net-benefit, timeout,
   backoff, and batch tuning require measurements before defaults change.

The Project OS policy status must also be verified from its canonical template
and generated surfaces. Do not infer publication from the LightRSI task ledger.

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
- Do not enable automatic cleaning by default or add periodic/threshold triggers.
  Do not add a Cleaner MCP server, a durable Project OS task ledger, a Cleaner
  task mapping registry, cross-Host support, or a second context-management
  engine. An evidence-gated automatic-eviction pilot remains allowed.
- Keep the first integration CLI-driven with explicit session identity. Add a
  programmatic adapter only after a pilot proves the CLI cannot bind the active
  session or enforce eligible task IDs reliably.
- Keep two execution modes without creating a third context-management system:
  normal mode lets one agent plan, implement, verify, and decide when to use
  Cleaner; coordinated mode lets CoS and Herdr assign and reconcile bounded
  worker execution. Cleaner remains session-local in both modes.
- A single session may combine controller and worker activity only when their
  logical task attribution and protected control-plane context are distinct.
  Without that separation, Cleaner fails closed. Keep the production controller
  outside the pilot; a disposable agent session may exercise combined
  controller/worker behavior when the protected control-plane context remains
  distinct.

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
  exposure, provider API or routing changes, or unrelated cache-policy changes.
  The declared full-history adapter transformation and its expected cache
  effects are in scope.

## Coordination State

- Coordination owner: `single lead controller`
- Coordination schema: `2`
- Branch: `main`
- Base commit: `d62f7dc67f7ffc440d0440f06abb4239893662fb`
- Expected workspace: `LightRSI main with committed runtime fixes; Task 6A plan, source, and regression edits remain uncommitted; Project OS uses a separate checkout`
- Next action: `continue Task 6 Delivery B full-history execution/recovery proof; do not broaden host-observation filtering, edit the registry, add a Project OS registry writer, synthesize response IDs, invoke Cleaner mutation manually, or bypass refusal`
- Blockers: `Task 6 remains implementation-partial with clean native attribution, real-provider full-history execution/recovery, stale-plan refresh, and live autonomy unverified`

| Task | State | Workspace | Executor | Depends On | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Task 1 | `completed` | current workspace | `codex` | none | ownership, rejected-claim, retry, race, and recovery-order tests | Cleaner focused tests pass |
| Task 2 | `completed` | current workspace | `codex` | Task 1 | removal-safety and Codex bridge tests | Cleaner and bridge focused tests pass |
| Task 3 | `completed` | current workspace | `codex` | Task 1 | locked approval, claim, and cancellation tests | approval replay and cancel/claim arbitration pass |
| Task 4 | `completed` | current workspace | `codex` | Tasks 2–3 | uncertain-dispatch and receipt recovery tests | Codex targeted suite and typecheck pass |
| Task 5 | `completed` | separate Project OS checkout | `codex` | none | canonical policy and generated-surface verification | policy prepared; canonical standing-permission paragraph added; all adapters synchronized; publication and activation remain separate; unrelated dirty README and files preserved |
| Task 6A | `completed` | current workspace | `codex` | Tasks 2–5, 7–8 | canonical host-observation classification and semantic-mapping regression proof | Shared semantic mapping now reuses replayability classification; focused history/lifecycle/semantic tests 70/70, full adapter suite 485/485, adapter/workspace typechecks, CLI build, and diff check pass |
| Task 6 | `blocked` | current workspace | `codex` | Task 6A and Tasks 2–5, 7–8 | history correctness, operational separation, execution, recovery, and same-session pilot gates | `implementation partial`: cumulative identity, explicit-head handling, attribution progress, watermark diagnostics, focused rebase proof, typechecks, build, adapter/Cleaner/eviction/CLI suites, and contract validation pass; clean native attribution, real-provider full-history execution/recovery, stale-plan refresh, and live autonomy remain unproven; no manual registry edit or mutation permitted |
| Task 7 | `completed` | current workspace | `codex` | Tasks 2–4 | duplicate-generation, claim-fencing, and retry regression proof | focused Codex suites, Cleaner suite, and adapter/Cleaner typechecks pass; no resend after accepted response; owner-token and cancellation fencing regressions pass |
| Task 8 | `completed` | current workspace | `codex` | Task 7 | estimator observation plus approved Cleaner eligibility with automatic eviction disabled | lifecycle planner/runtime suites, eviction suite, adapter/eviction typechecks pass; real Codex lifecycle integration proves registry attribution → selectable task → approval → scheduling → safe execution revalidation; no automatic mutation plan is exposed |
| Task 9 | `pending` | current workspace | `codex` | Task 8 | separate measured performance follow-up | Deferred; not required for Cleaner correctness or first pilot; no supported Codex eviction control exists |

Task 6 remains blocked on unresolved history-correctness, operational-separation,
execution, and pilot gates, not startup binding, CLI session alias resolution,
or snapshot replayability. The historical runtime evidence shows completed
cumulative-history requests with no trusted `previous_response_id`; LightRSI
must prove stable occurrence identity and one shared full-history boundary from
journal item correspondence without synthesizing a response-chain head.
Do not edit registry state manually.
The earlier runtime defect was root-caused: Codex CLI default
resolution ignored `CODEX_SESSION_ID` and selected the shared latest-session
pointer, so a fresh worker could report or clean the controller's TokenPilot
session. The shared Codex resolver now checks the current host-session alias
before global latest fallback; report, visual, clean, and persisted session
resolution all use this path. Red/green dispatch proof and a live worker-alias
report probe pass. The earlier Cleaner defect remains fixed: `handleCleanCommand`
canonicalizes explicit host references before backend analysis; pre-fix tests
failed with the raw alias and `codex_clean_session_not_found`, and focused
post-fix CLI tests pass. The first fresh post-fix Gate B launch was fail-closed by Herdr with
`target_resolution:not_found` and zero eligible candidates. After creating a
fresh shell pane, Gate B bound Codex session
`01a0baee-ff66-76e1-ad67-382675f5e4e4` to TokenPilot session
`codex-synth-284b522b-a594-49d5-a794-5fead4576681`. The agent continued after
Cleaner refusal, but the active snapshot remained incomplete; no plan or
receipt existed, no task was selected, and no mutation or eviction occurred.
Gate B therefore proves binding and safe refusal, not autonomous cleaning.
The completed bound-session recheck also found and fixed a shared replayability
defect: completed `codex_app` `function_call_output` items lack `call_id` by
design, but were classified as deferred tool items. That made complete
snapshots fail closed as `history_deferred_items`. They are now classified as
observation-only only when the stable host-tool shape is present; ordinary
missing-`call_id` tool items remain deferred. Focused replayability tests pass
(14/14), effective-history tests pass (23/23), Cleaner tests pass (92/92), the
full Codex adapter suite passes (477/477), and adapter/CLI typechecks pass.
The fix restores complete-history analysis; it does not invent task attribution
or authorize mutation.
The patched CLI was rebuilt and rerun against the bound session. Read-only
analysis succeeded with `371318` used characters, `37144` protected characters,
and `334174` unassigned characters. Status remained `analyzed` with no selected
task and fallback reason `task_registry_unavailable`; no approval, scheduling,
receipt application, or mutation was attempted.
`task_registry_unavailable` means usable LightRSI attribution is absent; it
does not prove missing Project OS integration. Project OS supplies policy and
retention authority. LightRSI owns attribution persistence.
The same runtime probe found Windows launcher drift in both shared CLI install
paths: extensionless POSIX-style files under `%USERPROFILE%\\.local\\bin` were
discoverable by PowerShell but did not execute. The shared installer now writes
`lightrsi.cmd` and `lightmem2.cmd`, the host installer uses the same launcher
helper for `tokenpilot-codex.cmd` and `tokenpilot-claude-code.cmd`, and stale
extensionless launchers are removed. Installer regression proof and a live
`lightrsi codex clean --status` probe pass; this fixes command dispatch only and
does not change Task 6 eligibility or Cleaner mutation authority.
The follow-up runtime probe found a second defect in the shared Codex streaming
finalizer: `client_abort` and stream-error exits destroyed the upstream stream
before `recordStreamResponse`, leaving the latest request journal state
`pending` even though the provider response had started. That stale state made
Cleaner history diagnostics depend on an un-settled transport lifecycle. The
finalizer now records partial streams as `incomplete` before destroying the
upstream connection; focused regression proof covers client abort, and the
complete adapter suite, typecheck, and fast contract validation pass. This
preserves fail-closed Cleaner behavior for incomplete history; it does not
create eligibility or authorize mutation.
The repeated `response_chain_head_missing` events were historically reproduced
in normal Codex traffic routed through `9Router`. Successful requests arrive at
the LightRSI proxy without `previous_response_id`; the proxy codec preserves
that absence, and prompt-cache session binding still succeeds. This remains a
transport fact, not a reason to add provider routing or a stateless attribution
controller. Full-history attribution and full-history mutation remain separate
capabilities: attribution may become available before Cleaner can safely apply
removal. Do not synthesize a response-chain head or treat the latest snapshot
as ancestry.
The same runtime review found a foreground daemon lock race: lock creation
exposes an empty file before owner metadata is written, so a concurrent caller
could misclassify the active lock as stale and rename it. Invalid or incomplete
owner metadata now fails closed in the shared lock helper, with regression proof
in the daemon suite. Journal locks already use separate freshness checks and
showed no matching defect. This fix prevents competing local runtimes; it does
not create attribution or authorize Cleaner mutation.
The September 20, 2026 five-turn cumulative native probe exposed and verified
one remaining history-reconstruction defect. Provider responses retained stable
item IDs, but later full-history request items omitted provider-only metadata
such as completion status, internal turn metadata, annotations, and reasoning
content normalization. `cumulativeItemKey` incorrectly combined stable IDs with
the full item fingerprint, so valid correspondence failed at the first replayed
assistant item and all attribution remained incomplete. The shared fix uses
`type + id` or `type + call_id` for explicitly identified cumulative items,
retains fingerprint matching for ID-less items, and keeps duplicate-key
rejection. The new regression reproduces the normalized provider shape. Focused
history/lifecycle/Cleaner proof passes 47/47, the live journal now reconstructs
five semantic turns with `semanticComplete: true`, and adapter typecheck passes.
The rebuilt read-only CLI now reaches `Attribution: waiting` and reports
`task_registry_unavailable`; it no longer refuses on incomplete history. This
repairs attribution eligibility only; it does not create registry state, relax
ambiguous-history refusal, or authorize mutation. The remaining wait is a
runtime attribution-producer/batching condition, not another history mismatch.
Project OS launcher now passes Codex `--dangerously-bypass-hook-trust` and
`check_for_update_on_startup=false`; focused launcher tests pass, shared runtime
deployment drift is clean, and a fresh `ctxclean-runtime-probe` accepted the
Gate A task prompt on Codex `0.154.0` while preserving TokenPilot hooks and
assignment evidence. Gate A observed healthy Host traffic through the supported
Codex adapter, but no eligible Cleaner task existed: local plans reported
`taskCount: 0`, receipts had empty `selectedTaskIds`, and the recommendation
provider reported `recommendation_provider_unavailable`. Task 6 remains
blocked until normal LightRSI traffic reaches its attribution producer and
persists eligible task records. Do not manufacture registry state or invoke
Cleaner mutation manually. Tasks 7–8 are complete; Task 5 is policy prepared
and remains unpublished until its
separate checkout is reviewed and committed through its own Git workflow. Task
9 is deferred and does not block Task 6 implementation or unit proof.

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
- Stop for: provider replay, provider API or routing changes, unrelated cache
  policy changes, or new runtime persistence outside existing journals and
  receipts.

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

### Task 6A: Restore controller-compatible semantic history

**Purpose:** Remove one proven adapter inconsistency: verified host
observations are classified as `observation_only` during replayability, then
reclassified as provider tool results during semantic mapping. Preserve strict
closure checks for ordinary, orphaned, cross-session, and misbound tool results.

**Scope:** One shared adapter correction. Do not add middleware, registries,
synthetic response IDs, provider changes, or a second mutation path. Controller
use is not inherently contamination; classify each item from trusted journal
provenance and shape.

**Files And Symbols:**

- `components/adapters/codex/src/context-history/replayability.ts`:
  `codexReplayabilityForItem` and the existing host-observation predicate.
- `components/adapters/codex/src/context-rewrite/semantic-mapping.ts`:
  `allEffectiveItems`, `isIgnorableNonSemanticItem`, and
  `buildCodexRawSemanticTurns`.
- `components/adapters/codex/tests/context-rewrite-semantic-mapping.test.ts`:
  host-observation, orphan-result, and cross-session regression proof.
- `components/adapters/codex/tests/context-history-effective-history.test.ts`:
  journal provenance and item classification evidence when the existing
  boundary supports it.
- `components/adapters/codex/tests/context-rewrite-lifecycle-runtime.test.ts`:
  lifecycle evidence that verified host observations do not block attribution.

**Authority and stop conditions:**

- LightRSI owns classification and semantic mapping. Host journal provenance
  remains authoritative; host observations stay retained and protected.
- Reuse canonical replayability classification. Do not skip every
  `function_call_output`, trust namespace alone, fabricate `call_id`, or
  weaken ordinary provider/client tool closure.
- Stop if exact journal provenance cannot distinguish a verified host
  observation from an orphan or cross-session result. Record evidence and keep
  Cleaner fail-closed.

**Red/green proof:**

1. Inspect one offending journal item before semantic mapping. Record session
   binding, request/turn provenance, type, namespace, `id`, `name`, `call_id`,
   and output shape. Classify it as verified host observation, genuine orphan,
   or cross-session/misbound event.
2. Add a failing test proving a verified `codex_app` host observation without
   `call_id` does not produce `semantic_tool_result_invalid` or
   `semantic_tool_closure_incomplete` and remains absent from semantic tool
   records.
3. Add or retain regressions proving ordinary orphan and cross-session results
   still fail closed.
4. Make semantic mapping reuse the canonical classification. Preserve the
   item in effective history and existing retention/protection evidence.
5. Run focused semantic, history, lifecycle, and adapter checks.

**Exit Criteria:** Verified host observations no longer create false tool
closure errors. Ordinary unmatched or misbound tool results still fail closed.
No changes occur to response-chain mutation, full-history execution, Cleaner
authority, or recovery behavior.

### Task 6: Restore full-history attribution and run gated autonomy pilot

**Purpose:** Make existing Cleaner ownership and execution work for Codex
requests that resend cumulative history without `previous_response_id`, while
preserving fail-closed behavior for ambiguous history and unresolved tool work.

**Task Function:** adapter debugging, backend implementation, regression proof,
and bounded live validation.

**Template Profile:**

- Controller-selected: `normal`

**Validator Profile:**

- Controller-selected: `review`

**Required Skills:**

- `skill-systematic-debugging`
- `skill-test-driven-development`
- `skill-backend-verification`
- `skill-verification-before-completion`
- `skill-code-standards`

**Files And Symbols:**

- `components/adapters/codex/src/context-history/effective-history.ts`:
  `buildCommittedChain`, semantic turn reconstruction, and history reason codes.
- `components/adapters/codex/src/context-rewrite/lifecycle-input.ts`:
  pending-turn calculation and semantic completeness gates.
- `components/adapters/codex/src/context-history/replayability.ts` and
  `components/adapters/codex/src/context-rewrite/semantic-mapping.ts`:
  canonical host-observation classification from Task 6A; do not duplicate it.
- `components/adapters/codex/src/context-cleaner/bridge.ts`:
  `readAttributionStatus` and registry-read ordering.
- `components/adapters/codex/src/context-cleaner/runtime.ts` and
  `components/adapters/codex/src/proxy-runtime.ts`: reuse shared snapshot,
  selection, execution, and receipt validation; modify only after attribution
  proof passes.
- `components/adapters/codex/tests/context-history-effective-history.test.ts`.
- `components/adapters/codex/tests/context-rewrite-lifecycle-runtime.test.ts`.
- `components/adapters/codex/tests/context-cleaner-bridge.test.ts`.
- `components/adapters/codex/tests/context-cleaner-runtime.test.ts`.

**Dependencies:** Task 6A and Tasks 2–5, 7–8. Task 9 remains deferred. No provider,
Project OS registry, manual registry edit, response-ID synthesis, or new
middleware is allowed.

**Authority:**

- Preauthorized local actions: modify the declared Codex history, lifecycle,
  Cleaner bridge, and existing rewrite/rebase paths; add focused regression
  tests; run bounded live diagnostics without mutating registry state.
- Stop for: provider API or routing changes, Project OS registry writes,
  synthetic response IDs, manual registry edits, automatic resend, or any
  mutation without trusted session, ownership, retention, applicability, and
  recovery evidence.

LightRSI owns session interpretation, attribution, selection, execution and
recovery. Project OS supplies policy and retention authority. 9Router remains
responsible only for routing and protocol compatibility.

Cleaner owns selection and validation. Existing Codex rewrite/rebase machinery
applies authorized selections to provider requests. No second mutation engine is
introduced. Full-history attribution proof does not imply full-history mutation
support.

**Safety Result:** Cleaner preserves context when session identity, history,
LightRSI attribution, authorization, or execution support cannot be established.
LightRSI owns task attribution and persistence. Project OS supplies policy and
retention authority; no Project OS registry writer is required. Full-history
Codex/9Router traffic needs reliable semantic-turn reconstruction for
attribution and a separate supported full-history mutation path. Cleaner owns
selection and validation; existing host rewrite/rebase machinery applies
authorized selections. Successful or uncertain dispatch never triggers
automatic resend. Perform autonomous cleanup only after attribution, execution,
and recovery gates pass.

**Boundary Refinements:**

- Treat deterministic observation, model-based attribution, and authorized
  mutation as separate eligible operations. Observation must not require an
  estimator or mutation capability; attribution must not require rewrite
  support; mutation must retain current ownership, retention, applicability,
  protocol-closure, and execution-fencing checks.
- A committed-prefix boundary is the longest contiguous verified turn prefix.
  Every included tool call must have exactly one included result. Malformed,
  unresolved, reordered, ambiguous, or unknown history stops attribution before
  the affected turn; no estimator input, selection, or mutation may cross that
  boundary. The protected suffix remains ordinary context.
- Stale-plan recovery may reanalyze against the current committed boundary and
  reuse valid stored attribution, but it must not silently add targets,
  reinterpret approval, or create a replacement dispatch while an earlier
  dispatch is successful or uncertain. Standing permission may authorize a new
  selection only within its declared scope.
- Keep the existing synchronous lifecycle path until measured evidence shows
  request-latency or lock-contention regression. Do not move remote estimation
  outside the session lock, add a queue, or add a worker under this task. Any
  lock-scope redesign requires a separate approved performance task with
  read/revalidate/CAS/persist proof.

**Delivery Gates:**

- **Delivery A — history correctness:** preserve occurrence identity across
  cumulative resends, resolve explicit heads without changing history format,
  keep host-source correspondence separate from outbound transformation, and
  prove proxy and Cleaner expose identical occurrence IDs and semantic-turn
  membership. Estimator progress is insufficient; at least one genuinely
  selectable completed task must be produced.
- **Delivery B — operational separation and execution:** make observation and
  stored-attribution reads independent from mutation settings, support a
  verified committed prefix without weakening removal checks, and extend the
  existing transaction/rebase machinery for verified cumulative execution.
  Split acceptance into two checks: (B1) observation and stored attribution
  remain usable without estimator or mutation availability; (B2) one approved
  occurrence-bound cumulative removal is applied through existing transaction,
  rebase, claim and recovery machinery.
- **Delivery C — autonomy:** only after A and B pass, prove agent-initiated
  selection, stale-plan refresh, continuation, restart/recovery, cost and
  latency behavior, and no resurrection or automatic resend.

**Steps:**

1. Analyze existing LightRSI attribution before interpreting replayed history.
   Reproduce current behavior with ordinary cumulative-history requests,
   enough committed turns to cross configured batching, and no
   `previous_response_id`. Record reconstructed turn count, pending-turn count,
   history watermark, lifecycle reason codes, estimator calls, registry version
   and CLI attribution state. History replay alone does not establish task
   completion. Preserve the existing response-chain path as baseline.
2. Add a full-history semantic-boundary helper behind the existing adapter
   boundary. Establish correspondence from the host-source history
   representation, not a transformed outbound payload. For each verified
   historical occurrence, reuse its original stable identity; assign identity
   only to newly introduced occurrences. Never globally deduplicate by content.
   Accept cumulative history only when monotonic completed requests, verified
   prefix correspondence, unique item mapping, branch consistency and complete
   relevant tool relationships hold. Compute the longest contiguous verified
   committed prefix; do not discard a valid prefix because a later turn is
   incomplete, but do not attribute across that later turn. A call/result pair
   may span turns, provided both occurrences are inside the selected boundary.
   Ambiguous duplicates, gaps, mixed ancestry or unresolved items must return a
   new explicit refusal reason. Preserve opaque provider items and protocol
   identities; unsupported compaction, edits or branch transitions defer
   cleanup while ordinary forwarding continues.
3. Establish one history-resolution contract for proxy, estimator, Cleaner
   analysis and execution. Resolve history format from journal correspondence,
   then apply an optional explicit committed head as a bound; an explicit head
   must not disable verified cumulative reconstruction. Return one canonical
   history view and occurrence mapping. Keep native `previous_response_id`
   ancestry preferred when present, but do not synthesize a provider
   response-chain head. Add a regression proving proxy and Cleaner agree on
   occurrence IDs and semantic-turn membership for the same cumulative session
   and requested head.
4. Keep source identity and outbound applicability separate. Preserve the
   source occurrence through stabilization, reduction, and rebase mapping; use
   outbound mapping to prove that the selected occurrence can be removed from
   the actual forwarded payload. Refuse ambiguous mapping while ordinary
   forwarding continues. Reuse existing journal representations and the
   context-rewrite backend; do not add a second history snapshot or
   normalization layer.
5. Make attribution observation independent from estimator and mutation
   availability. Rewrite-mode settings, retry/failure settings, and provider
   rewrite capability must not block deterministic observation or new
   attribution when the estimator is available. Load existing registry state
   before checking estimator readiness; valid stored attribution remains
   readable when the estimator is down. Require session identity,
   attribution provenance/version, processed-history watermark,
   current-boundary revision, and unambiguous occurrence mapping for freshness.
   Keep `available`, `waiting`, `failing`, and `disabled` distinct in CLI output.
6. Add focused red/green proof for stable ID-less cumulative occurrences,
   explicit-head consistency, proxy/Cleaner history agreement, default
   batching, estimator persistence, pending-turn and watermark diagnostics,
   independent no-link requests, duplicate item ambiguity, incomplete tool
   relationships, committed-prefix attribution, estimator downtime with valid
   stored attribution, stale-plan refresh without target expansion, invalid
   registry identity, and a genuinely selectable completed task.
7. Select and schedule only after Delivery A attribution proof passes. The active agent
   decides cleanup is useful, selects exclusively owned eligible task IDs,
   obtains the existing approval, and schedules the existing immutable plan.
   Selection does not mutate immediately. Verify that selection plans and
   execution receipts retain occurrence and ancestry evidence, not only content
   fingerprints; add only the minimum field to the existing contract if proof
   shows it is missing. Reordered retries reuse the stored selection and
   receipt.
8. When a plan is stale, read the current verified history, reuse valid stored
   attribution, reanalyze deterministically, and create a new immutable plan.
   Apply standing permission or renewed approval only to the new selection; an
   old approval cannot expand targets. Do not create a replacement dispatch
   while an earlier dispatch is successful or uncertain.
9. Execute only at the existing authorized dispatch boundary. Immediately
   before dispatch, revalidate current history correspondence, occurrence,
   ownership, retention, supported mutation capability, protocol closure and
   session lock. Reapply only a committed removal whose original item
   occurrence maps unambiguously into the current session branch. Never extend
   an approved removal to newly introduced matching content, even when text or
   fingerprints are identical. Reapplication must not reopen an applied plan
   or dispatch another provider request. Existing Codex rewrite/rebase
   machinery applies the approved selection; Cleaner does not mutate provider
   payloads directly.
10. For response-chain requests, retain the existing rebase construction. For
    verified cumulative requests, transform corresponding occurrences in the
    current full-history input before forwarding. Do not filter an occurrence
    from retained history and then append an unfiltered `currentInput` that
    reintroduces it. Both formats use the same validation, claim, receipt and
    recovery machinery; Cleaner does not become a second mutation engine.
11. Recover from interruption using the immutable plan, receipt, claim and
   transaction state, journal, and host execution evidence. A receipt alone may
   be insufficient after interruption. Resolve committed, uncertain, and
   uncommitted outcomes before any later action; never automatically resend
   after successful or uncertain dispatch.
12. Run Gate A with a fresh normal Codex session. Prove exact session binding,
   a trusted committed boundary with no severed tool relationship,
   `Attribution: available`, registry watermark and occurrence alignment, at
   least one selectable completed task, and no mutation during analysis. Verify
   estimator, pending-turn, watermark, and registry evidence, not a fixed
   prompt count.
13. Run Gate B only after Deliveries A and B. The agent
   decides cleanup is useful, selects
   exclusively owned completed work, and invokes Cleaner from the same
   disposable agent session being cleaned. Analyze only a trusted committed
   boundary; keep current instructions and the in-flight cleanup invocation
   protected. Execute at the next eligible boundary, continue the original
   objective without manual terminal intervention, and survive a restart or
   recovery check without automatic resend after successful or uncertain
   dispatch. Verify that removed occurrences do not return on later requests.
   Before Gate B,
   capture a same-workload baseline. Treat functional autonomy and efficiency
   separately: functional pass requires safe continuation and one authoritative
   outcome; efficiency pass requires saved provider input/cost to exceed
   estimator and replay overhead without a material completion-latency
   regression. Record latency, estimator cost, extra upstream calls, cache
   disruption, correctness, and applied savings even when efficiency is not
   accepted. Use explicit pilot thresholds: interactive completion p95 must
   increase by no more than 10% against the same-workload baseline; estimator
   calls must remain bounded to one call per eligible batch; net saved provider
   input tokens must exceed estimator and replay input tokens; attribution-only
   work must add zero extra primary-task completion requests. Estimator calls
   and estimator tokens are measured separately, not counted as primary-task
   generations. One successful autonomy session proves functional behavior
   only; do not accept the p95 criterion without a predeclared comparable
   request sample and recorded sample count.

**Evidence Gates:**

- **History-correctness gate:** cumulative resends preserve occurrence identity,
  explicit heads do not change history format, proxy and Cleaner agree on
  occurrence IDs and semantic-turn membership, and a genuinely completed task
  becomes selectable.
- **Attribution gate:** eligible LightRSI task records persist with automatic
  eviction disabled; `Attribution: available` is backed by current watermark,
  boundary revision, provenance, and occurrence evidence.
- **Operational-separation and execution gate:** observation and valid stored
  attribution remain usable without mutation or estimator availability;
  committed-prefix analysis protects the suffix; the existing Codex
  rewrite/rebase and transaction machinery applies one approved cumulative
  selection after immediate safety revalidation; Cleaner does not introduce a
  second mutation engine.
- **Pilot gate:** one agent-initiated cleanup in the disposable session being
  cleaned survives restart or recovery, verifies removed occurrences do not
  return, and never automatically resends successful or uncertain dispatch.

**Verification:**

```text
pnpm --dir components/adapters/codex test
pnpm --dir components/adapters/codex typecheck
pnpm typecheck
```

Also run the focused history, lifecycle, bridge and Cleaner tests before the
full adapter suite. For live proof, use only the existing CLI:

```text
lightrsi codex clean --session SESSION_ID
lightrsi codex clean --plan PLAN_ID --select TASK_ID[,TASK_ID...]
lightrsi codex clean --status PLAN_ID
```

**Exit Criteria:** Native-chain and proven full-history sessions both produce
correct semantic turns. Valid stored attribution remains readable during
estimator downtime but cannot authorize execution without current watermark and
occurrence proof. The attribution gate shows eligible persisted LightRSI task
records without manual state edits. The execution gate proves the existing
rewrite/rebase path applies one occurrence-bound approved selection at the next
eligible boundary while preserving protected content and tool closure. The
pilot gate proves one disposable agent session can request cleanup, prevents
removed occurrences from returning on later requests, and ensures successful
or uncertain dispatch never triggers automatic resend. Otherwise keep Cleaner
fail-closed and record one concrete missing capability.

**Explicit Deferrals:** Response rejection classification and production-wide
rollout remain separate concerns. Automatic eviction remains disabled. Provider
API changes, routing changes and unrelated cache-policy changes remain out of
scope.

### Task 7: Fix post-dispatch recovery, claim fencing, and retry identity

**Template Profile:**

- Controller-selected: `normal`

**Validator Profile:**

- Controller-selected: `review`

**Required Skills:**

- `skill-systematic-debugging`
- `skill-test-driven-development`
- `skill-backend-verification`
- `skill-code-standards`

**Files and symbols:**

- Add regression proof in `components/adapters/codex/tests/context-rewrite-lifecycle-runtime.test.ts`.
- Add regression proof in `components/adapters/codex/tests/context-rewrite-lifecycle-runner.test.ts`.
- Modify `components/adapters/codex/src/context-rewrite/fallback.ts` only after
  the duplicate-generation reproduction is red.
- Modify `components/adapters/codex/src/context-cleaner/runtime.ts` and
  `components/packages/features/cleaner/src/clean-claim-store.ts` for explicit
  owner-token admission and recovery fencing.
- Modify `components/packages/features/cleaner/src/clean-state-coordinator.ts`,
  `components/packages/features/cleaner/src/clean-receipt-store.ts`, and
  `components/adapters/codex/src/context-cleaner/bridge.ts` for canonical retry
  identity and stored receipt replay.

**Steps:**

- Reproduce a successful rebased provider response followed by `beforeCommit` or
  epoch persistence failure. Assert upstream call count stays one and state is
  `recovery_required` or an equivalent reserved state.
- Trace every caller of `sendOriginalWithFallbackOutcome`; permit original
  fallback only before dispatch, on confirmed provider rejection, or when
  evidence establishes that provider execution did not occur. Preserve uncertain
  dispatch without resend.
- Reproduce pending cancellation intent followed by claim admission. Recover the
  intent under the existing plan lock before reading claim state; assert no
  cancelled-and-claimed state is possible.
- Require explicit owner-token proof when reusing an existing claim. A matching
  claim ID or mutation plan ID without owner proof returns a reserved/recovery
  outcome and cannot dispatch.
- Canonicalize accepted task selection once. Reordered retries return stored
  selection and timestamp; repeated cancellation returns its stored receipt.
- Keep public Cleaner statuses and existing store schemas unchanged unless a
  failing regression proves a schema field is required.

**Verification:**

```text
pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/context-rewrite-lifecycle-runtime.test.ts tests/context-rewrite-lifecycle-runner.test.ts
pnpm --dir components/packages/features/cleaner test
pnpm --dir components/adapters/codex run typecheck
pnpm --dir components/packages/features/cleaner run typecheck
```

**Exit criteria:** Successful or uncertain dispatch never triggers automatic
resend; recovery resolves the outcome before any later action. Pending
cancellation cannot be followed by a new claim; owner-token adoption is
rejected; cancellation and reordered selection retries replay one canonical
transaction identity.

**Authority:**

- Preauthorized local actions: add failing regressions, patch declared recovery
  and claim paths, and run listed checks.
- Stop for: new persistence engines, provider protocol changes, automatic resend,
  public status changes, or unresolved evidence about provider dispatch outcome.

### Task 8: Separate estimator observation from automatic eviction

**Template Profile:**

- Controller-selected: `normal`

**Validator Profile:**

- Controller-selected: `review`

**Required Skills:**

- `skill-central-config-layer`
- `skill-test-driven-development`
- `skill-backend-verification`
- `skill-code-standards`

**Files and symbols:**

- Modify `components/adapters/codex/src/proxy-runtime.ts` to stop hardcoding
  `evictionEnabled: true`; default the Codex lifecycle path to observation-only
  until a supported canonical policy handoff exists.
- Inspect `components/adapters/codex/src/config.ts` and
  `components/presets/tokenpilot/src/policy.ts` to document the current boundary:
  `eviction.enabled` is canonical for TokenPilot policy, but is not currently
  exposed as a public Codex adapter control.
- Prefer the existing coupled lifecycle classification for completed-versus-
  evictable attribution while automatic mutation remains disabled; do not add a
  second registry or policy system. Change `lifecycleMode: "decoupled"` only if
  focused evidence proves the existing classification cannot support safe
  observation without mutation.
- Extend `components/adapters/codex/tests/config.test.ts`,
  `components/adapters/codex/tests/context-rewrite-lifecycle-runtime.test.ts`,
  and `components/adapters/codex/tests/context-rewrite-lifecycle-runner.test.ts`.
- Reuse existing policy definitions in
  `components/presets/tokenpilot/src/policy.ts`; do not add
  `contextRewrite.automaticEvictionEnabled`, a Codex-only `eviction.enabled`, or
  another duplicate policy field.

**Steps:**

- Establish observation-only behavior for Codex: estimator updates task
  registry while lifecycle eviction is disabled, and no mutation plan is
  exposed from this path.
- Keep approved Cleaner scheduling independent from automatic eviction, while
  proving its selection input includes genuinely completed, evictable tasks.
- Verify estimator observation does not require provider replay compatibility when
  no mutation plan will execute.
- Verify automatic eviction remains disabled by default and existing presets do
  not silently change behavior.
- Add an end-to-end regression proving: attribution → completed task →
  evictable/selectable task → approved → scheduled → safely applied, with
  automatic mutation disabled. Do not equate `completed` with `evictable`.
  Also prove registry updates occur with eviction off and no automatic mutation
  plan is applied. Defer enabled-mode wiring and its guard tests until a separate
  policy-boundary design identifies an existing supported handoff.

**Verification:**

```text
pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/config.test.ts tests/context-rewrite-lifecycle-runtime.test.ts tests/context-rewrite-lifecycle-runner.test.ts
pnpm --dir components/packages/features/eviction test
pnpm --dir components/adapters/codex run typecheck
pnpm --dir components/packages/features/eviction run typecheck
```

**Exit criteria:** Task registry attribution updates with automatic eviction
disabled; completed attribution produces an honestly evictable/selectable task
for approved Cleaner use; the approved selection can be scheduled and safely
applied; no automatic removal occurs; no new Codex-only policy field or
unsupported enablement path exists.

**Authority:**

- Preauthorized local actions: remove the unsafe hardcoded enablement, preserve
  observation-only lifecycle behavior, add focused tests, and update owned
  adapter documentation.
- Stop for: duplicate policy fields, a new policy handoff, automatic-eviction
  activation, new governance state, or changes to Cleaner public statuses.

### Task 9: Deferred follow-up — add measured preflight and net-benefit gates

**Template Profile:**

- Controller-selected: `normal`

**Validator Profile:**

- Controller-selected: `review`

**Required Skills:**

- `skill-performance-optimization`
- `skill-test-driven-development`
- `skill-backend-verification`

**Files and symbols:**

- Modify the existing lifecycle admission path in
  `components/adapters/codex/src/proxy-runtime.ts` and
  `components/packages/features/eviction/src/lifecycle-planner.ts` only after
  baseline measurements identify a gate.
- Extend `components/adapters/codex/tests/context-rewrite-lifecycle-runtime.test.ts`
  and `components/packages/features/eviction/tests/lifecycle-planner.test.ts`.
- Record bounded benchmark evidence in existing test output or task evidence;
  do not create a new runtime metrics store.

**Steps:**

- Establish baseline estimator latency, session-lock occupancy, rebase replay
  cost, saved chars/tokens, fallback rate, and request completion latency using
  the existing mock/probe harness.
- Add cheap preflight checks before estimator or mutation work when rewriting is
  disabled, provider capability is known incompatible, or cooldown is active.
- Add net-benefit admission: skip automatic rebase when expected savings cannot
  repay estimator plus replay overhead. Keep registry observation available.
- Bound estimator time and add failure backoff using existing configuration and
  trace fields. Do not move estimation outside the session lock without measured
  contention evidence and a separate approved design.
- Compare batch sizes only after correctness and latency baselines exist.

**Verification:**

```text
pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/context-rewrite-lifecycle-runtime.test.ts
pnpm --dir components/packages/features/eviction exec node --import tsx --test --test-concurrency=1 tests/lifecycle-planner.test.ts
pnpm --dir components/adapters/codex run typecheck
pnpm --dir components/packages/features/eviction run typecheck
```

**Exit criteria:** Deferred until a supported Codex eviction policy boundary
exists and a measured regression justifies new gates. Any future gate needs
before/after evidence, preserves task attribution, does not resend uncertain
work, and meets an explicitly recorded latency and net-benefit threshold.

**Authority:**

- Preauthorized local actions: collect baseline evidence only if a later task
  explicitly activates this follow-up.
- Stop for: unsupported performance claims, speculative optimization, lock
  redesign, transport changes, cache changes, or default activation without
  pilot evidence.

## Verification

Run from LightRSI root after Tasks 1–4; run targeted Codex tests before the full adapter suite:

```text
pnpm --dir components/packages/features/cleaner test
pnpm --dir components/packages/features/cleaner run typecheck
pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/context-cleaner-bridge.test.ts tests/context-cleaner-runtime.test.ts tests/context-cleaner-scheduler.test.ts
pnpm --dir components/adapters/codex test
pnpm --dir components/adapters/codex run typecheck
pnpm --dir components/packages/features/eviction test
pnpm --dir components/packages/features/eviction run typecheck
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
6. Existing transaction, revision, protocol-closure, journal, rewrite, and
   unrelated cache-policy behavior remains unchanged; the declared
   full-history transformation may produce its expected cache effects without
   changing provider or routing policy.
7. Project OS standing permission is canonical and generated surfaces are synced.
8. `skill-verification-before-completion` returns `verified` before changing plan status from `active` to `completed`.
9. Successful or uncertain dispatch never triggers automatic resend; recovery resolves the outcome before any later action.
10. Estimator observation works with automatic eviction disabled, and approved Cleaner remains usable.
11. Any future automatic-eviction gate has measured latency, cost, recovery, and task-correctness evidence.
12. Automatic eviction remains disabled by default until the pilot owner accepts net-benefit evidence.

## Non-Goals

- Automatic periodic or threshold-triggered cleaning.
- Automatic eviction as a default behavior before pilot evidence.
- Cleaner MCP exposure.
- Cleaner task IDs becoming Project OS task IDs.
- Persistent cross-repository mapping or coordination ledger.
- DeepAgents, Tura, Claude, or other Host runtime convergence without separate
  evidence.
- Provider replay after uncertain dispatch.
- Provider API, routing, prompt-cache, or unrelated transport-policy changes.
