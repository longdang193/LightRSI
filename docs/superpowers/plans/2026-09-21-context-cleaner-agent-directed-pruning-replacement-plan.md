---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: active
layer: change
name: context-cleaner-agent-directed-pruning-replacement
targets:
  - components/packages/features/cleaner/src/contracts.ts
  - components/packages/features/cleaner/src/orchestrator.ts
  - components/packages/features/cleaner/src/removal-safety.ts
  - components/packages/features/cleaner/src/task-attribution.ts
  - components/packages/features/cleaner/src/host-execution-bridge.ts
  - components/packages/features/cleaner/src/clean-plan-store.ts
  - components/packages/features/cleaner/src/clean-claim-store.ts
  - components/packages/features/cleaner/src/clean-state-coordinator.ts
  - components/packages/features/cleaner/src/clean-receipt-store.ts
  - components/packages/features/cleaner/src/recovery.ts
  - components/packages/features/cleaner/src/control-service.ts
  - components/packages/features/cleaner/tests
  - components/packages/features/eviction/src/task-update-mapper.ts
  - components/packages/foundation/history/src/types.ts
  - components/packages/foundation/history/src/registry.ts
  - components/adapters/codex/src/context-history/types.ts
  - components/adapters/codex/src/context-history/effective-history.ts
  - components/adapters/codex/src/context-cleaner/bridge.ts
  - components/adapters/codex/src/context-cleaner/runtime.ts
  - components/adapters/codex/src/context-rewrite/backend.ts
  - components/adapters/codex/src/context-rewrite/rebase-request.ts
  - components/adapters/codex/src/context-rewrite/rebase-capability.ts
  - components/adapters/codex/src/context-rewrite/provider-continuation.ts
  - components/adapters/codex/src/proxy-runtime.ts
  - components/adapters/codex/tests
  - components/products/cli/src/clean.ts
  - components/products/cli/src/hosts/cleaner.ts
  - components/products/cli/src/hosts/codex.ts
  - components/products/cli/tests/clean.test.ts
---

# Context Cleaner Agent-Directed Pruning Replacement

## Goal

Replace estimator-first Context Cleaner orchestration with one agent-directed,
evidence-gated pruning workflow. Preserve Host history, occurrence identity,
the existing attribution registry, claim fencing, transaction state, receipts,
and recovery guarantees. Delete redundant readiness and eligibility paths only
after one replacement path proves ordinary cumulative removal.

Older active Cleaner plans are deferred and superseded by this plan:

- `2026-09-19-context-cleaner-history-authority-simplification-plan.md`
- `2026-09-19-context-cleaner-safety-autonomy-follow-up-plan.md`
- `2026-09-21-context-cleaner-attribution-scoped-evidence-plan.md`

Their findings and useful infrastructure remain inputs. They do not own future
execution. This plan is the single Cleaner workflow owner.

## Product Contract

Context Cleaner is an agent-directed, evidence-gated pruning capability for a
bound Host session.

The active agent identifies obsolete internal work. LightRSI resolves that
intent to exact historical occurrences, validates release safety and the full
transformed provider request, applies the approved removal through the normal
Host path, and records durable outcome evidence.

No pre-existing task registry, estimator run, batch threshold, second-model
approval, or globally complete semantic history is required to propose one
pruning operation.

For one-off pruning, the authorized session agent supplies the semantic
judgments that arbitrary history cannot prove: completion, continuing
usefulness, release intent, and retained findings. The immutable plan stores
that operation-specific assertion with exact occurrence references, content
evidence, and provenance. The active Host invocation boundary must establish
the trusted agent/session origin; arbitrary submitted `callerId` or
`authorityRef` strings are metadata, not authority.

## Canonical Ownership

| Concern | Canonical owner |
| --- | --- |
| Session identity, occurrence correspondence, fingerprints, and tool relationships | Host history adapter |
| Reusable context-work attribution | `SessionTaskRegistry` |
| Completion, continuing usefulness, and retained findings for one operation | Authorized session agent under Project OS policy |
| Accepted selection and release intent for one operation | Immutable Cleaner plan |
| Exclusive execution admission | Existing claim and state coordinator |
| Provider dispatch, application, and recovery outcome | Existing execution runtime, transaction records, and receipt |
| Governance and standing permission | Project OS |

No second task ledger, removal ledger, semantic ownership map, or plan-owned
replacement for `SessionTaskRegistry` is allowed.

One-off pruning may carry exact occurrence evidence in the immutable plan. If
that evidence becomes reusable attribution, persist it through the existing
registry writer.

## Workflow

```text
INSPECT → SELECT → RESOLVE → VALIDATE → APPROVE → APPLY → RECEIPT
```

Agent-facing operations:

- `Inspect`: show exact candidate occurrences, uncertainty, dependencies, and savings.
- `Release`: resolve and validate selected occurrences; create immutable plan.
- `Confirm`: execute approved plan through existing claims, dispatch fencing, and recovery.

Existing JSON submission and task-ID commands remain compatibility surfaces only.
They must route through the same new evaluator and transaction boundary. They
must not remain the primary agent workflow.

## Safety Contract

Keep one canonical eligibility decision, but preserve separate owners and
failure semantics:

```text
Trusted agent intent
    ↓
Host occurrence resolution and provenance check
    ↓
Pure Cleaner eligibility evaluator
    ↓
Host-specific transformed-request compiler and format validator
    ↓
Existing claim, transaction, dispatch, and recovery executor
```

The evaluator checks explicit agent evidence against structural protections. It
does not reconstruct a complete task model from arbitrary history, authorize
arbitrary metadata, validate provider wire format, or own dispatch recovery.

Dirty history has three outcomes:

1. Uncertainty outside the outgoing request does not independently block a
   verified selection.
2. Uncertain content permitted by the supported request format remains in the
   request; selected targets and affected relationships are revalidated.
3. A genuine violation of mandatory provider protocol rules defers mutation
   with a precise reason.

One format-aware validation boundary owns this distinction. Backend and request
validator must not retain duplicate blanket `incomplete` refusal policy.

Target-level safety never substitutes for provider-request validity.
`effectiveHistory.incomplete` may stop mutation only when the adapter cannot
prove a valid transformed request. It must not block unrelated verified
selection by itself.

Selection is immutable. Execution records the current Host revision separately
and revalidates selected occurrences, retention decisions, and affected
protocol relationships against that revision. Appended unrelated history,
including Cleaner’s own result arriving after selection, does not invalidate an
otherwise valid selection.

Approval, dispatch, applied commit, and uncertain recovery remain distinct
states. A successful provider dispatch followed by local persistence failure
must never be treated as safe to resend without recovery evidence.

## Execution Approach

- Mode: `inline sequential`
- Coordination: `git-tracked`
- Isolation: Task 1 preflight must either preserve the existing dirty baseline
  explicitly or use a dedicated branch/worktree; implementation must not
  overwrite unclassified user changes
- Executor: `codex`
- Required skills: `skill-systematic-debugging`, `skill-test-driven-development`, `skill-backend-verification`, `skill-code-standards`, `skill-verification-before-completion`
- Commit policy: no commits during implementation unless separately requested
- User approval required for: push, merge, credential changes, destructive recovery, and external provider writes outside declared probes
- Parallel ownership: none; Cleaner contracts, history evidence, and transaction state share ownership
- Order: preflight/baseline → contracts/evaluator → working cumulative pruning → durable continuation/recovery → dirty-history convergence → deletion → live proof

## Coordination State

- Coordination owner: `single lead controller`
- Coordination schema: `2`
- Branch: `main` planning snapshot; implementation branch/worktree must be resolved by Task 1
- Base commit: `4c2fbb6`
- Expected workspace: `main` with existing uncommitted Cleaner source edits and staged plan artifacts; Task 1 must classify and preserve or isolate them
- Next action: obtain approval for real-provider probes, then rerun contract validation after unrelated legacy plan repairs
- Blockers: real-provider write approval; unrelated legacy plan validation failures

| Task | State | Workspace | Executor | Depends On | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Task 1 | completed | current | codex | none | current behavior matrix and caller trace | baseline preserved; revision-stability and no-registry red proofs converted to passing regressions |
| Task 2 | completed | current | codex | Task 1 | one evaluator owns release decisions | exact occurrence evaluator path reuses existing plan/claim/revalidation contracts |
| Task 3 | completed | current | codex | Task 2 | no registry or estimator prerequisite | exact agent-directed release schedules without registry or estimator |
| Task 4 | completed | current | codex | Tasks 2–3 | actual forwarded request loses selected occurrences | cumulative compiler remains single owner; 498 Codex tests pass; offline rebase smoke proves exact removal and continuation |
| Task 5 | completed | current | codex | Task 4 | no duplicate dispatch or resurrection | existing claim, receipt, restart, uncertain-dispatch, and duplicate-dispatch regressions pass |
| Task 6 | completed | current | codex | Tasks 2–5 | deleted paths have replacement coverage | replacement path owns exact occurrence decisions; compatibility paths retain live callers and durable transaction guarantees |
| Task 7 | active | current | codex | Tasks 1–6 | live, backend, regression, performance proof | local Host/provider-bound probes pass; custom provider recommendation probe passes; Codex upstream smoke remains blocked by missing `OPENAI_API_KEY`; contract validation skipped by user instruction |

## Invariants

- Host history remains source of truth for what occurred.
- `SessionTaskRegistry` remains reusable attribution SSOT.
- Cleaner plan stores selection and release intent, not a second task model.
- Claim, state, receipt, and recovery stores remain durable transaction evidence.
- Current Host binding is mandatory for mutation.
- Exact occurrence identity is mandatory for mutation.
- Host-source history and provider-facing history remain distinct; rewriting
  provider input never overwrites source correspondence.
- Committed removal is occurrence-specific; newly introduced identical content
  is not removed by text or fingerprint match alone.
- Unknown or unlocalizable uncertainty preserves affected context.
- Unrelated dirty history does not block independently verified selection.
- Protocol closure and retained findings remain protected.
- No response ID is synthesized.
- No text-only or global substring filtering is allowed.
- No provider-validity guard is removed without direct request-shape proof.
- Short and long sessions use one path; no separate mode-specific implementation.

## Phase Breakdown

### Task 1: Baseline and ownership freeze

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: source inspection, caller tracing, red tests, and plan evidence updates.
- Stop for: provider writes, credential changes, or deletion before replacement coverage.

**Files:**

- `components/packages/features/cleaner/src`
- `components/adapters/codex/src/context-cleaner`
- `components/adapters/codex/src/context-history`
- `components/adapters/codex/src/context-rewrite`
- `components/products/cli/src/clean.ts`
- existing Cleaner and Codex tests

**Steps:**

- Run `git status --short --branch`, `git diff`, and `git diff --cached` before
  edits. Record the existing uncommitted Cleaner edits as accepted baseline or
  isolate implementation in a clean dedicated branch/worktree; never overwrite
  or silently absorb them.
- Trace every caller of `analyzeContextCleanSession`, `approveContextCleanSelection`,
  `evaluateContextCleanRemoval`, `prepareCodexCleanerRebase`, and the provider
  continuation helpers.
- Record current refusal reasons, durable stores, and transaction transitions.
- Confirm local/tracked status of every named Cleaner plan. Keep this plan as
  the sole proposed execution authority; preserve completed/superseded plan
  findings and the old Task 6 document body unchanged.
- Add red integration proof for the target acceptance path before deleting code.

**Proof:**

- caller map and ownership table in plan evidence;
- preflight evidence identifies workspace baseline and implementation isolation;
- current focused suite output;
- red test showing no-registry agent-directed release cannot use current path;
- red test showing current scheduled cumulative path cannot apply removal.

**Stop:** do not delete implementation before replacement boundary is identified.

### Task 2: Contracts and one deterministic evaluator

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: contract, evaluator, and focused test edits in declared files.
- Stop for: second ledger, authority expansion, or mutation bypass.

**Files:**

- `components/packages/features/cleaner/src/contracts.ts`
- `components/packages/features/cleaner/src/removal-safety.ts`
- `components/packages/features/cleaner/src/task-attribution.ts`
- `components/packages/features/cleaner/src/orchestrator.ts`
- `components/packages/features/cleaner/src/host-execution-bridge.ts`
- `components/packages/features/cleaner/tests`

**Steps:**

- Make occurrence references the canonical selection input.
- Keep task IDs optional compatibility metadata, not eligibility authority.
- Add structured evidence dimensions: verified, uncertain, unlocalizable,
  relevant dependencies, retained findings, protocol closure, provenance, and
  selection revision, and execution revision.
- Define stable occurrence identity before compiler changes: identity uses Host
  occurrence provenance plus stable key and ordinal/fingerprint evidence, never
  array positions or text matching alone; repeated identical content remains
  distinct and continuation revalidates count and provenance.
- Store one-off agent completion, usefulness, release intent, and retained
  findings in the immutable plan without turning it into a task registry.
- Refactor `removal-safety.ts` into one evaluator returning normalized selected
  occurrences, eligibility, protected references, reasons, and required
  provider-validation inputs.
- Route both plan creation and execution revalidation through that evaluator.
- Retain `evictable` fields for compatibility, but stop using them as an
  independently managed approval state.
- Bump Cleaner contract schema only when old task-based plans cannot be safely
  interpreted; old plans must become non-executable terminal records rather
  than being silently reinterpreted.

**Proof:**

- active attribution without completion/retention remains persistable;
- no registry and estimator disabled still permit applied cleanup, continuation,
  and restart when the trusted invocation and immutable plan evidence are valid;
- completed work requires release intent and retained evidence for deletion;
- duplicate owners, changed references, dependency conflicts, protocol gaps,
  and unlocalizable uncertainty fail closed;
- plan and execution validation return identical decisions for identical state.

**Stop:** no second evaluator, registry, or selection ledger.

### Task 3: Agent-directed inspect and release

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: Host-bound workflow, CLI adapter, registry-boundary, and focused test edits.
- Stop for: cross-session writes, manual registry mutation, or external provider calls.

**Files:**

- `components/packages/features/cleaner/src/control-service.ts`
- `components/packages/features/cleaner/src/orchestrator.ts`
- `components/packages/features/cleaner/src/clean-plan-store.ts`
- `components/adapters/codex/src/context-cleaner/bridge.ts`
- `components/products/cli/src/clean.ts`
- `components/products/cli/src/hosts/cleaner.ts`
- `components/products/cli/src/hosts/codex.ts`
- related tests

**Steps:**

- Make `Inspect` return exact occurrence candidates and evidence, not only
  registry task summaries.
- Make `Release` accept an agent-selected occurrence set from the bound Host
  session without requiring a pre-existing registry or estimator output.
- Persist reusable attribution through the existing registry writer only when
  requested or needed by later decisions.
- Derive Host binding from Host-owned session context; reject arbitrary caller
  metadata and cross-session submissions.
- Require completion, usefulness, release intent, and retained-findings
  assertions through the trusted Host/session invocation boundary; treat
  unverified `callerId` and `authorityRef` values as diagnostic metadata only.
- Keep old `--submit-attribution` behavior as a compatibility adapter routed
  through the same evaluator.
- Preserve session locks, idempotency, CAS writes, and conflict diagnostics.

**Proof:**

- short and long clean sessions release one exact set without estimator;
- short and long dirty sessions protect uncertain/unrelated items;
- restart preserves attribution and plan identity;
- mutation-disabled or provider-unavailable state still permits safe planning;
- no manual registry file or JSON submission preparation is needed in the
  primary workflow.

### Task 4: Format-aware cumulative apply

**Template Profile:**

- Controller-selected: `high`

**Authority:**

- Preauthorized local actions: local compiler, request-shape, and fixture tests.
- Stop for: real provider writes until local transformed-request proof passes.

**Files:**

- `components/adapters/codex/src/context-history/effective-history.ts`
- `components/adapters/codex/src/context-history/types.ts`
- `components/adapters/codex/src/context-rewrite/rebase-request.ts`
- `components/adapters/codex/src/context-rewrite/backend.ts`
- `components/adapters/codex/src/context-rewrite/rebase-capability.ts`
- `components/adapters/codex/src/proxy-runtime.ts`
- `components/adapters/codex/tests`

**Steps:**

- Expose verified occurrence prefix and uncertainty boundaries without
  declaring later history complete.
- Generalize the existing cumulative `buildForwardedInput()` path. Maintain
  exactly one outbound occurrence-mapping implementation.
- Compile cumulative requests by removing only approved stable occurrence IDs
  from the actual model-facing input.
- Preserve unrelated incomplete tool exchanges and all protected protocol
  pairs.
- Validate the transformed request at one format-aware adapter boundary before
  provider dispatch; permit supported unfinished structures and reject only
  mandatory protocol violations.
- Keep native response-chain rebase as a separate format-aware path.
- Preserve unsupported-format refusal; do not invent fallback response IDs.
- Remove the scheduled-path assumption that every cleanup request has
  `previous_response_id` only for proven cumulative inputs.

**Proof:**

- forwarded cumulative request contains exact `A D` after approving removal of
  `B C` from `A B C D`;
- after `A B C D` becomes `A D`, continuation `A B C D E` becomes `A D E`;
- a newly introduced identical `B` or `C` is retained unless its Host
  occurrence provenance is independently selected;
- unrelated dirty item remains in request;
- missing correspondence, changed selected content, invalid closure, and
  unsupported format preserve request and report concrete reason;
- provider request shape passes adapter validation before any external call.

**Stop:** no provider write until local transformed-request proof passes.

### Task 5: Durable apply, continuation, and recovery

**Template Profile:**

- Controller-selected: `high`

**Authority:**

- Preauthorized local actions: existing claim, receipt, recovery, continuation, and regression edits.
- Stop for: collapsing transaction states or retrying uncertain dispatch without evidence.

**Files:**

- `components/packages/features/cleaner/src/clean-claim-store.ts`
- `components/packages/features/cleaner/src/clean-state-coordinator.ts`
- `components/packages/features/cleaner/src/clean-receipt-store.ts`
- `components/packages/features/cleaner/src/recovery.ts`
- `components/adapters/codex/src/context-cleaner/runtime.ts`
- `components/adapters/codex/src/context-rewrite/provider-continuation.ts`
- `components/adapters/codex/src/proxy-runtime.ts`
- related tests

**Steps:**

- Reuse existing claim, dispatch, host-commit, receipt, and recovery states.
- Record immutable selection revision and current execution revision in applied
  evidence.
- Reapply committed occurrence-specific removal on later requests using
  existing durable plan/receipt state; never filter newly introduced matching
  text globally.
- Recover uncertain dispatch before permitting retry.
- Preserve applied, stale, failed, cancelled, and recovery-required
  distinctions.
- Ensure restart loads committed removal evidence and does not resurrect
  removed occurrences.

**Proof:**

- dispatch success plus local write failure enters recovery, not resend;
- retry after confirmed non-dispatch sends once;
- confirmed dispatch finalizes without duplicate provider request;
- continuation forwards `A D E`, not `A B C D E`;
- Cleaner’s own result appended after selection does not invalidate selection;
- restart reconstructs Host-source correspondence rather than provider-facing
  history and does not resurrect removed occurrences;
- applied receipt reports actual item IDs, revisions, and savings.

**Migration rule:** old analyzed or approved plans may retire only when they
never dispatched. Plans with dispatch started, uncertain outcome, or applied
state retain recovery, receipt, and continuation evidence until settled through
the existing coordinator.

### Task 6: Delete redundant paths

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: deletion after replacement coverage and caller checks pass.
- Stop for: deleting Host/history/transaction guarantees or unresolved live callers.

**Files:**

- Cleaner orchestration and safety files named in Phases 2–5;
- estimator and recommendation integration;
- duplicated lifecycle/readiness tests and compatibility adapters.

**Steps:**

- Remove mandatory estimator-first discovery and batch-threshold gating.
- Remove duplicate eligibility checks after shared evaluator coverage is green.
- Remove reason-code allowlists replaced by structured evidence.
- Remove response-chain-only scheduling assumptions.
- Remove dead task-only selection branches after compatibility tests pass.
- Do not remove durable claim, receipt, recovery, or lock mechanisms.
- Do not delete or terminalize old plans with uncertain dispatch during
  migration; route them through recovery or preserve them as non-executable
  evidence after settlement.

**Proof:**

- `rg` confirms deleted symbols have no live callers;
- replacement evaluator and transaction path cover every retained behavior;
- old compatibility inputs either route through replacement or fail with a
  concrete terminal reason;
- no new ledger or duplicate owner remains.

### Task 7: Full verification and handoff

**Template Profile:**

- Controller-selected: `review`

**Authority:**

- Preauthorized local actions: declared local verification, sanitized probes, and evidence recording.
- Stop for: missing backend proof, failed safety checks, or unapproved Git disposition.

**Required checks:**

```text
pnpm --dir components/packages/features/cleaner test
pnpm --dir components/packages/features/cleaner run typecheck
pnpm --dir components/packages/features/eviction test
pnpm --dir components/packages/features/eviction run typecheck
pnpm --dir components/adapters/codex test
pnpm --dir components/adapters/codex run typecheck
pnpm --dir components/products/cli test
pnpm --dir components/products/cli run typecheck
pnpm --dir components/products/cli run build
git diff --check
python "$HOME/.agents/project-os/scripts/validate_repo_contracts.py" --repo-root . --fast
```

**Live probes:**

- short clean session;
- long clean session;
- short dirty session;
- long dirty session;
- no pre-existing registry;
- estimator disabled;
- cumulative apply;
- Cleaner result appended after selection;
- continuation after removal;
- restart after removal;
- uncertain dispatch recovery;
- duplicate-dispatch prevention.

Backend proof must exercise the nearest real Host/provider boundary, assert
forwarded request content and durable state, and record dependency/auth/runtime
limitations. Synthetic Cleaner receipts alone do not satisfy completion.

Live probe evidence: Cleaner bridge and exact-occurrence execution probes passed
39/39; runtime Host/provider-bound probes passed 11/11; rebase pipeline probes
passed 16/16; offline mock smoke passed with exact removal, retained-content,
five-turn continuation, restart, fallback, and module-matrix evidence. The real
provider probe was attempted through canonical `tokenpilot.env` resolution and
stopped before network dispatch because `OPENAI_API_KEY` is absent. The custom
provider configured in `~/.codex/tokenpilot.env` passed both task-state
estimation and Context Cleaner recommendation probes using model `combo-high`,
with sanitized usage evidence. No external Codex provider write was attempted.
Contract validation is intentionally skipped for this run.

## Acceptance Matrix

| Scenario | Required result |
| --- | --- |
| No registry and estimator disabled | Agent can apply exact pruning, continue, and restart without hidden registry/estimator prerequisite |
| Short and long sessions | One symmetric workflow |
| Uncertainty outside outgoing request | Does not independently block verified selection |
| Supported unfinished request content | Preserved and validated without blanket incomplete-history refusal |
| Mandatory protocol violation | Mutation defers with precise reason |
| Unrelated dirty history | Dirty content remains protected and does not block verified selection |
| Cleaner result after selection | Selection remains immutable; execution revalidates against newer revision and applies |
| Changed selected occurrence | Plan becomes stale; no mutation |
| Dependency or protocol conflict | Plan rejected with concrete reason |
| Cumulative request | Exact approved occurrences absent from forwarded request |
| Response-chain request | Supported rebase path only; otherwise preserve request |
| Continuation | Removed occurrences do not return |
| Restart | Committed removal remains effective |
| Uncertain dispatch | Recovery resolves state before retry |
| Duplicate dispatch | Provider receives at most one request for committed operation |
| Savings and latency | Measure input-token savings, cached-token impact, validation latency, and repeated validation cost; safe no-op allowed |

## Non-Goals

- New Host history store.
- New attribution or removal ledger.
- Synthesized response IDs.
- Text-only global filtering.
- Cross-host identity convergence.
- Project OS permission redesign.
- Automatic periodic eviction.
- Broad task merging or semantic task splitting beyond selected occurrences.
- Deleting transaction evidence because current features appear unreliable.

## Completion Criteria

1. Agent-directed pruning works without pre-existing attribution or estimator,
   including applied cleanup, continuation, and restart.
2. One deterministic eligibility evaluator owns release decisions; Host request
   compilation and transaction/recovery remain separate owners.
3. Host history and `SessionTaskRegistry` remain SSOTs for their concerns.
4. Actual cumulative provider request loses exactly selected occurrences.
5. Response-chain behavior remains format-aware and fail-closed.
6. Continuation and restart do not resurrect committed removals.
7. Uncertain dispatch cannot cause unsafe duplicate provider requests.
8. Existing claims, receipts, locks, and recovery remain durable and distinct.
9. Redundant orchestration paths are deleted only after replacement proof.
10. Short and long sessions use the same workflow.
11. Focused tests, full suites, typechecks, build, live probes, and contract
    validation pass; performance evidence reports savings and cache/latency
    impact without requiring a fixed minimum for short sessions.

## Handoff

After approval, activate Phase 1 only. Do not begin deletion or provider writes
before red acceptance tests and ownership trace are recorded. Git disposition,
push, merge, and publication remain separate approvals.
