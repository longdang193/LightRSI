---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: superseded
layer: change
---

# Context Cleaner Attribution and Scoped-Evidence Prerequisite

## Goal

Establish independently usable attribution and target-scoped historical
evidence for short and long Codex sessions. Enable Host-bound agent
reconciliation without estimator or mutation prerequisites while preserving
fail-closed mutation safety. Produce the prerequisite evidence contract for
one later end-to-end removal, without claiming that removal here.

Existing `Task 6` in
`docs/superpowers/plans/2026-09-19-context-cleaner-safety-autonomy-follow-up-plan.md`
is explicitly out of scope. Do not expand or close it here.

## Scope Correction

This plan implements the prerequisite for one successful removal, not the
removal itself.

- Use one exact, independently verified occurrence set as first delivery.
- Keep `effectiveHistory.incomplete` mutation refusal until an adapter proves
  the complete transformed provider request is executable.
- Derive eligibility from completion evidence, explicit agent release intent,
  exclusive ownership, retention, dependencies, and supported operation.
- Keep `evictable` as a compatibility field until a later migration proves it
  is safe to stop requiring it.
- Do not build broad partial-task selection, automatic eviction, or lifecycle
  state replacement here.

## Implementation Outcomes

### 1. Independent attribution lifecycle

An active, Host-bound agent can reconcile verified occurrences and persist task
ownership through the existing `SessionTaskRegistry` writer even when:

- the session ends before `batchTurns`;
- the estimator is disabled, unavailable, deferred, or fails;
- automatic eviction is disabled;
- provider mutation is unsupported or unavailable.

Attribution requires verified occurrence identity and ownership only. Lifecycle
completion evidence and release eligibility remain separate properties. Unknown
retention prevents deletion, not attribution persistence.

No second ledger, synthesized task system, or empty registry bookkeeping is
added.

### 2. Shared scoped history evidence

History reconstruction exposes verified evidence and uncertainty boundaries in
one runtime assessment. Cleaner, agent reconciliation, lifecycle attribution,
and later mutation validation consume that assessment instead of maintaining
reason-code allowlists.

Localized uncertainty protects affected occurrences and dependent work.
Unlocalizable uncertainty preserves context and prevents mutation.

### 3. Durable prerequisite proof

Focused regression tests, backend boundary checks, and local live probes prove
short-session attribution, dirty-session isolation, restart persistence,
multiple-owner rejection, and fail-closed handling of unscoped journal defects.

An accepted attribution, analyzed plan, or scheduled receipt is not an
end-to-end success claim. Cumulative provider execution, continuation, and
no-resurrection remain deferred to Task 6.

## Baseline and Remaining Defects

The completed governed-reconciliation work already covers registry
serialization, exact occurrence ownership, retention/dependency intent,
localized uncertainty cases, sparse processed coverage, and short/long
synthetic-session tests. This plan does not recreate those capabilities.

Remaining defects to prove and patch:

| Existing capability | Remaining defect |
| --- | --- |
| `submitAttribution()` | Not proven through ordinary agent-controlled Cleaner workflow in short and dirty sessions |
| Scoped history protection | Consumers still contain separate reason-code and completeness gates |
| Registry persistence | Automatic production remains conditional on estimator/runtime branches |
| Sparse processed coverage | Does not prove reusable occurrence evidence after unrelated history growth |
| Agent decision persistence | Host-bound authority and scoped freshness need direct proof |
| Synthetic Cleaner execution | Does not prove cumulative-provider mutation; that remains Task 6 |

Direct bridge submission, idempotency, and existing completed tests are
baseline evidence, not new red tests. New tests must fail on missing workflow
integration or missing behavior, not repeat passing unit coverage.

## Execution Approach

- Mode: `inline sequential`
- Coordination: `git-tracked`
- Required skills: `skill-systematic-debugging`, `skill-test-driven-development`, `skill-backend-verification`, `skill-code-standards`, `skill-verification-before-completion`
- Isolation: `current workspace`
- Commit policy: `no commits during execution`; user approves Git disposition separately
- Preauthorized local actions: edit declared LightRSI source/tests/docs, run declared local checks, run sanitized local live probes, and update this plan's task evidence
- User-approval actions: push, merge, publication, destructive recovery, provider credential changes, and any Task 6 execution work
- Parallel ownership: none; shared history evidence and registry paths require one sequential owner
- Sequential fallback: Task 1 tests → Task 2 evidence model → Task 3 attribution path → Task 4 diagnostics/probes → final verification

## Coordination State

- Coordination owner: `single lead controller`
- Coordination schema: `2`
- Branch: `main`
- Base commit: `4c2fbb6`
- Expected workspace: `main with this active plan and in-progress Task 1/Task 2 source and test edits`
- Next action: `finish Task 1 workflow coverage, then activate Task 2`
- Blockers: `Task 6 remains deferred; real-provider cumulative mutation and recovery are not part of this plan`

| Task | State | Workspace | Executor | Depends On | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Task 1 | `active` | current | `codex` | none | red/green regression tests for short-session attribution and scoped uncertainty | tests added; workflow coverage still required |
| Task 2 | `pending` | current | `codex` | Task 1 | shared verified-prefix and uncertainty-boundary assessment | contract fields started; history producer still required |
| Task 3 | `pending` | current | `codex` | Tasks 1–2 | agent submission persists through disabled/deferred estimator and mutation states | pending |
| Task 4 | `pending` | current | `codex` | Tasks 2–3 | diagnostics and local live probes across short/long clean/dirty sessions | pending |
| Task 5 | `pending` | current | `codex` | Task 4 | full relevant suites, typechecks, contract validation, verification report | pending |

## Invariants and Boundaries

- Project OS owns standing permission and retention policy.
- Host adapter owns session identity and occurrence identity.
- History adapter owns correspondence and uncertainty assessment.
- Active agent owns semantic completion and retention decisions.
- `SessionTaskRegistry` remains attribution SSOT.
- Cleaner owns selection, dependency checks, mutation, and recovery.
- First delivery selects one exact occurrence set; broader subset selection is deferred.
- Attribution and selection may use scoped evidence; mutation still requires a
  provider-valid complete transformed request.
- Missing Host binding, occurrence proof, or mutation support
  preserves context and ordinary work.
- Missing completion or retention evidence blocks selection/deletion, not
  attribution persistence.
- A partial observation result never authorizes mutation by itself.
- No response ID is synthesized.
- No manual registry edits, direct mutation calls, or bypassed refusals.

## Task Breakdown

### Task 1: Add failing regression proof for independent attribution

**Template Profile:**

- Controller-selected: `normal`

**Validator Profile:**

- Controller-selected: `review`

**Required Skills:**

- `skill-systematic-debugging`
- `skill-test-driven-development`
- `skill-backend-verification`

**Files:**

- `components/adapters/codex/tests/context-cleaner-bridge.test.ts`
- `components/adapters/codex/tests/context-rewrite-lifecycle-input.test.ts`
- `components/adapters/codex/tests/context-rewrite-lifecycle-runtime.test.ts`
- `components/packages/features/cleaner/tests/orchestrator.test.ts`
- `components/products/cli/tests/clean.test.ts`

**Steps:**

- Do not duplicate the existing direct bridge test for empty-registry
  submission and idempotent replay. Add a CLI/Host workflow test proving a
  short session reaches reconciliation without manual registry-file handling.
- Add an active-task attribution fixture without completion or retention
  decisions. Assert ownership persists while selection remains non-eligible.
- Add a mutation-disabled and estimator-disabled fixture proving explicit
  reconciliation persists independently of rewrite readiness.
- Add a dirty-session fixture with one unrelated unresolved tool occurrence.
  Assert clean occurrence attribution is accepted and uncertain occurrence
  attribution is rejected by exact ID.
- Add a current-session binding fixture proving caller metadata cannot submit
  attribution for another Host session.
- Add a duplicate-owner fixture asserting one occurrence cannot be assigned to
  two task IDs in one or multiple submissions.
- Add a corrective-reconciliation fixture if the current registry patch
  contract supports it; assert affected relationships are replaced without
  leaving stale ownership. If unsupported, record the limitation instead of
  inventing merge/split semantics.
- Add an ordinary-history-growth fixture proving unchanged referenced
  occurrences remain reusable after unrelated history is appended.
- Add a fixture for each currently observed unscoped journal defect and assert
  snapshot/mutation remains fail-closed.

**Verification:**

```text
pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/context-cleaner-bridge.test.ts tests/context-rewrite-lifecycle-input.test.ts tests/context-rewrite-lifecycle-runtime.test.ts
pnpm --dir components/packages/features/cleaner exec node --import tsx --test --test-concurrency=1 tests/orchestrator.test.ts
```

**Exit criteria:** New workflow, retention-free attribution, Host-binding, and
history-growth tests fail on current behavior where the defect is reproduced;
already-passing direct bridge tests are not counted as new proof. Existing
protected-item and ownership tests remain green.

**Authority:**

- Preauthorized local actions: add declared failing tests and run focused local checks.
- Stop for: weakening fail-closed behavior, adding a second registry, or changing Task 6.

### Task 2: Introduce one scoped evidence assessment

**Template Profile:**

- Controller-selected: `normal`

**Validator Profile:**

- Controller-selected: `review`

**Required Skills:**

- `skill-systematic-debugging`
- `skill-test-driven-development`
- `skill-code-standards`

**Files:**

- `components/adapters/codex/src/context-history/effective-history.ts`
- `components/adapters/codex/src/context-history/types.ts`
- `components/adapters/codex/src/context-rewrite/semantic-mapping.ts`
- `components/packages/features/cleaner/src/contracts.ts`
- `components/packages/features/cleaner/src/token-accounting.ts`
- `components/adapters/codex/tests/context-history-*.test.ts`
- `components/adapters/codex/tests/context-rewrite-semantic-mapping.test.ts`
- `components/packages/features/cleaner/tests/token-accounting.test.ts`

**Steps:**

- Extend the existing runtime evidence contract, or the smallest existing
  shared type boundary, with these derived dimensions: verified occurrences,
  uncertain occurrences, unresolved boundaries, unlocalizable uncertainty,
  revision, and provenance. Do not create a persistent region ledger or a
  second history representation.
- Change cumulative reconstruction to expose a verified prefix and the first
  uncertain boundary when a later turn-order or cumulative-prefix check fails.
  Do not mark turns after that boundary verified merely because they are
  present in the journal.
- Keep complete mutation correspondence separate from observation/attribution
  evidence. A verified prefix may support inspection and reconciliation but may
  not authorize a rebase or provider mutation.
- Derive protected item IDs from the uncertainty boundary and existing blocked
  turn mapping. If occurrence scope cannot be proven, return unlocalizable
  evidence and preserve all context.
- Replace scattered reason-prefix decisions with this shared assessment.
  Reason codes remain diagnostics, not authorization policy.
- Define consumer requirements explicitly: inspection needs readable history;
  reconciliation needs verified target occurrences and Host binding; estimator
  needs verified eligible semantic input; selection needs attribution,
  lifecycle, retention, and dependency evidence; mutation needs exact target
  mapping and a provider-valid current request.

**Verification:**

```text
pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/context-history-effective-history.test.ts tests/context-rewrite-semantic-mapping.test.ts
pnpm --dir components/packages/features/cleaner exec node --import tsx --test --test-concurrency=1 tests/token-accounting.test.ts
```

**Exit criteria:** Verified prefixes remain available for observation and
reconciliation; later regions remain unverified until independently proven;
uncertain regions remain protected; incomplete or unlocalizable correspondence
cannot produce a mutation-ready snapshot.

**Authority:**

- Preauthorized local actions: modify declared evidence types and history mapping, then run focused regression checks.
- Stop for: synthesizing correspondence, treating a prefix as a complete chain, or changing provider execution.

### Task 3: Decouple agent attribution from estimator and mutation readiness

**Template Profile:**

- Controller-selected: `normal`

**Validator Profile:**

- Controller-selected: `review`

**Required Skills:**

- `skill-test-driven-development`
- `skill-backend-verification`
- `skill-code-standards`

**Files:**

- `components/adapters/codex/src/context-cleaner/bridge.ts`
- `components/adapters/codex/src/context-rewrite/lifecycle-input.ts`
- `components/adapters/codex/src/context-rewrite/lifecycle-runner.ts`
- `components/packages/features/cleaner/src/control-service.ts`
- `components/packages/features/cleaner/src/contracts.ts`
- `components/adapters/codex/tests/context-cleaner-bridge.test.ts`
- `components/adapters/codex/tests/context-rewrite-lifecycle-runtime.test.ts`
- `components/products/cli/src/clean.ts`
- `components/products/cli/tests/clean.test.ts`

**Steps:**

- Reuse the shared evidence assessment in `readCleanSnapshot()` and
  `submitAttribution()`.
- Keep attribution and eligibility distinct: active attribution may persist
  without completion or retention decisions, while removal eligibility derives
  those decisions from the canonical registry and explicit agent intent.
- Permit valid agent reconciliation when estimator is disabled, below batch
  threshold, unavailable, or mutation is disabled. Registry persistence still
  requires Host session binding, exact occurrence identity/ownership evidence,
  and version-safe writes. Completion and retention decisions remain optional
  attribution fields and become mandatory only for selection/deletion.
- Derive or verify caller/session binding through Host-owned session context;
  non-empty caller metadata alone is insufficient.
- Preserve existing idempotency, session lock, registry CAS, shared-occurrence
  rejection, and stale-evidence checks.
- Replace session-wide revision rejection for attribution with scoped freshness:
  carry or derive expected fingerprints/provenance for referenced occurrences,
  rebuild current history, and accept unchanged referenced occurrences after
  unrelated history growth. Reject branch changes, identity drift, missing
  correspondence, changed referenced items, and invalid dependencies. Keep
  current full revision validation for mutation plans.
- Keep estimator output flowing through the same registry patch boundary. Do
  not give estimator output authority over explicit valid agent decisions.
- Add separate automatic-attribution acceptance: when the estimator is enabled,
  valid output persists with rewrite disabled or provider mutation unavailable.
  A reserved manual Cleaner schedule may own its next request, but its trace
  must explain the deferral and the next eligible request must not starve
  attribution indefinitely.
- Do not remove the backend incomplete-history guard yet. It remains required
  until a later Task 6 execution design proves target-scoped provider safety.

**Verification:**

```text
pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/context-cleaner-bridge.test.ts tests/context-rewrite-lifecycle-runtime.test.ts
pnpm --dir components/packages/features/cleaner exec node --import tsx --test --test-concurrency=1 tests/control-service.test.ts tests/orchestrator.test.ts
```

**Exit criteria:** Agent attribution persists for an active task without
completion or retention decisions; restart retains it; unrelated history growth
does not invalidate unchanged referenced occurrences; invalid binding, changed
referenced evidence, uncertain occurrence, and multiple-owner submissions
remain rejected. Separate automatic-attribution proof shows estimator output can
persist without provider mutation readiness.

**Authority:**

- Preauthorized local actions: edit declared attribution and lifecycle paths, update focused tests, and run backend boundary checks.
- Stop for: provider calls, mutation bypasses, registry schema duplication, or authority expansion.

### Task 6 Handoff: separate end-to-end removal plan

This plan hands off the following unresolved proof to the existing Task 6
plan. Do not implement or close it here:

1. Normal cumulative Codex/9Router request contains less obsolete context.
2. Provider accepts the transformed request without synthesized response IDs.
3. Current instructions and dependencies survive continuation.
4. Restart does not resurrect removed occurrences.
5. Applied receipt reports actual savings and final revision.

Task 6 starts only after Tasks 1–5 pass and uses this plan's persisted
attribution and scoped-evidence contracts as prerequisites.

### Task 4: Clarify producer diagnostics and run bounded live probes

**Template Profile:**

- Controller-selected: `normal`

**Validator Profile:**

- Controller-selected: `review`

**Required Skills:**

- `skill-backend-verification`
- `skill-verification-before-completion`

**Files:**

- `components/adapters/codex/src/context-rewrite/lifecycle-runner.ts`
- `components/adapters/codex/src/context-cleaner/bridge.ts`
- `components/products/cli/tests/clean.test.ts`
- existing sanitized lifecycle trace/test fixtures only

**Steps:**

- Reuse existing `attemptedEstimator`, `pendingTurnCount`,
  `registryPersisted`, registry versions, and refusal reason fields.
- Distinguish in diagnostics between not configured, not attempted, threshold
  deferred, attempted failure, rejected output, persisted attribution, and
  mutation unavailable. Do not create a new persistent status store.
- Test agent reconciliation and automatic estimator attribution as separate
  contracts. Agent reconciliation must work without estimator availability;
  automatic attribution may require an enabled estimator but must not require
  provider-compatible mutation.
- Probe four bounded cases through local LightRSI runtime: short clean,
  long clean, short dirty, and long dirty. Include restart after attribution
  persistence. Keep local mock-provider integration evidence separate from any
  real external-provider evidence.
- Record counts for snapshot readability, protected occurrences, attribution
  persistence, selectable tasks, and mutation refusal reason.
- Treat missing external credentials as runtime-unavailable evidence, not as a
  product pass. Real-provider mutation remains outside this plan and belongs to
  Task 6. Do not widen authentication or provider access.

**Verification:**

```text
pnpm --dir components/adapters/codex run doctor:codex
pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/context-rewrite-lifecycle-runtime.test.ts tests/context-cleaner-bridge.test.ts
```

**Exit criteria:** Live output explains why attribution is or is not available;
agent and automatic producer outcomes are distinguishable; short and long
sessions use the same decision contract; dirty regions stay protected; local
probes do not claim real-provider execution and never invoke Cleaner mutation
manually.

**Authority:**

- Preauthorized local actions: run sanitized local probes and update task evidence with observed results.
- Stop for: credential changes, external provider writes, real-provider mutation, or Task 6 expansion.

### Task 5: Full verification and handoff

**Template Profile:**

- Controller-selected: `normal`

**Validator Profile:**

- Controller-selected: `review`

**Required Skills:**

- `skill-verification-before-completion`
- `skill-backend-verification`

**Files:**

- changed files from Tasks 1–4
- `docs/superpowers/plans/2026-09-21-context-cleaner-attribution-scoped-evidence-plan.md`

**Steps:**

- Review diff for SSOT violations, duplicate ownership paths, new global gates,
  synthesized IDs, and accidental Task 6 changes.
- Run focused suites first, then full relevant suites and typechecks.
- Run repository contract validation and `git diff --check`.
- Record fresh evidence and leave plan status proposed until explicit approval
  and execution completion.

**Verification:**

```text
pnpm --dir components/packages/features/cleaner test
pnpm --dir components/packages/features/cleaner run typecheck
pnpm --dir components/adapters/codex test
pnpm --dir components/adapters/codex run typecheck
pnpm --dir components/packages/features/eviction test
pnpm --dir components/packages/features/eviction run typecheck
pnpm --dir components/products/cli test
pnpm --dir components/products/cli run typecheck
pnpm --dir components/products/cli run build
git diff --check
python "$HOME/.agents/project-os/scripts/validate_repo_contracts.py" --repo-root . --fast
```

**Exit criteria:** All declared checks pass; fresh probes support the acceptance
criteria; no Task 6 code or evidence is claimed as complete; verification skill
returns `verified` before any plan status transition.

**Authority:**

- Preauthorized local actions: run declared verification and record evidence.
- Stop for: failed safety checks, missing fresh evidence, unrelated regressions, or any request to close Task 6.

## Verification

Required evidence:

- Red/green focused tests for every changed behavior.
- Direct bridge proof for attribution persistence, idempotency, stale evidence,
  session binding, and multiple-owner rejection.
- Direct history proof for verified-prefix exposure and unlocalizable refusal.
- Restart proof showing registry durability.
- Local live probes covering short/long and clean/dirty sessions.
- Full relevant suites, typechecks, build, contract validation, and diff check.

Not required by this plan:

- Real-provider cumulative mutation.
- Missing `previous_response_id` execution.
- Provider recovery after mutation dispatch.
- Same-session post-clean continuation.

Those remain Task 6 evidence gates.

## Acceptance Matrix

| Scenario | Required result |
| --- | --- |
| Short clean session | Agent reconciles one active or completed work item without estimator inference; retention may remain unknown |
| Long clean session | Existing attribution is reused; only missing or changed evidence is processed |
| Short dirty session | Independently verified occurrences are attributable; uncertain occurrences remain protected |
| Long dirty session | Verified earlier work remains attributable despite unrelated historical defects |
| Estimator disabled | Explicit agent reconciliation persists |
| Mutation disabled | Attribution remains readable and persisted |
| Automatic producer enabled | Valid estimator output persists without provider-compatible mutation readiness |
| History grows | Unchanged referenced occurrences survive scoped freshness validation; changed or unlocalizable evidence is rejected |
| Restart | Same Host session retains attribution and exact occurrence relationships |
| Conflicting ownership | Accidental collisions fail; supported authorized corrections reconcile consistently |
| Unlocalizable uncertainty | Attribution and mutation requiring affected evidence remain blocked |
| Cumulative execution | Explicitly unproven here; existing Task 6 remains deferred and implementation-partial |

## Completion Criteria

1. Agent attribution persists independently of estimator scheduling and mutation readiness; retention is not required for attribution.
2. Existing `SessionTaskRegistry` remains the only persisted attribution SSOT.
3. Host session binding is verified, not accepted from arbitrary non-empty metadata.
4. Localized history defects protect exact affected occurrences only.
5. Unlocalizable history defects preserve context and prevent mutation.
6. Verified cumulative prefixes support observation but never authorize incomplete mutation.
7. Estimator and agent submissions use one registry validation and persistence boundary.
8. Attribution freshness is scoped to referenced occurrences and relevant
   dependencies; mutation freshness remains current-plan/revision strict.
9. Automatic attribution and agent reconciliation have separate acceptance proof.
10. Short and long sessions follow the same symmetric contract.
11. Focused tests, backend checks, live probes, full relevant suites, typechecks,
   build, and repository contract validation pass.
12. Provider mutation remains fail-closed when transformed-request validity is
    unproven.
13. Task 6 remains unchanged, deferred, implementation-partial, and explicitly
    unclaimed by this plan.

## Non-Goals

- Cumulative full-history provider mutation or recovery.
- End-to-end removal, continuation, and no-resurrection proof.
- Synthesized response IDs.
- Manual registry edits or a second task/region ledger.
- Lowering `batchTurns` as the primary fix.
- Automatic eviction defaults or periodic cleaning.
- Removing `evictable` as a compatibility field.
- New provider authentication, routing, prompt-cache, or transport policy.
- Project OS standing-permission redesign.
- Cross-host session identity convergence.
