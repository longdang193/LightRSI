---
artifact_type: plan
contract_version: "1"
template_id: implementation-plan
status: active
layer: change
name: context-cleaner-format-aware-convergence
targets:
  - components/packages/features/cleaner/src/contracts.ts
  - components/packages/features/cleaner/src/removal-safety.ts
  - components/packages/features/cleaner/src/host-execution-bridge.ts
  - components/packages/features/cleaner/src/orchestrator.ts
  - components/packages/features/cleaner/src/control-service.ts
  - components/packages/features/cleaner/src/clean-store-support.ts
  - components/packages/features/cleaner/src/clean-state-coordinator.ts
  - components/packages/features/cleaner/src/recovery.ts
  - components/adapters/codex/src/context-cleaner/runtime.ts
  - components/adapters/codex/src/context-cleaner/applied-receipt.ts
  - components/adapters/codex/src/context-cleaner/bridge.ts
  - components/adapters/codex/src/context-rewrite/types.ts
  - components/adapters/codex/src/context-rewrite/rebase-epoch.ts
  - components/adapters/codex/src/context-rewrite/rebase-request.ts
  - components/adapters/codex/src/context-rewrite/backend.ts
  - components/adapters/codex/src/context-rewrite/fallback.ts
  - components/adapters/codex/src/context-history/effective-history.ts
  - components/adapters/codex/src/context-rewrite/provider-continuation.ts
  - components/adapters/codex/src/proxy-runtime.ts
  - components/adapters/codex/src/context-rebase-provider-smoke.ts
  - components/adapters/codex/tests/context-rebase-provider-smoke.test.ts
  - components/products/cli/src/clean.ts
  - components/products/cli/src/hosts/cleaner.ts
  - components/products/cli/src/clean-renderer.ts
  - components/packages/features/cleaner/tests
  - components/adapters/codex/tests
  - components/products/cli/tests
---

# Context Cleaner Format-Aware Convergence

## Scope

Complete the agent-directed occurrence-pruning replacement after commit
`f9c87fa`. Make it the only canonical Cleaner decision and execution path.
Preserve Host history, existing plan/receipt/claim/lock/transaction/recovery
infrastructure, compatibility readers, protocol safety, and provider-request
validation.

The prior occurrence-execution plan remains historical. Do not edit or expand
`docs/superpowers/plans/2026-09-19-context-cleaner-safety-autonomy-follow-up-plan.md`;
its Task 6 remains deferred and untouched.

Do not add a registry, removal ledger, controller, background maintenance loop,
or mandatory model call.

## Coordination State

- Coordination owner: `single lead controller`
- Coordination schema: `1`
- Branch: `main`
- Base commit: `f9c87fa`
- Expected workspace: current LightRSI checkout; preserve no unrelated changes
- Active task: `Task 6`
- Next action: run deferred live-provider and performance probes under separate
  authorization
- Last accepted proof: Cleaner suite `98/98`; Codex adapter suite `504/504`;
  CLI suite `36/36`; Cleaner, Codex, and CLI typechecks; CLI build; contract
  validation; `git diff --check`
- Blockers: none

| Task | State | Workspace | Executor | Depends On | Required Proof | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Task 1 | completed | current | codex | none | cumulative path bypasses replay-capability gate; response-chain gate remains | focused rebase and epoch tests |
| Task 2 | completed | current | codex | Task 1 | one occurrence-set evaluator and trusted session binding | Cleaner `98/98`; typecheck |
| Task 3 | completed | current | codex | Task 4 contract | stable correspondence, continuation, restart | duplicate occurrence and cumulative proxy regressions; Codex `504/504` |
| Task 4 | completed | current | codex | Task 2 | approval idempotency, evidence preservation, revision semantics | receipt, coordinator, and runtime regressions |
| Task 5 | completed | current | codex | Tasks 1-4 | compatibility boundary and legacy-path deletion | CLI `36/36`; typecheck; build; legacy scan |
| Task 6 | pending | current | codex | Tasks 1-5 | full local, backend, contract, performance, and live proof | deferred by approved execution approach |

Task 3 and Task 4 execute as one persistence vertical slice. Prior Task 6 in
`docs/superpowers/plans/2026-09-19-context-cleaner-safety-autonomy-follow-up-plan.md`
remains deferred and is not part of this ledger.

## Goal

One approved occurrence set flows through one eligibility evaluator, one request
compiler, existing transactional dispatch, and existing recovery:

```text
bound Host session
  -> exact occurrence inspection
  -> approved occurrence set
  -> scoped safety evaluation
  -> format-aware request compilation
  -> dispatch and durable receipt
  -> committed exclusion reapplication
```

## Implementation Outcomes

- Cumulative pruning no longer requires `previous_response_id` or replay-capability proof for retained current input.
- Duplicate occurrence correspondence uses stable ordered identity and fails closed when alignment is ambiguous.
- Approval evidence, applied evidence, claims, locks, transactions, and recovery remain durable and separate.
- Legacy task and attribution inputs remain readable only at compatibility boundaries.

## Execution Approach

- Mode: `inline sequential`
- Coordination: `git-tracked`
- Isolation: current `main` checkout; preserve existing dirty baseline
- Executor: `codex`
- Required skills: `skill-systematic-debugging`, `skill-test-driven-development`, `skill-backend-verification`, `skill-verification-before-completion`
- Commit policy: no commits during implementation unless separately requested
- User approval required for: live provider probes, external writes, push, merge, credential changes, and destructive recovery
- Order: local implementation and regressions → compatibility scan → local validation → deferred live proof

Execute approved Tasks 1-5 in current `main` checkout with focused regression tests,
package typechecks, CLI build, and repository contract validation. Keep the
prior plan's Task 6 deferred; do not run live provider probes or external
provider writes in this execution.

Coordination: single lead controller owns plan ledger and Git reconciliation;
preserve unrelated workspace changes and keep prior Task 6 untouched.

Task-oriented and attribution-oriented inputs may remain at the boundary for
backward compatibility. After boundary translation, execution receives only the
approved occurrence set and format-specific execution identity.

## SSOT ownership

| Fact | Owner |
| --- | --- |
| Original occurrence identity and Host order | Host history/effective-history source |
| One operation's approved targets and release evidence | Existing Cleaner plan/receipt transaction boundary |
| Semantic release eligibility | One Cleaner occurrence evaluator |
| Exact occurrence correspondence and protocol relationships | Host adapter and effective-history producer |
| Forwarded payload validity | Codex context-rewrite compiler and validator |
| Dispatch fencing and uncertain outcome | Existing claim, lock, epoch, and recovery stores |
| Applied result and accounting | Existing applied receipt and committed epoch |
| Provider capability evidence | Existing provider smoke/capability evidence |

No owner may recreate another owner's safety or identity decision.

## Non-goals

- No universal provider-history round trip for cumulative pruning.
- No `previous_response_id` prerequisite for cumulative pruning.
- No encrypted-reasoning replay prerequisite unless retained reasoning is being
  reconstructed in response-chain mode.
- No task lifecycle completion prerequisite for an explicitly released occurrence.
- No registry-readiness prerequisite for explicit occurrence pruning.
- No deletion of historical task/attribution readers required for recovery.
- No external provider write without explicit approval.
- No change to Project OS permission policy.

## Task Breakdown

### Task 1: Separate cumulative and response-chain contracts

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: source inspection, regression tests, and scoped implementation.
- Stop for: external provider writes, credential changes, push, merge, or destructive recovery.

**Files:**

- `components/adapters/codex/src/context-rewrite/types.ts`
- `components/adapters/codex/src/context-rewrite/backend.ts`
- `components/adapters/codex/src/context-rewrite/rebase-request.ts`
- `components/adapters/codex/src/context-rewrite/rebase-epoch.ts`
- `components/adapters/codex/src/context-rewrite/fallback.ts`
- `components/adapters/codex/src/proxy-runtime.ts`

**Steps:**

1. Represent execution identity as format-aware data. Cumulative identity must
   not require or synthesize a response-chain ID. Response-chain identity may
   require a nonblank prior response ID when the chain protocol uses it.
2. Remove `String(originalPayload.previous_response_id)` from cumulative epoch
   construction. Never persist the literal string `"undefined"`.
3. Keep `previous_response_id` handling where provider response-chain
   reconstruction, transaction identity, or recovery genuinely needs it.
4. Make cumulative compilation filter the current Host request directly. It
   must validate retained messages, opaque payload preservation, tool closure,
   and final request validity without replay capability checks.
5. Make response-chain compilation validate replay support only for retained item
   types actually reconstructed. Encrypted reasoning is required only when
   retained encrypted reasoning is replayed.
6. Keep stable response IDs only where chain, transaction, or recovery identity
   requires them. Do not use them as a generic pruning gate.
7. In `executeCodexRebaseWithFallback()`, branch on execution format before
   replay-capability checks. Cumulative filtering must not invoke the replay
   capability gate for payload items already present in the current Host input.
   Response-chain reconstruction keeps the relevant replay-capability gate.

**Proof:** Add focused tests in
`components/adapters/codex/tests/context-rebase-behavior.test.ts`,
`context-rebase-epoch.test.ts`, `context-rewrite-backend.test.ts`, and
`context-rebase-pipeline.test.ts` proving cumulative requests without
`previous_response_id` execute, the cumulative path does not invoke replay
capability checks, and response-chain checks remain strict.

### Task 2: Make occurrence selection the sole downstream execution contract

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: Cleaner contract, evaluator, bridge, and focused test changes.
- Stop for: changes to Project OS permission policy or external writes.

**Files:**

- `components/packages/features/cleaner/src/contracts.ts`
- `components/packages/features/cleaner/src/orchestrator.ts`
- `components/packages/features/cleaner/src/control-service.ts`
- `components/packages/features/cleaner/src/host-execution-bridge.ts`
- `components/packages/features/cleaner/src/removal-safety.ts`
- `components/packages/features/cleaner/src/clean-store-support.ts`
- `components/adapters/codex/src/context-cleaner/bridge.ts`

**Steps:**

1. Define one approved occurrence-set shape containing session binding, stable
   IDs, frozen fingerprints, batch release evidence, and provenance required by
   the existing transaction boundary.
2. Resolve legacy task-based removal selections into that shape at the
   boundary. Keep attribution submissions as optional registry updates that
   enrich inspection and conflict detection; attribution alone never
   authorizes removal. Keep `selectedTaskIds`, `ApprovedContextCleanTask`, and
   `occurrence:<stableId>` readers only for old records and compatibility input.
3. Remove synthetic occurrence-task construction from new execution. Delete
   downstream task-based mutation planning after all callers route through the
   occurrence set.
4. Replace `agentDirected` branching with one occurrence evaluator. It must
   check trusted Host/session binding, exact identity, fingerprint freshness,
   system/developer protection, retention evidence, incoming or unknown
   dependency conflicts, protocol closure, and request-validity prerequisites.
5. Active top-level task state, missing optional registry attribution, and
   estimator absence must not block an explicitly released occurrence. Existing
   retention and dependency conflicts remain blocking.
6. Derive mutation authority from trusted bound Host invocation context. A
   caller-supplied session ID is an identifier, not proof of authority. Keep
   read-only inspection separate from mutation release.
7. Keep claims, locks, receipts, transaction state, and recovery as separate
   owners. Do not merge them into the evaluator.

**Proof:** Update
`components/packages/features/cleaner/tests/host-execution-bridge.test.ts`,
`removal-safety.test.ts`, `orchestrator.test.ts`, `contracts.test.ts`, and
`components/adapters/codex/tests/context-cleaner-bridge.test.ts`.
Prove no-registry execution, active parent task with released obsolete items,
retention/dependency rejection, protected-item rejection, stale fingerprint
rejection, complete tool-pair selection, compatibility-reader recovery, and
untrusted cross-session release rejection.

### Task 3 and Task 4 dependency

Tasks 3 and 4 form one persistence vertical slice. Establish Task 4's approval
evidence and idempotency contract before claiming Task 3 restart or continuation
behavior. Continuation may consume committed removal evidence only after the
existing transaction machinery proves the operation was applied; approval or
dispatch-start evidence alone never creates a committed exclusion.

### Task 3: Repair durable occurrence correspondence

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: effective-history, compiler, proxy, and regression changes.
- Stop for: provider writes or changes to durable recovery ownership.

**Files:**

- `components/adapters/codex/src/context-rewrite/rebase-request.ts`
- `components/adapters/codex/src/context-history/effective-history.ts`
- `components/adapters/codex/src/context-rewrite/backend.ts`
- `components/adapters/codex/src/context-rewrite/provider-continuation.ts`
- `components/adapters/codex/src/proxy-runtime.ts`
- `components/packages/features/cleaner/src/clean-state-coordinator.ts`
- `components/packages/features/cleaner/src/recovery.ts`

**Steps:**

1. Reapply committed exclusions from existing applied Cleaner evidence and
   committed epochs during ordinary cumulative continuation and restart.
2. Map exclusions through Host/effective-history stable occurrence identity, not
   content key plus ordinal or fingerprint equality alone.
3. Preserve identity across original Host history, forwarded input, committed
   epoch, and subsequent cumulative requests. Keep removed occurrences in the
   identity model after they disappear from provider-facing input.
4. Distinguish an occurrence absent from the current request from an occurrence
   whose correspondence is ambiguous or changed. Preserve affected context and
   return a scoped diagnostic for the latter; never guess a duplicate.
5. Prove that newly introduced identical content is retained while the original
   released occurrence remains excluded, including repeated content across turns.
6. Preserve at-most-once dispatch behavior for confirmed provider dispatch,
   local persistence failure, restart recovery, and uncertain outcomes.
7. Keep the lookup in memory during a request. Do not add persistent cache or
   removal ledger.

**Proof:** Add regression cases to
`components/adapters/codex/tests/context-rebase-behavior.test.ts`,
`context-provider-continuation.test.ts`, `context-rebase-pipeline.test.ts`,
`context-cleaner-runtime.test.ts`, and cleaner recovery tests. Include
duplicate-heavy effective-history construction cases, not only downstream
request-compiler cases:

```text
A B C D -> release B C -> provider receives A D
A B C D E -> provider receives A D E
A B C D -> release B -> A B C D B -> only original B is removed
restart -> committed exclusions still apply
ambiguous correspondence -> no mutation
```

### Task 4: Preserve approval evidence and repair revision semantics

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: receipt, claim, coordinator, recovery, and regression changes.
- Stop for: merging or altering shared transaction schemas outside this plan.

**Files:**

- `components/adapters/codex/src/context-cleaner/applied-receipt.ts`
- `components/adapters/codex/src/context-cleaner/runtime.ts`
- `components/packages/features/cleaner/src/clean-receipt-store.ts`
- `components/packages/features/cleaner/src/clean-claim-store.ts`
- `components/packages/features/cleaner/src/clean-state-coordinator.ts`
- `components/adapters/codex/tests/context-cleaner-applied-receipt.test.ts`
- `components/adapters/codex/tests/context-cleaner-runtime.test.ts`

**Steps:**

1. Keep approved selection/release evidence in applied receipts alongside
   applied provider outcome, operation IDs, revisions, accounting, and response
   identity. Do not replace approval evidence when settlement completes.
2. Keep old persisted receipt shapes readable. Normalize only at the existing
   store boundary; do not create a second receipt format or evidence ledger.
3. Distinguish analysis revision, current validated execution revision, and
   committed result revision. Appended unrelated history may remain valid;
   changed selected occurrences must stale the execution.
4. Make claim and receipt comparisons use the actual execution revision selected
   for dispatch, then verify the committed result revision at settlement.
5. Preserve crash recovery and duplicate-dispatch fencing while changing only
   Cleaner evidence and revision semantics.
6. Make approval replay idempotent only when all frozen authorization facts
   match: occurrence set, fingerprints, release evidence, and authorized Host
   session. Matching targets with changed release evidence produce conflict or
   require a new approval. Compare one canonical approval digest or equivalent
   value inside existing transaction records; do not add an idempotency store.

**Proof:** Applied-receipt, state-coordinator, and runtime tests must prove
approval evidence survives scheduled-to-applied settlement, old receipts
recover, changed release evidence conflicts on approval replay, revision drift
is scoped to selected targets, and committed epochs settle exactly once.

### Task 5: Keep compatibility at the boundary, remove legacy blockers

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: compatibility scan, deletion of superseded gates, CLI tests, and documentation updates.
- Stop for: deleting persisted-record readers or changing Host permission policy.

**Files:**

- `components/products/cli/src/clean.ts`
- `components/products/cli/src/hosts/cleaner.ts`
- `components/products/cli/src/clean-renderer.ts`
- `components/products/cli/tests/clean.test.ts`
  - related Cleaner documentation and tests

**Steps:**

1. Keep ordinary agent-directed pruning reachable from exact occurrence
   inspection and release. Do not require a task ID, registry version,
   estimator result, response-chain mode, transaction ID, or hand-authored JSON
   file as agent responsibility.
2. Keep JSON/task/attribution commands as compatibility adapters only. Their
   output must enter the same approved occurrence-set evaluator and transaction
   boundary.
3. Render occurrence references, fingerprints, protection diagnostics, and
   applied status. Keep `clean inspect`, `clean release`, and `clean status`
   behavior read-only, mutation, and outcome-reporting respectively.
4. After Tasks 1-4 pass, run this caller scan before deletion:
   `rg -n -S "ApprovedContextCleanTask|occurrence:|agentDirected|evictableTaskIds|task_registry_unavailable|oldPreviousResponseId" components/packages/features/cleaner components/adapters/codex/src/context-cleaner components/adapters/codex/src/context-rewrite components/products/cli`.
   Delete only superseded downstream task eligibility, synthetic
   occurrence-task planning, and blanket registry or round-trip gates. Retain
   historical readers and protected lifecycle paths.
5. Update tests and documentation that still describe task-first Cleaner
   requirements as mandatory. Do not remove compatibility guidance for old
   persisted records.

**Proof:** CLI tests prove occurrence references reach one transaction, no
mandatory Confirm or evidence-file preparation exists in the normal path, task
compatibility remains safe, and no deleted live symbol has callers.

**Architecture exit:** The live path contains one occurrence inspection
boundary, one approved selection contract, one semantic eligibility evaluator,
one format-aware compiler facade, one existing transaction execution path, and
one recovery path. Compatibility adapters translate inputs at the boundary and
do not retain downstream decisions.

**Performance acceptance:** Measure inspection latency, preparation latency,
persistence overhead, forwarded request size, cached input tokens, net token
savings after cleanup overhead, and recovery overhead. Do not introduce a
break-even threshold that blocks short sessions; measurements inform agent
selection only.

## Verification

### Task 6: Verification and live-probe matrix

**Template Profile:**

- Controller-selected: `normal`

**Authority:**

- Preauthorized local actions: local tests, typechecks, builds, and sanitized offline probes.
- Stop for: live provider probes and external writes until separately authorized.

**Required skills:** `skill-systematic-debugging`,
`skill-test-driven-development`, `skill-backend-verification`,
`skill-verification-before-completion`.

**Local verification:**

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

**Probe matrix:**

- short clean cumulative session;
- long dirty cumulative session;
- no registry and estimator disabled;
- active top-level Project OS task with released obsolete investigation;
- message-only cumulative pruning;
- function call plus function output as one atomic selection;
- opaque encrypted reasoning preserved in cumulative filtering;
- response-chain reconstruction with supported replay capability;
- response-chain rejection when a retained item type lacks replay support;
- appended history;
- duplicate-content count growth and shrink;
- continuation after committed removal;
- restart after committed removal;
- confirmed dispatch plus local persistence failure;
- uncertain dispatch and duplicate-dispatch recovery.

The cumulative probe must assert that the replay-capability gate is not called,
not merely that a fully capable provider accepts the request. The final probe
must execute the normal CLI -> proxy -> continuation -> restart path.

Use canonical custom-provider configuration from
`C:\Users\HOANG PHI LONG DANG\.codex\tokenpilot.env`. Record sanitized
provider evidence only. External provider writes and capability gaps remain
separate diagnostics, not reasons to reintroduce cumulative round-trip gates.
Provider-smoke evidence must retain provenance: committed selected-payload
success is scenario-scoped evidence for the observed payload lineage, not an
unrestricted provider-wide guarantee for every payload of that item type.
Update `mergeProviderSmokeVerifiedItemTypes()` and its README evidence
description so selected-payload success, capability-journal evidence, and
response-chain replay evidence remain distinguishable.
Add the focused regression in
`components/adapters/codex/tests/context-rebase-provider-smoke.test.ts`.

## Completion Criteria

1. Agent-directed pruning has one downstream occurrence-set contract.
2. Cumulative pruning works without `previous_response_id`, provider replay,
   encrypted-reasoning replay, or registry/estimator prerequisites.
3. Response-chain reconstruction enforces compatibility only for retained items
   actually replayed.
4. Exact stable occurrence identity and fingerprints protect every mutation.
5. Tool relationships and required retained findings remain valid.
6. New identical occurrences are never removed by old content alone.
7. Approval evidence and applied outcome evidence both survive settlement.
8. Analysis, execution, and committed-result revisions remain distinguishable.
9. Continuation and restart reapply committed exclusions without a new ledger.
10. Confirmed dispatch is never resent after local persistence uncertainty.
11. Task and attribution inputs remain readable only as boundary compatibility.
12. Superseded legacy Cleaner decision paths cannot block explicit pruning.
13. Prior Task 6 remains untouched and deferred.
14. Provider capability evidence preserves payload/provider/model provenance and
    does not broaden selected-payload success into a universal guarantee.
15. Fresh automated, backend, contract, performance, and applicable sanitized
    live proof pass.

## Handoff

Plan status stays `proposed` until approved. Implementation must use current
workspace safeguards, preserve unrelated changes, and stop before external
writes, credential changes, push, merge, or destructive recovery unless separately
authorized.
