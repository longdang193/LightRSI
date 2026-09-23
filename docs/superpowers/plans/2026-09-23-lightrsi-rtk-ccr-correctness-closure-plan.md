---
layer: change
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: completed
name: LightRSI RTK CCR Correctness Closure After PR 34
targets:
  - components/packages/foundation/artifact-store/src/archive-recovery/index.ts
  - components/packages/foundation/artifact-store/src/archive-recovery/archive-paths.ts
  - components/packages/foundation/artifact-store/tests/archive-recovery.test.ts
  - components/packages/features/reduction/src/reduction/tool-payload-router.ts
  - components/packages/features/reduction/tests/tool-payload-router.test.ts
  - components/packages/features/cleaner/src/contracts.ts
  - components/packages/features/cleaner/src/orchestrator.ts
  - components/adapters/codex/src/context-cleaner/bridge.ts
  - components/adapters/codex/tests/context-cleaner-bridge.test.ts
  - components/products/cli/src/clean-renderer.ts
  - components/products/cli/tests/clean.test.ts
  - docs/intent/2026-09-23-lightrsi-p1-closure-plan.md
---

# LightRSI RTK/CCR Correctness Closure After PR #34

## Verdict Review

PR #34 merged at `21aa82ea47f4d4cdb4cbcd908b8717360f6e52bf`. Post-merge CI
passed typecheck, build, and workspace tests. Forwarding regression watch is
closed: matched concurrency-16 rerun did not reproduce prior p95 regression.

Recommendation is accepted with one scope correction: residual work contains
three correctness defects plus one adjacent reporting defect already supported
by existing backend fields. Keep this follow-up narrow; do not reopen all five
P1 objectives.

Residual scope:

1. Workspace-origin exact recovery skips trusted archive-directory fallback when
   the derived artifact index is missing or stale.
2. CCR search checks `maxOutputChars` after assembling output and can throw or
   produce unusable continuation for oversized evidence.
3. RTK TAP summarization can detach multiline `expected`, `actual`, or `stack`
   bodies from their field headers.
4. Cleaner preview backend exposes transport deltas, but CLI rendering omits
   them.

Context-pressure runtime wiring and provider-backed performance measurement stay
explicitly deferred. Duplicate discovery and forwarding optimization stay
closed.

## Goal

Close reproduced RTK/CCR correctness gaps and expose existing Cleaner transport
accounting without changing release authority, archive trust, provider claims,
or runtime architecture.

## Outcomes

- Workspace `artifactRef` recovery survives missing and stale derived indexes,
  verifies exact content, repairs trusted indexes, and preserves legacy
  `dataKey` behavior.
- CCR search admits complete result/context blocks within budget, returns
  stateless archive-relative continuation, and distinguishes scan completeness
  from result completeness.
- RTK preserves source order and field/body association for multiline TAP
  diagnostics, with field-specific omission and exact-recovery guidance.
- Cleaner preview renders gross release, expanded-context savings, immediate
  transport deltas, unchanged history, and unknown provider cache outcome with
  explicit character/byte units.

## Non-goals

- No context-pressure capacity or reserved-output integration.
- No live Codex/9Router provider benchmark or provider-token/cache/TTFT/cost
  claim without approved access and receipts.
- No new archive registry, recovery engine, search dependency, cache, estimator,
  lifecycle controller, automatic pruning, or release policy.
- No change to duplicate identity, agent-selected occurrence release,
  committed receipts, or historical-read classification.
- No forwarding optimization unless a new matched reproduction establishes a
  real regression.

## Invariants

1. `artifactRef` remains exact identity; legacy `dataKey` returns latest-version
   behavior unchanged.
2. Recovery accepts trusted workspace context or indexed locations only; callers
   cannot provide arbitrary filesystem paths.
3. Fallback returns content only after digest/content verification. Index repair
   is atomic and best effort; failed repair cannot turn a verified miss into a
   success claim.
4. CCR coordinates remain archive-relative. Continuation skips no match and
   repeats no match.
5. `scanComplete` means requested interval fully examined. `resultsComplete`
   means all matches were returned. `truncated` means evidence was omitted.
6. A single oversized match never causes a repeated continuation loop. Response
   includes its exact archive-relative line and recovery guidance, or a
   structured recoverable condition.
7. TAP field headers remain attached to their continuation bodies. Omission
   markers identify the omitted field and preserve exact recovery reference.
8. Cleaner preview remains read-only and never predicts provider cache behavior.

## Execution Approach

- Mode: sequential correctness follow-up.
- Base: merged `main` at `21aa82ea47f4d4cdb4cbcd908b8717360f6e52bf`.
- Branch/worktree: assign after approval; do not invent branch identity here.
- Required skills: `skill-systematic-debugging`,
  `skill-test-driven-development`, `skill-backend-verification`,
  `skill-verification-before-completion`.
- Commit policy: no commit, push, merge, or cleanup during implementation until
  verification approves disposition.
- Stop for: reproduction failure, unrelated worktree change, contract mismatch,
  arbitrary-path recovery need, or provider access requirement.

## Coordination State

- Coordination owner: lead controller.
- Current status: completed; approved implementation and verification finished.
- Execution worktree: `C:\Users\HOANG PHI LONG DANG\.codex\worktrees\lightrsi-p1-closure-v2\LightMem2`.
- Next action: preserve branch state for separately authorized Git disposition.
- Historical plan: prior optimization plan is superseded by this artifact; the
  completed P1 ledger remains historical evidence and is not rewritten to erase
  completed work or approved deferrals.

| Task | State | Depends on | Required proof |
| --- | --- | --- | --- |
| 0. Reproduce and pin defects | completed | none | Baseline reproduced: workspace fallback miss, CCR budget throw, TAP detached bodies, CLI transport fields absent. |
| 1. Trusted workspace recovery fallback | completed | Task 0 | Missing/stale index fallback, digest verification, repair, corruption rejection, and legacy lookup tests pass. |
| 2. Budget-aware CCR pagination | completed | Task 0 | Bounded search, truthful completion fields, first-unreturned continuation, and oversized-line marker tests pass. |
| 3. Ordered TAP diagnostic blocks | completed | Task 0 | Multiline `expected`, `actual`, and `stack` association plus execution status tests pass. |
| 4. Cleaner transport reporting | completed | Task 0 | CLI renders signed character/byte deltas; existing bridge values and no-write behavior preserved. |
| 5. Integration and documentation closure | completed | Tasks 1–4 | Focused suites, full workspace tests, typechecks, build, benchmarks, diff check, and ledger erratum pass. |

## Task Breakdown

### Task 0: Reproduce and Pin Defects

**Purpose:** Establish current failures before changing shared contracts.

**Files and symbols:**

- `components/packages/foundation/artifact-store/src/archive-recovery/index.ts`
  — `resolveArchivePathAcrossSessionsByArtifactRef`,
  `resolveArchivePathFromLookup`, `renderRecoveredArchive`
- `components/packages/features/reduction/src/reduction/tool-payload-router.ts`
  — `summarizeNodeTestOutput`
- `components/products/cli/src/clean-renderer.ts` — `renderCleanPreview`
- Existing focused tests under artifact-store, Reduction, Codex, and CLI.

**Steps:**

1. Pin merged `main` at `21aa82e`; use existing fixtures and temp directories.
2. Delete a root-level artifact lookup index after writing a workspace archive;
   restart resolver state and verify current behavior fails or skips fallback.
3. Point lookup index at a missing archive while intact archive remains in the
   trusted workspace directory; record miss and repair expectations.
4. Search repeated matches with context and a budget smaller than one complete
   block; record throw, truncation, continuation, and line coordinates.
5. Use multiline TAP `expected`, `actual`, and stack fixtures; assert current
   header/body association and omission behavior.
6. Render preview data containing nonzero `transportDeltaChars` and
   `transportDeltaBytes`; record fields currently absent from CLI output.

**Exit criteria:** Each reproduced defect has a focused regression shape. If a
case does not reproduce, remove it from implementation scope and record why.

### Task 1: Restore Trusted Workspace Exact Recovery

**Purpose:** Recover verified workspace archives after derived-index loss.

**Owners:** Artifact Store only; MCP/OpenClaw keep using shared resolver.

**Files:**

- `components/packages/foundation/artifact-store/src/archive-recovery/index.ts`
- `components/packages/foundation/artifact-store/src/archive-recovery/archive-paths.ts`
- `components/packages/foundation/artifact-store/src/archive-recovery/tool-result-persist.ts`
- `components/packages/foundation/artifact-store/tests/archive-recovery.test.ts`

**Steps:**

1. Preserve current digest-sharded lookup probes and legacy `dataKey` lookup.
2. When trusted workspace context exists and root lookup is missing/stale, probe
   existing `workspaceArchiveDirCandidates` only; do not accept caller paths.
3. Locate candidate by exact artifact digest, read archive, verify stored
   content/digest, then return original content.
4. Repair the existing artifact-location index atomically after verification.
5. Keep repair failure non-fatal to verified recovery and preserve corruption
   rejection.

**Verification:** Add tests for deleted index, stale missing-archive entry,
restart recovery, repaired lookup, corrupted candidate, and unchanged legacy
`dataKey` latest-version selection. Run artifact-store test and typecheck.

**Exit criteria:** All six recovery acceptance cases pass without new registry,
engine, or arbitrary path input.

### Task 2: Make CCR Search Budget-Aware During Admission

**Purpose:** Bound output while retaining complete match/context blocks and
truthful stateless continuation.

**Files:**

- `components/packages/foundation/artifact-store/src/archive-recovery/index.ts`
- `components/packages/foundation/artifact-store/tests/archive-recovery.test.ts`
- `components/packages/foundation/artifact-store/scripts/bench-recovery.mjs`
  only if existing benchmark assertions need contract updates.

**Steps:**

1. Scan requested archive-relative interval and build one complete match/context
   block at a time.
2. Reserve response framing budget, then admit block only when it fits. Stop
   before the first block that cannot fit; never throw solely for valid evidence
   exceeding `maxOutputChars`.
3. Set `scanComplete` from interval examination, not from whether matches were
   omitted. Add or preserve additive `resultsComplete` for all-results status.
4. Set `truncated` when `maxMatches` or output budget omits evidence. Set
   `nextStartLine` to first unreturned normal match, not last returned match.
5. For one oversized block, return a bounded marker with exact archive-relative
   line and recovery guidance, or a structured recoverable condition that cannot
   repeat the same continuation forever.
6. Keep search stateless and preserve existing `startLine`/`endLine` semantics.

**Verification:** Test full-fit, max-match truncation, budget truncation,
context-overlap, archive-relative continuation, empty result, and one oversized
line. Assert no throw, no duplicate/skip, truthful completion fields, and
bounded serialized output. Run artifact-store test, typecheck, and recovery
benchmark.

**Exit criteria:** Every valid search returns bounded evidence or an explicit
recoverable condition; continuation is deterministic and non-repeating.

### Task 3: Preserve Ordered TAP Diagnostic Blocks

**Purpose:** Keep diagnostic fields attached to their multiline values under
RTK output budgets.

**Files:**

- `components/packages/features/reduction/src/reduction/tool-payload-router.ts`
  — `summarizeNodeTestOutput`
- `components/packages/features/reduction/tests/tool-payload-router.test.ts`

**Steps:**

1. Parse source-ordered failure identity, location, expected block, actual block,
   operator, stack, completion, and exit evidence.
2. Treat each field header plus continuation body as one budgeted block.
3. Omit whole fields when needed with field-specific marker and existing exact
   recovery guidance; never emit orphaned continuation lines.
4. Preserve command-family detection, execution status, failure identity, and
   TypeScript diagnostic behavior.

**Verification:** Add multiline expected/actual/stack fixtures with interleaved
continuations and tight budgets. Assert retained values stay with correct field,
source order is stable, omitted field names are explicit, recovery reference is
preserved, and known exit status remains visible. Run Reduction test and
typecheck.

**Exit criteria:** No detached, reordered, or unlabeled diagnostic body remains.

### Task 4: Expose Existing Cleaner Transport Deltas

**Purpose:** Fix reporting only; do not add Cleaner lifecycle behavior.

**Files:**

- `components/packages/features/cleaner/src/contracts.ts`
- `components/packages/features/cleaner/src/orchestrator.ts`
- `components/adapters/codex/src/context-cleaner/bridge.ts`
- `components/adapters/codex/tests/context-cleaner-bridge.test.ts`
- `components/products/cli/src/clean-renderer.ts`
- `components/products/cli/tests/clean.test.ts`

**Steps:**

1. Preserve existing backend `transportDeltaChars` and `transportDeltaBytes`;
   add only missing view plumbing.
2. Render gross released content, net expanded-context savings, immediate
   transport delta, unchanged history items, and `Provider cache outcome:
   unknown`.
3. Label characters and UTF-8 bytes separately. Never label transport delta as
   actual cached tokens.
4. Keep preview inspection-only and preserve stale revision, fingerprint, and
   empty-selection validation.

**Verification:** Extend CLI and bridge tests with Unicode values, null/unknown
transport deltas, nonzero positive/negative deltas, and unchanged state files.
Run Cleaner, Codex, and CLI tests/typechecks.

**Exit criteria:** Existing backend measurements appear in CLI output with
correct units and no lifecycle side effects.

### Task 5: Integration, Documentation, and Final Verification

**Purpose:** Prove combined correctness and reconcile active documentation.

**Steps:**

1. Run focused tests/typechecks for artifact-store, Reduction, Cleaner, Codex,
   CLI, MCP, and OpenClaw when affected.
2. Run workspace `pnpm test`, `pnpm typecheck`, and `pnpm build`.
3. Run recovery and relevant local benchmarks. Report measured local values
   separately from provider-unavailable claims; do not reopen forwarding watch.
4. Append a concise post-merge erratum to the completed P1 ledger; preserve its
   completed historical record while naming these residual defects and approved
   pressure/provider deferrals.
5. Record pressure and provider-backed evaluation as explicitly deferred.

**Exit criteria:** All four corrective outcomes pass fresh proof, no unrelated
scope enters the branch, and documentation names one current owner for residual
work.

## Verification

- [x] Task 0 reproductions recorded against merged `21aa82e`.
- [x] Workspace exact recovery handles missing/stale indexes and corruption.
- [x] CCR output stays within budget and continuation never skips/repeats.
- [x] `scanComplete`, `resultsComplete`, `truncated`, and `nextStartLine` are
      truthful and backward-compatible where existing fields remain.
- [x] TAP multiline fields retain source order and association.
- [x] Cleaner transport chars/bytes render separately; provider cache stays
      unknown without receipts.
- [x] Focused tests and typechecks pass.
- [x] Full workspace tests, typecheck, and build pass.
- [x] No pressure, provider, or forwarding optimization claim is added.

## Completion Criteria

- Tasks 0–5 complete with fresh evidence recorded.
- No reproduced RTK/CCR defect remains within approved scope.
- Completed P1 ledger remains historically accurate.
- Context-pressure and provider-backed evaluation remain deferred.
- Branch/worktree state and next action are recorded before Git disposition.
