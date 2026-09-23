---
layer: change
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: completed
name: LightRSI RTK, CCR, and Context Cleaner
targets:
  - components/packages/foundation/artifact-store/src/archive-recovery/index.ts
  - components/packages/foundation/artifact-store/src/archive-recovery/tool-result-persist.ts
  - components/packages/features/reduction/src/reduction/content-classifier.ts
  - components/packages/features/reduction/src/reduction/tool-payload-router.ts
  - components/packages/features/reduction/src/passes/pass-tool-payload-trim.ts
  - components/packages/features/reduction/src/passes/pass-read-state-compaction.ts
  - components/packages/features/reduction/src/passes/pass-exec-output-truncation.ts
  - components/products/mcp/src/index.ts
  - components/adapters/openclaw/src/context-stack/page-in/recovery-tool.ts
  - components/adapters/openclaw/src/context-stack/page-in/recovery-protocol.ts
  - components/packages/features/cleaner/src/contracts.ts
  - components/packages/features/cleaner/src/control-service.ts
  - components/packages/features/cleaner/src/orchestrator.ts
  - components/adapters/codex/src/context-cleaner/bridge.ts
---

# LightRSI RTK, CCR, and Context Cleaner

## Goal

Close existing RTK and CCR correctness gaps, restore green workspace tests,
then add one lazy Context Cleaner inspection-evidence layer. Preserve canonical
history, exact occurrence validation, host rebase, and committed release
receipts as the only release authority.

Current baseline: commit `a052800` on `main`.

## Scope

- RTK command-aware reduction fidelity for Node TAP and TypeScript diagnostics.
- Exact `artifactRef` publication through all Reduction passes.
- Side-effect-free exact-reference index repair.
- One archive-relative recovery coordinate contract.
- MCP and OpenClaw recovery contract parity.
- CCR lookup benchmark correction and measured lookup improvements.
- Lazy duplicate evidence, cache-aware release preview, and context-pressure
  evidence through Cleaner inspection.

## Non-goals

- New recovery engine or second CCR implementation.
- Database-backed archive registry.
- Automatic context pruning or automatic occurrence release.
- Semantic archive search.
- Precise provider-token prediction from character counts.
- Persistent duplicate-group registry.
- Prompt reminders on every model request.
- Broad new command-family coverage before current contracts pass.

## Invariants

1. `artifactRef` identifies exact archived content.
2. `dataKey` keeps existing latest-resource selection behavior.
3. Occurrence fingerprint remains release-validation identity.
4. `startLine` and `endLine` always address archive-relative lines.
5. Source-relative coordinates remain additive provenance only.
6. Failed archive writes never publish recoverable replacement text.
7. Exact-reference index repair never changes legacy `dataKey` selection.
8. Cleaner inspection never creates plans, receipts, claims, archives, or
   execution events.
9. Only agent-approved Cleaner execution can release occurrences.
10. Unknown usage or cache evidence remains explicitly unknown.

## Execution Order

1. Establish baseline and reproduce CI divergence.
2. Close recovery publication, lookup repair, coordinates, and host parity.
3. Close RTK diagnostic fidelity.
4. Correct CCR benchmark and optimize only measured lookup work.
5. Add Cleaner inspection evidence in three optional outputs.
6. Run focused and workspace verification.

Shared artifact and reduction contracts stay sequential. Cleaner evidence starts
only after exact recovery and RTK tests pass.

## Task 0: Establish Baseline

**Files:** no source changes.

**Steps:**

1. Run `pnpm typecheck`.
2. Run `pnpm build`.
3. Run `pnpm test`.
4. Run `pnpm --dir components/packages/foundation/artifact-store bench:recovery`.
5. Record failing tests, recovery coordinate output, and benchmark output.
6. Separate local failures from CI-only adapter failures.

**Verification:**

- Baseline commands complete or produce a recorded failure list.
- No implementation starts while an existing failure is misclassified as a new
  regression.

## Milestone 1: RTK and CCR Correctness Closure

### Task 1.1: Publish Exact Recovery References

**Files:**

- `components/packages/foundation/artifact-store/src/archive-recovery/index.ts`
- `components/packages/features/reduction/src/passes/pass-tool-payload-trim.ts`
- `components/packages/features/reduction/src/passes/pass-read-state-compaction.ts`
- `components/packages/features/reduction/src/passes/pass-exec-output-truncation.ts`
- `components/packages/features/reduction/tests/tool-payload-trim-recovery.test.ts`
- `components/packages/features/reduction/tests/read-state-compaction.test.ts`
- New focused test for `pass-exec-output-truncation.ts`

**Steps:**

1. Reuse `buildArtifactRef()` to derive reference before rendering replacement.
2. Render final replacement with exact `artifactRef` notice.
3. Compare final replacement length against original content.
4. Return unchanged content when final notice removes net savings.
5. Archive original content only after savings passes.
6. Publish replacement and reduction metadata only after archive succeeds.
7. Persist `artifactRef` in each pass's reduction metadata.
8. Keep `dataKey` in metadata for compatibility.

A narrow shared helper may own this sequence across the three passes. It must
not own lifecycle decisions or create another recovery abstraction.

**Acceptance:**

- Two contents sharing one `dataKey` recover exact originating content by
  advertised `artifactRef`.
- Archive failure leaves original segment and metadata unchanged.
- Recovery notice overhead participates in net-savings decision.
- Existing recovery-exempt segments remain untouched.

**Verification:**

- `pnpm --dir components/packages/features/reduction test`
- `pnpm --dir components/packages/foundation/artifact-store test`

### Task 1.2: Separate Exact and Legacy Index Repair

**Files:**

- `components/packages/foundation/artifact-store/src/archive-recovery/index.ts`
- `components/packages/foundation/artifact-store/src/archive-recovery/tool-result-persist.ts`
- `components/packages/foundation/artifact-store/tests/archive-recovery.test.ts`

**Steps:**

1. Keep archive publication updating both artifact-location and latest-key
   indexes.
2. Split internal writes into artifact-location and latest-`dataKey` duties.
3. Change exact-reference fallback repair to update artifact-location only.
4. Validate archive digest and content before accepting repaired location.
5. Keep indexes rebuildable derived state, never resource-selection authority.

**Acceptance:**

1. Archive content A under `dataKey=X`.
2. Archive content B under `dataKey=X`.
3. Recover A by `artifactRef` with missing artifact index.
4. Recover by `dataKey=X`.
5. Legacy recovery still returns B.

**Verification:**

- Artifact-store recovery tests cover indexed hit, fallback repair, stale index,
  missing artifact, and same-key multiple versions.
- `pnpm --dir components/packages/foundation/artifact-store test`

### Task 1.3: Make Recovery Coordinates Archive-Relative

**Files:**

- `components/packages/foundation/artifact-store/src/archive-recovery/index.ts`
- `components/products/mcp/src/index.ts`
- `components/adapters/openclaw/src/context-stack/page-in/recovery-tool.ts`
- `components/packages/foundation/artifact-store/tests/archive-recovery.test.ts`
- `components/products/mcp/tests/server.test.ts`

**Contract:**

- Request `startLine` and `endLine` address archived text.
- `details.lineBasis` is always `archive-relative`.
- `details.recoveredStartLine` and `details.recoveredEndLine` are archive lines.
- When provenance contains `readWindow.offset`, add
  `sourceStartLine` and `sourceEndLine` without changing request semantics.

**Steps:**

1. Remove offset-based reinterpretation of request coordinates.
2. Preserve source offset only for additive provenance fields.
3. Update range, stats, and search rendering text.
4. Update MCP and OpenClaw protocol documentation.
5. Update tests that currently expect `source-relative`.

**Verification:**

- Range request against bounded read returns requested archive line.
- Details expose correct source line when offset exists.
- Invalid `startLine > endLine` remains rejected.
- `pnpm --dir components/products/mcp test`

### Task 1.4: Restore Host Recovery Parity

**Files:**

- `components/adapters/openclaw/src/context-stack/page-in/recovery-tool.ts`
- `components/adapters/openclaw/src/context-stack/page-in/recovery-protocol.ts`
- `components/adapters/openclaw/src/reduction-proxy.test.ts`
- New focused OpenClaw recovery-tool test if existing coverage cannot exercise
  direct tool registration.

**Steps:**

1. Accept exactly one of `artifactRef` or `dataKey`.
2. Resolve `artifactRef` through shared exact archive resolver.
3. Preserve legacy `dataKey` lookup and errors.
4. Return shared rendering details and context-safe metadata.
5. Update protocol text to describe both references.
6. Verify Codex and Claude Code continue using shared MCP contract.

**Acceptance:**

- OpenClaw consumes a current `artifactRef` notice.
- Legacy `dataKey` notice still works.
- Both references reject missing or ambiguous input.
- MCP, OpenClaw, Codex, and Claude Code expose equivalent recovery semantics.

**Verification:**

- `pnpm --dir components/adapters/openclaw test`
- `pnpm --dir components/adapters/codex test`
- `pnpm --dir components/adapters/claude-code test`
- `pnpm --dir components/products/mcp test`

### Task 1.5: Finish RTK Diagnostic Fidelity

**Files:**

- `components/packages/features/reduction/src/reduction/content-classifier.ts`
- `components/packages/features/reduction/src/reduction/tool-payload-router.ts`
- `components/packages/features/reduction/src/passes/pass-tool-payload-trim.ts`
- `components/packages/features/reduction/tests/tool-payload-router.test.ts`
- `components/packages/features/reduction/tests/tool-payload-trim-recovery.test.ts`
- `components/adapters/codex/tests/reduction.test.ts`
- `components/adapters/openclaw/src/reduction-proxy.test.ts`

**Steps:**

1. Merge execution hints without allowing `undefined` to erase known command
   provenance.
2. Preserve known `exitCode` and completion state.
3. Replace fixed Node TAP continuation count with bounded failure-block parsing.
4. Preserve `actual`, `expected`, `operator`, `stack`, `code`, and
   `failureType` evidence when present.
5. Keep TypeScript diagnostic file and message identity case-sensitive.
6. Preserve continuation lines under the existing evidence budget.
7. Keep explicit incomplete-output marker when completion is unknown or running.

Extend `summarizeNodeTestOutput()` and
`summarizeTypeScriptDiagnostics()` in the existing router. Do not add a second
parser subsystem.

**Acceptance:**

- Reduced Node TAP retains every selected failure's actionable assertion data.
- Long TAP continuation blocks do not lose decisive `actual` values solely due
  to line position.
- Case-sensitive TypeScript paths remain distinct.
- Reduced output retains final execution status or exact recovery remains usable.

**Verification:**

- `pnpm --dir components/packages/features/reduction test`
- `pnpm --dir components/adapters/codex test`
- `pnpm --dir components/adapters/openclaw test`

## Milestone 2: CCR Efficiency Closure

### Task 2.1: Correct Recovery Benchmark

**Files:**

- `components/packages/foundation/artifact-store/scripts/bench-recovery.mjs`
- `components/packages/foundation/artifact-store/package.json`

**Steps:**

1. Generate distinct content for every archive entry.
2. Select explicit early and late target references.
3. Measure indexed early hit.
4. Measure indexed late hit.
5. Measure missing index followed by rebuild.
6. Measure stale index.
7. Measure missing artifact.
8. Measure large archive with small requested range.
9. Separate cold and warm filesystem runs.
10. Use at least 50 samples for median and p95.
11. Verify returned digest and content before recording timing.

**Metrics:**

- Median and p95 lookup latency.
- Archive files inspected.
- Archive bytes read.
- Correctness result.
- Returned characters.
- Search scan completeness.

**Verification:**

- `pnpm --dir components/packages/foundation/artifact-store bench:recovery`
- No performance claim is accepted without identical before/after workload and
  correctness checks.

### Task 2.2: Optimize Only Measured Lookup Work

**Files:**

- `components/packages/foundation/artifact-store/src/archive-recovery/index.ts`
- `components/packages/foundation/artifact-store/tests/archive-recovery.test.ts`

**Steps:**

1. Check all indexed artifact locations before fallback scanning.
2. Keep exact-reference fallback complete; never return false because an
   internal scan was silently capped.
3. Bound search result output with explicit `maxMatches` and `scanComplete`.
4. Preserve omitted-match count and truncation details.
5. Add continuation metadata only for bounded search output.
6. Defer sparse offsets or storage redesign until benchmark evidence requires it.

**Acceptance:**

- Exact recovery remains complete and digest-validated.
- Search output remains bounded and explicit about incompleteness.
- Larger archive benchmark shows reduced lookup work without correctness loss.

## Milestone 3: Context Cleaner Inspection Evidence

### Task 3.1: Add Shared Inspection Contracts

**Files:**

- `components/packages/features/cleaner/src/contracts.ts`
- `components/packages/features/cleaner/src/control-service.ts`
- `components/packages/features/cleaner/src/orchestrator.ts`
- Cleaner contract and orchestrator tests.

Add optional inspection outputs:

```typescript
type DuplicateEvidence = {
  contentDigest: string;
  occurrenceIds: string[];
  occurrenceCount: number;
  combinedChars: number;
};

type ContextPressureEvidence = {
  level: "normal" | "elevated" | "critical" | "unknown";
  source: "provider_usage" | "token_estimate" | "unavailable";
  observedRevision?: string;
  observedAt?: string;
};
```

Add cache preview contract with:

- selected occurrence count
- gross and net character savings
- earliest changed history item
- unchanged prefix item count
- provider cache outcome: `preserved`, `changed`, or `unknown`

Preview remains observation-only and never creates lifecycle records.

### Task 3.2: Compute Duplicate Evidence Lazily

**Files:**

- `components/adapters/codex/src/context-cleaner/bridge.ts`
- `components/packages/features/cleaner/src/contracts.ts`
- Codex Cleaner bridge and occurrence acceptance tests.

**Rules:**

1. Compute from canonical effective-history content during inspection.
2. Digest exact canonical content bytes plus compatible payload kind.
3. Exclude call IDs, response IDs, and occurrence identity from content digest.
4. Preserve existing occurrence fingerprints for release validation.
5. Do not persist groups.
6. Do not infer safe removal from duplicate membership.
7. Return explicit unavailable evidence for hosts without canonical content.

### Task 3.3: Add Side-Effect-Free Cache Release Preview

**Files:**

- `components/packages/features/cleaner/src/control-service.ts`
- `components/packages/features/cleaner/src/orchestrator.ts`
- `components/packages/foundation/host-adapter/src/context-rewrite/contracts.ts`
- `components/adapters/codex/src/context-cleaner/bridge.ts`
- Existing Cleaner and Codex context-rewrite tests.

**Steps:**

1. Validate selected occurrence IDs and fingerprints against current snapshot.
2. Reuse existing host rewrite preparation to build before/after candidate
   representations.
3. Compare encoded outgoing request structure and bytes.
4. Report first changed history item and unchanged prefix length.
5. Return cache outcome as structural evidence, never exact token prediction.
6. Do not call plan persistence, receipt persistence, archive writes, or
   execution bridges.

**Acceptance:**

- Preview does not modify state directory.
- Preview does not create plan or receipt files.
- Candidate release remains validated against current revision.
- Unknown provider semantics return `unknown`.

### Task 3.4: Add Usage-Aware Context Pressure

**Files:**

- `components/packages/features/cleaner/src/contracts.ts`
- `components/adapters/codex/src/context-cleaner/bridge.ts`
- Codex Cleaner bridge tests.

**Rules:**

- `chars_only` never produces confident pressure.
- Provider usage requires authoritative used tokens, effective context limit,
  and reserved output budget.
- Token estimate uses only an existing authoritative estimator.
- Missing or stale inputs return `unknown`.
- Use fixed bands: normal below 70%, elevated from 70% through 85%, critical
  above 85% of available context after reserved output.
- Emit through Cleaner inspection or meaningful state changes only.
- Never auto-release occurrences.

## Final Verification

Run:

```powershell
pnpm --dir components/packages/foundation/artifact-store test
pnpm --dir components/packages/features/reduction test
pnpm --dir components/packages/features/cleaner test
pnpm --dir components/products/mcp test
pnpm --dir components/adapters/openclaw test
pnpm --dir components/adapters/codex test
pnpm --dir components/adapters/claude-code test
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Required evidence:

- Exact recovery works for all three Reduction passes.
- Exact-reference repair leaves legacy lookup unchanged.
- Archive-relative coordinates pass MCP and OpenClaw tests.
- RTK output preserves actionable diagnostics and completion state.
- OpenClaw, MCP, Codex, and Claude Code recovery contracts agree.
- Benchmark targets distinct archive content and reports median/p95.
- Cleaner preview is side-effect-free.
- Unknown pressure and cache states remain unknown.
- No automatic release, new registry, database, or second recovery engine.

## Completion Criteria

1. Baseline failures are classified and no required failure is hidden.
2. All Milestone 1 focused tests pass.
3. CCR benchmark proves lookup scenarios with distinct target content.
4. Cleaner evidence remains lazy, optional, and non-authoritative.
5. Full workspace verification passes.
6. Documentation matches final recovery and Cleaner contracts.
7. Real multi-turn sessions are measured before further optimization.

No commit, push, merge, or branch cleanup belongs to implementation execution.
Those actions require separate user authorization.
