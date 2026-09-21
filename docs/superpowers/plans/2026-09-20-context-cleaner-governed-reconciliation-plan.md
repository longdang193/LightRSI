---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: completed
layer: change
name: context-cleaner-governed-reconciliation
targets:
  - components/packages/features/cleaner/src/contracts.ts
  - components/packages/features/cleaner/src/task-attribution.ts
  - components/packages/features/cleaner/src/orchestrator.ts
  - components/packages/features/cleaner/src/control-service.ts
  - components/packages/features/cleaner/src/host-execution-bridge.ts
  - components/packages/features/cleaner/src/removal-safety.ts
  - components/packages/features/cleaner/tests
  - components/packages/features/eviction/src/task-update-mapper.ts
  - components/packages/features/eviction/tests
  - components/packages/foundation/host-adapter/src/state/file-store.ts
  - components/packages/foundation/host-adapter/src/context-rewrite/plan-store.ts
  - components/packages/foundation/history/src/registry.ts
  - components/packages/foundation/history/src/types.ts
  - components/packages/foundation/history/tests
  - components/adapters/codex/src/context-cleaner/bridge.ts
  - components/adapters/codex/src/context-cleaner/runtime.ts
  - components/adapters/codex/src/context-cleaner/scheduler.ts
  - components/adapters/codex/src/context-history/effective-history.ts
  - components/adapters/codex/src/context-rewrite/semantic-mapping.ts
  - components/adapters/codex/src/context-rewrite/lifecycle-runner.ts
  - components/adapters/codex/tests
  - components/adapters/claude-code/src/context-rewrite/semantic-pipeline.ts
  - components/adapters/claude-code/src/context-rewrite/task-registry-update.ts
  - components/presets/tokenpilot/src/policy.ts
  - components/products/cli/src/clean.ts
  - components/products/cli/src/dispatch.ts
  - components/products/cli/tests
---

# Context Cleaner Governed Reconciliation

## Review Verdict

The recommendation is implementation-worthy. Its SSOT boundary matches the
repository rules and existing Cleaner contracts:

- Project OS owns project authorization, assignment, verification, acceptance,
  and retention constraints.
- Host adapters own session identity, current binding, historical occurrences,
  snapshots, and mutation capability.
- LightRSI history owns internal context-work identity, lifecycle evidence, and
  occurrence attribution.
- Cleaner owns selection safety, frozen plans, claims, execution validation,
  receipts, and recovery.

Required corrections before implementation:

1. **Automatic session binding is a boundary change, not a new session store.**
   Runtime requests must supply the bound Host session. Missing registries may be
   initialized automatically. Explicit CLI session selection remains valid for
   inspecting an existing historical session; it must not become agent-managed
   session registration.
2. **Agent authority stops at semantic judgment and retention intent.**
   Agent input may name work, lifecycle, retention, and dependencies, but every
   occurrence reference must be validated against the bound Host snapshot,
   registry session, revision, and caller authority. The agent cannot invent
   history or bypass CAS, ownership, protocol closure, or protected-content
   checks.
3. **Merge and split are not assumed to exist.**
   First delivery supports evidence-backed create/correct lifecycle,
   retention, and dependency updates through the existing attribution boundary.
   Merge/split needs explicit identity and migration design; defer it until a
   real use case requires it.
4. **Partial history needs one scoped evidence model.**
   Analysis, reconciliation, and selection must consume the same history,
   attribution, and execution dimensions. Scoped uncertainty protects affected
   occurrences without invalidating unrelated verified work. Identity mismatch,
   corruption, and unscoped uncertainty still fail closed.
5. **Cumulative-history execution remains gated.**
   Reuse existing plan, claim, mutation, receipt, and recovery paths. Do not
   claim real-provider autonomy, enable automatic mutation, or modify the
   existing safety/autonomy plan Task 6. Task 6 remains deferred and unchanged.
6. **One registry writer requires one serialized operation.** The existing
   expected-version check is not an atomic transaction. Every registry writer,
   including estimator updates, must participate in the session lock across
   load, validate, reconcile, persist, and idempotency-record settlement.
7. **Processing coverage is not ownership.** `processedTurnRanges` means turns
   already assessed. It must never imply task ownership, approval, retention, or
   removal eligibility. Reconciliation must preserve exact occurrence
   relationships and replace affected relationships when correcting ownership.
8. **Agent intent must survive and gate execution.** Provenance, retention, and
   dependency decisions stay bound to their accepted scope. Estimator evidence
   cannot extend a release decision. One current eligibility evaluator must be
   used by analysis, selection, and pre-dispatch execution validation.
9. **Uncertainty is symmetric across history.** Dirty prefixes, middle regions,
   suffixes, delayed results, ordinary controller traffic, and tool traffic use
   the same scoped assessment. Localized uncertainty protects affected work;
   unlocalizable uncertainty protects the broader affected scope.

## Canonical Contract

```text
Project OS governance
        |
        v
Active Host session binding
        |
        v
LightRSI context-work registry
        |
        v
Agent reconciliation -> Cleaner analysis -> agent selection
                                      |
                                      v
                           Cleaner validation/claim
                                      |
                                      v
                            Host mutation + receipt
```

Invariants:

- One Host session maps to one logical LightRSI registry.
- Missing registry means empty logical attribution, not missing Host session.
- Registry is the only persistent attribution store.
- Exact occurrence relationships are distinct from processed-turn coverage.
- Eligibility is derived from current evidence; it is not an independently
  mutable task decision.
- Cleaner plans are session-bound, revision-bound, immutable selections.
- `completed` does not imply `release`; `release` does not imply deletion.
- Unknown, missing, or conflicting evidence protects affected content.
- Shared ownership, active work, unresolved dependencies, system/developer
  content, incomplete protocol closure, and stale fingerprints remain protected.
- Cleaner never changes Project OS task state and never expands agent authority.
- Short and long sessions use identical contracts and execution machinery.

## Scope

### In scope

- Bind runtime reconciliation and cleaning to the active Host session.
- Bootstrap an empty registry when Host identity is valid.
- Generalize existing `submitAttribution()` into one validated reconciliation
  boundary and one registry writer.
- Carry scoped history evidence, attribution evidence, dependency evidence, and
  execution capability separately through analysis and selection.
- Reuse existing Cleaner plan, claim, schedule, execution, receipt, and recovery
  paths for validated selections.
- Add bounded incremental processing and explicit agent-friendly diagnostics.
- Serialize all registry writers through the existing session lock and keep
  expensive inference outside the lock with commit-time revalidation.
- Reuse explicit agent decisions and process only changed or newly eligible
  occurrences; supporting evidence reads may be broader when validation needs
  them.
- Prove short, long, dirty, restarted, and worker-session behavior with focused
  regression and integration tests.

### Non-goals

- Editing or expanding `2026-09-19-context-cleaner-safety-autonomy-follow-up-plan.md` Task 6.
- Creating a Project OS controller, duplicate task ledger, or second Cleaner
  mutation engine.
- Treating LightRSI task IDs as Project OS task IDs.
- Automatic deletion from an empty registry or unverified history.
- Merge/split task identity in first delivery.
- Enabling automatic eviction by default.
- Live provider/autonomy pilot evidence; that remains Task 6 work.
- Manual registry-file editing as a supported interface.

## Work Order

| Task | State | Depends on | Required proof |
| --- | --- | --- | --- |
| R1. Serialize reconciliation and consolidate semantic mapping | completed | current source and recommendation review | lock/concurrency and mapper regression tests passed |
| R2. Enforce exact reconciliation and current agent intent | completed | R1 | exact ownership, retain-before-dispatch, and invalidation tests passed |
| R3. Unify scoped uncertainty across history | completed | R1, R2 | dirty-middle/late-result and protected-selection tests passed |
| R4. Expose compact operations and process incrementally | completed | R1–R3 | sparse-window, restart, worker, and symmetric integration tests passed |

## Task R1: Serialize Reconciliation and Consolidate Semantic Mapping

**Purpose:** Make ownership, authority, evidence, and lifecycle separation
explicit, then make registry reconciliation one serialized operation without
adding a transaction service.

**Files and symbols:**

- Inspect/modify `components/packages/features/cleaner/src/contracts.ts`:
  `ContextCleanPlan`, `ContextCleanHistoryEvidence`,
  `ContextCleanAttributionSubmission`, `ContextCleanerControlPlane`, and host
  bridge contracts.
- Inspect `components/packages/features/cleaner/src/task-attribution.ts`:
  `attributeItems`, `mapTaskLifecycle`.
- Inspect `components/packages/foundation/history/src/types.ts` and
  `registry.ts` for registry identity, CAS, and derived fields.
- Inspect the existing session lock in
  `components/packages/foundation/host-adapter/src/state/file-store.ts` and
  `context-rewrite/plan-store.ts`; reuse it rather than creating a Cleaner lock.
- Inspect every registry writer, including
  `components/adapters/codex/src/context-rewrite/lifecycle-runner.ts`,
  `components/adapters/claude-code/src/context-rewrite/task-registry-update.ts`,
  and `components/presets/tokenpilot/src/policy.ts`.
- Modify the shared mapper in
  `components/packages/features/eviction/src/task-update-mapper.ts` and remove
  semantic duplication in TokenPilot only where the existing contract matches.
- Add contract tests under `components/packages/features/cleaner/tests` and
  `components/packages/foundation/history/tests`.

**Steps:**

1. Record the SSOT matrix in contract documentation/tests; keep Project OS
   references as validated inputs, not duplicated state.
2. Separate history completeness, attribution availability, dependency evidence,
   and execution capability. Do not overload `task_registry_unavailable`.
3. Define the minimum reconciliation request: bound host/session identity,
   caller and authority references, evidence revision/refs, occurrence refs,
   lifecycle intent, retention intent, dependency direction, and invalidation
   conditions.
4. Preserve schema compatibility or add an explicit version migration. Reject
   unknown, empty, cross-session, or duplicate identity fields.
5. Put load, validation, reconciliation, registry persistence, and idempotency
   settlement under the existing session lock. Add a concurrent-write test that
   proves one accepted result and one replay/conflict, never two successful
   writes with one lost.
6. Keep estimator inference outside the lock. Revalidate its base revision and
   evidence under the lock before applying it. Every writer uses this boundary.
7. Consolidate semantic field merging so provenance, retention, dependency, and
   span fields survive all estimator and agent paths.

**Stop conditions:** a second persistent ledger, Project OS state copy, or
  authority field that cannot be verified at the Host/Project OS boundary.

## Task R2: Enforce Exact Reconciliation and Current Agent Intent

**Purpose:** Remove agent/session bookkeeping from the normal runtime path while
keeping exact agent decisions authoritative only for their validated occurrence
scope and current eligibility.

**Files and symbols:**

- Modify `components/packages/features/cleaner/src/orchestrator.ts`:
  `analyzeContextCleanSession` and reconciliation entry validation.
- Modify `components/packages/features/cleaner/src/host-execution-bridge.ts` and
  `control-service.ts` for bound-session inputs.
- Modify `components/adapters/codex/src/context-cleaner/bridge.ts` and
  `runtime.ts` to pass the canonical active session and initialize an empty
  registry through `loadSessionTaskRegistry`.
- Modify `components/products/cli/src/clean.ts` and `dispatch.ts` only where
  default active-session resolution exists; retain `--session` for explicit
  historical selection.
- Modify `components/packages/features/cleaner/src/removal-safety.ts` and
  `host-execution-bridge.ts` to share one current eligibility evaluator across
  analysis, selection, and pre-dispatch execution validation.
- Modify `components/presets/tokenpilot/src/policy.ts` where its local task
  reconstruction would otherwise drop provenance, retention, or dependency
  intent.
- Add adapter, CLI, and restart tests.

**Steps:**

1. Require Host-provided session binding for runtime operations; reject missing
   or mismatched host/session identity.
2. Treat absent registry as empty attribution with `waiting`/`empty` status,
   not as missing session.
3. Keep registry persistence under the existing session path and CAS writer.
4. Ensure CoS/Herdr worker sessions remain isolated; no parent-session cleanup
   or implicit “most recent session” lookup.
5. Resolve submitted occurrence refs to exact Host snapshot items and existing
   registry relationships. Correct affected relationships explicitly; do not
   union new ownership into every item on the containing turn. If the current
   registry shape cannot represent exact occurrence ownership, add a versioned
   exact-occurrence relation; never silently fall back to turn-wide ownership.
6. Keep `processedTurnRanges` as assessment coverage only. One submitted
   occurrence must not imply ownership or completion for its whole turn.
7. Bind accepted provenance, retention, and dependency intent to exact scope.
   Estimator updates may add evidence but cannot inherit release intent for new
   occurrences.
8. Recompute eligibility immediately before dispatch. New `retain`, incoming
   dependency evidence, reactivation, revision drift, or target-scope change
   invalidates pending cleanup; immutable selections are rejected, not replaced.
9. Verify restart returns to the same Host session and registry without manual
   registration.

**Stop conditions:** generated session IDs used as Host identity, cross-session
  fallback, a new session registry, turn-wide ownership expansion, or execution
  that ignores current agent intent.

## Task R3: Unify Scoped Uncertainty Across History

**Purpose:** Let the active agent correct internal context-work interpretation
without inventing historical occurrences, while applying the same scoped
uncertainty rules to analysis, reconciliation, selection, and execution.

**Files and symbols:**

- Inspect/modify `components/adapters/codex/src/context-history/effective-history.ts`
  and `context-rewrite/semantic-mapping.ts` for scoped completeness and reason
  codes across prefixes, middle regions, suffixes, delayed results, controller
  traffic, and tool traffic.
- Modify `components/packages/features/cleaner/src/contracts.ts`,
  `orchestrator.ts`, and `task-attribution.ts` for history, attribution,
  dependency, and execution dimensions.
- Modify `components/adapters/codex/src/context-cleaner/bridge.ts` so
  reconciliation and analysis consume the shared scoped assessment rather than
  rejecting every incomplete history or any reason code globally.
- Add tests in Cleaner and Codex packages for localized and unlocalizable
  uncertainty.

**Steps:**

1. Classify each occurrence as verified, protected, unresolved, or unavailable
   with reason codes and stable IDs.
2. Allow partial snapshots and reconciliation when uncertainty is localized;
   protect uncertain occurrences and affected dependencies while preserving
   independently verified work elsewhere.
3. Retain global refusal for identity mismatch, registry corruption, ambiguous
   correspondence, incomplete protocol closure, and unscoped uncertainty.
4. Distinguish “no dependency recorded” from “dependency evidence unavailable”;
   protect the latter.
5. Ensure recommendation output cannot downgrade deterministic protection.
6. Add red tests for dirty middle regions, delayed results, ordinary controller
   traffic, mixed-task turns, and late tool results; then prove the shared
   assessment drives analysis, reconciliation, and execution consistently.

**Stop conditions:** partial history labeled complete, global rejection of
  localizable uncertainty, uncertainty copied into a second ledger, or one
  blocked turn masking unrelated verified work.

## Task R4: Expose Compact Operations and Process Incrementally

**Purpose:** Keep agent workflow small and prevent already assessed material
from re-entering inference while preserving the same contracts for short, long,
dirty, restarted, and worker sessions.

**Files and symbols:**

- Modify `components/products/cli/src/clean.ts` and the existing submission
  interface for compact agent operations; host supplies identity and evidence
  references, not registry versions or reconstructed IDs.
- Modify `components/presets/tokenpilot/src/policy.ts` to pass sparse pending
  turn selection into estimator delta construction.
- Modify `components/adapters/claude-code/src/context-rewrite/semantic-pipeline.ts`
  and related history loading so supporting evidence reads are distinct from
  newly estimated work.
- Preserve existing Cleaner plan, claim, receipt, and recovery stores.
- Add Cleaner, TokenPilot, Claude, Codex, CLI, restart, and worker-session tests.

**Steps:**

1. Allow agent reconciliation immediately; estimator thresholds are not
   prerequisites when the agent already supplies the decision.
2. Reuse accepted attribution and process only changed or newly eligible
   occurrences. Supporting evidence may be read for validation but must not be
   resent as new estimator work.
3. Preserve sparse processed-range semantics in TokenPilot and Claude; prove
   gaps do not re-enter inference and historical reads do not imply new work.
4. Retry blocked cleanup only when relevant evidence or execution capability
   changes.
5. Preserve stable request content where possible and batch useful removals
   without changing plan identity or cache safety.
6. Prove identical authority and safety behavior for short, long, dirty,
   restarted, and worker sessions. Fresh session, five-turn, or controller-free
   transcript assumptions are test fixtures, not runtime prerequisites.

**Stop conditions:** a second estimator/controller, full-history reprocessing
  when sparse evidence suffices, or a live-provider claim without Task 6 proof.

## Required Skills and Authority

- `skill-systematic-debugging`: trace shared callers and classify runtime versus
  contract failures before edits.
- `skill-test-driven-development`: every behavior change starts with a failing
  focused regression and ends with passing proof.
- `skill-backend-verification`: prove direct boundary behavior, failure paths,
  final state, CAS/idempotency, and recovery.
- `skill-code-standards`: preserve package conventions and type safety.
- `skill-verification-before-completion`: fresh final evidence before changing
  plan status or Git disposition.

Codex remains lead controller and approval authority. No delegated writer may
change another task's files without explicit ownership transfer. Do not commit,
push, activate Project OS policy, or run external provider probes as part of
plan execution unless separately authorized.

## Verification

Run focused tests after each task, then:

```powershell
pnpm --dir components/packages/features/cleaner test
pnpm --dir components/packages/features/eviction test
pnpm --dir components/packages/foundation/history test
pnpm --dir components/adapters/codex test
pnpm --dir components/adapters/claude-code test
pnpm --dir components/presets/tokenpilot test
pnpm --dir components/products/cli test
pnpm --dir components/packages/features/cleaner typecheck
pnpm --dir components/packages/features/eviction typecheck
pnpm --dir components/packages/foundation/history typecheck
pnpm --dir components/adapters/codex typecheck
pnpm --dir components/adapters/claude-code typecheck
pnpm --dir components/presets/tokenpilot typecheck
pnpm --dir components/products/cli typecheck
git diff --check
```

Expected proof:

- no registry or plan writer exists outside declared owners;
- concurrent submissions serialize under one session lock; one accepted write
  cannot silently overwrite another;
- no Project OS task changes during Cleaner operations;
- no unsupported deletion from empty, dirty, partial, stale, or unavailable
  evidence;
- exact occurrence identity and correction, mixed-task-turn scope, fingerprints,
  current retention/dependency checks, CAS, claim fencing, receipt recovery, and
  no-resend behavior remain covered;
- processing coverage never becomes ownership or removal permission;
- dirty prefix, middle, suffix, delayed-result, controller, and tool uncertainty
  use one scoped assessment;
- sparse pending windows do not re-enter already processed material, while
  supporting evidence reads remain distinct from estimator input;
- short and long sessions produce the same contract shape and safety decisions;
- no live Task 6 evidence is claimed.

## Exit Criteria

1. Ownership matrix and contract tests pass.
2. Runtime operations use Host-bound sessions without manual registration.
3. All registry writers use one serialized reconciliation boundary.
4. Agent reconciliation accepts exact evidence-backed corrections through one
   writer; coverage remains separate from ownership.
5. Current agent intent and dependency/retention evidence gate execution through
   one eligibility evaluator.
6. Partial history is localized where safe and protected where uncertain.
7. Sparse processing and compact agent operations avoid redundant inference.
8. Existing Cleaner execution and recovery remain the only mutation path.
9. Symmetry tests pass for short, long, dirty, restarted, and worker sessions.
10. Fresh verification reports `verified` before plan completion.
11. Existing safety/autonomy plan Task 6 remains unchanged and deferred.

## Completion Evidence

Verified 2026-09-21 in the LightRSI working tree. All required package tests
passed: Cleaner, eviction, history, Codex, Claude Code, TokenPilot, and CLI.
All required package typechecks passed for the same packages. `git diff --check`
passed; Git emitted only expected Windows line-ending warnings. Production
registry writers were audited: Codex, Claude Code, and TokenPilot use the
shared session-lock boundary; OpenClaw is read-only for this registry. No live
provider or autonomy evidence was run or claimed. Existing safety/autonomy plan
Task 6 remains unchanged and deferred. Post-completion regression proof added
for unscoped duplicate semantic attribution beside a blocked turn; the full
Codex suite passed 491/491 afterward.

## Rollback

If any task fails its boundary proof, keep existing behavior fail-closed, retain
the current registry/plan schemas, and revert only the task-local changes. Do not
delete registry files, invalidate existing receipts, resend uncertain provider
requests, or activate new standing permission.
