---
layer: change
artifact_type: plan
status: completed
template_id: implementation-plan
name: lightrsi-namespace-migration
parent_spec: docs/superpowers/specs/2026-08-18-22-28-lightrsi-namespace-migration-compatibility-spec.md
targets:
  - components/adapters/codex
  - components/packages/foundation/host-adapter
  - components/packages/features/stabilizer
  - components/products/cli
  - components/presets/tokenpilot
  - scripts
  - package.json
  - pnpm-lock.yaml
  - tsconfig.base.json
---

# LightRSI Namespace Migration Implementation Plan

## Objective

Migrate local LightMem2 product namespace to LightRSI while preserving existing
cache identity, persisted state, TokenPilot runtime ownership, 9Router routing,
models, aliases, credentials, agents, context quality, and user payloads.

Owning specification:
`docs/superpowers/specs/2026-08-18-22-28-lightrsi-namespace-migration-compatibility-spec.md`.

Direct cherry-pick of upstream `c99e54f` is forbidden. Use it as bounded rename
evidence only; manually reconcile local cache and telemetry changes.

## Execution Approach

- Sequential lead execution in one isolated native Git worktree.
- No parallel agents: cache, proxy, package scope, lockfile, and generated
  surfaces share ownership and require ordered fan-in.
- Use `skill-using-git-worktrees` before edits.
- Use `skill-test-driven-development` for behavior changes.
- Use `skill-backend-verification` for state, daemon, proxy, and routing proof.
- Use `skill-verification-before-completion` before completion claim.
- Preserve unrelated work. Never reset, clean, overwrite, or stash user changes.
- No commit, merge, push, or branch deletion without explicit Git authorization.

## Precondition

Current worktree contains overlapping tracked and untracked cache work. Execution
must stop unless current work is preserved through either an authorized local
checkpoint commit or a verified binary patch plus explicit untracked-file copy
manifest. `.serena/`, `outputs/`, logs, caches, archives, and runtime state must
not be copied or committed as source.

## Task Dependency Graph

```text
Task 1 workspace isolation
  -> Task 2 cache-key compatibility
  -> Task 3 persisted/config/model compatibility
  -> Task 4 CLI/state/daemon compatibility
  -> Task 5 atomic package/product rename
  -> Task 6 documentation and generated surfaces
  -> Task 7 full and live verification
  -> Task 8 final review and handoff
```

### Task 1: Preserve Current Work and Establish Migration Worktree

**Purpose:** Prevent local cache-work loss and isolate high-risk rename edits.

**Task Function:** Workspace preparation and evidence capture.

**Template Profile:** high

**Required Skills:** `skill-using-git-worktrees`

**Dependencies:** None.

**Files:** Current tracked changes, intended untracked `components/` source/tests,
active spec, and this plan.

**Authority:** May inspect Git state and create isolated worktree. Stop before
commit, stash, reset, clean, move, or deletion without explicit approval.

**Steps:**

1. Record local HEAD, upstream LightRSI HEAD, merge base, branch, and full status.
2. Inventory intended untracked source/test files; exclude runtime artifacts.
3. Create approved checkpoint or external binary patch plus copy manifest.
4. Verify reconstruction in temporary checkout, then create migration worktree.
5. Confirm intended cache changes and spec/plan exist in isolated worktree.
6. Confirm original worktree status remains unchanged.

**Verification:** `git status --porcelain`, `git rev-parse HEAD`,
`git diff --check`, reconstructed file inventory, and focused baseline Codex and
stabilizer tests.

**Exit Criteria:** Isolated worktree reproduces intended source state, original
worktree remains untouched, and baseline tests match pre-migration evidence.

### Task 2: Lock Brand-Neutral Cache Compatibility

**Purpose:** Prevent cache fragmentation before namespace writers change.

**Task Function:** TDD bug prevention and shared cache-key parsing.

**Template Profile:** high

**Required Skills:** `skill-test-driven-development`, `skill-backend-verification`

**Dependencies:** Task 1.

**Files:**

- `components/adapters/codex/src/stable-prefix.ts`
- `components/adapters/codex/src/proxy-runtime.ts`
- `components/adapters/codex/src/upstream.ts`
- `components/adapters/codex/src/cache-audit.ts`
- `components/adapters/codex/src/session-state.ts`
- `components/adapters/codex/src/router-cache-telemetry.ts`
- `components/adapters/codex/tests/stable-prefix.test.ts`
- `components/adapters/codex/tests/proxy-wire-prefix.test.ts`
- `components/adapters/codex/tests/session-state.test.ts`
- `components/adapters/codex/tests/daemon.test.ts`
- `components/adapters/codex/tests/upstream.test.ts`
- `components/adapters/codex/tests/router-cache-telemetry.test.ts`
- `components/packages/features/stabilizer/src/message-text.ts`
- `components/packages/features/stabilizer/src/stable-prefix-audit.ts`
- `components/packages/features/stabilizer/src/stable-prefix-contract.ts`
- `components/packages/features/stabilizer/tests/host-pipeline-integration.test.ts`
- existing cache-audit tests beside `cache-audit.ts`

**Authority:** Preserve `lightmem2-family-*` and existing
`lightmem2CacheContract*` metadata names. Do not rewrite provider payloads.

**Steps:**

1. Add failing tests for both `lightmem2-codex-<digest>` and
   `lightrsi-codex-<digest>` as framework-owned keys.
2. Add negative tests for malformed host, digest length, case, and non-hex data.
3. Prove old/new keys with same digest yield identical stable-core hash,
   contract digest, family ID, session mapping, and wire hash.
4. Prove changed model, reasoning option, tools, schema, or stable instructions
   remain separate.
5. Replace literal prefix slicing and one-prefix checks with one parser exported
   from `stable-prefix.ts`; reuse it in proxy and session callers.
6. Keep persisted/emitted family and cache metadata protocol fields unchanged.
7. Change product-facing prompt-cache writer only after dual-read tests pass.
8. Compare provider-bound payloads and prove no semantic change.
9. Preserve local DeepAgents path normalization, stable-prefix audit bounds,
   router endpoint digest, provider cache telemetry, and retry/storage limits.

**Verification:**

```powershell
npm --prefix components/adapters/codex test
npm --prefix components/adapters/codex run typecheck
npm --prefix components/packages/features/stabilizer test
npm --prefix components/packages/features/stabilizer run typecheck
```

Record safe hashes only; never log prompts, credentials, or full payloads.

**Exit Criteria:** Old/new branded keys share semantic family, malformed keys do
not merge, semantic differences remain separated, and metadata stays compatible.

### Task 3: Add Schema, Environment, and Model Compatibility

**Purpose:** Make new writers canonical while preserving active legacy reads.

**Task Function:** TDD compatibility readers and normalization.

**Template Profile:** high

**Required Skills:** `skill-test-driven-development`, `skill-backend-verification`

**Dependencies:** Task 2.

**Files:**

- `components/adapters/codex/src/context-history/types.ts`
- `components/adapters/codex/src/context-history/request-journal.ts`
- `components/adapters/codex/src/context-history/journal-store.ts`
- `components/adapters/codex/src/context-rewrite/rebase-epoch.ts`
- `components/adapters/codex/src/context-rewrite/rebase-cooldown.ts`
- `components/adapters/codex/src/context-rewrite/rebase-capability.ts`
- `components/adapters/codex/src/context-rewrite/estimator-config.ts`
- matching context-history/rebase tests under `components/adapters/codex/tests/`
- `components/packages/foundation/host-adapter/src/state/token-counter.ts`
- `components/packages/foundation/host-adapter/tests/token-counter.test.ts`

**Authority:** Accept only enumerated old schema versions. No broad prefix
acceptance and no per-model alias tables.

**Steps:**

1. Add fixtures for supported `lightmem2.* /v1` and canonical `lightrsi.* /v1`
   state across history, epoch, cooldown, and capability readers.
2. Change writers to canonical schemas; keep explicit dual readers.
3. Add environment tests for explicit config, `LIGHTRSI_*`, `LIGHTMEM2_*`,
   `TOKENPILOT_*`, empty values, conflicts, and invalid values.
4. Implement ordered lookup at existing owner boundaries; no global config layer.
5. Add model tests for `tokenpilot/`, `lightmem2/`, and `lightrsi/`, including
   `gpt-5.6-sol` and `cx/gpt-5.6-sol`.
6. Normalize one recognized leading prefix only; preserve provider-qualified
   names and leave route resolution to 9Router.

**Verification:**

```powershell
npm --prefix components/adapters/codex test
npm --prefix components/packages/foundation/host-adapter test
npm --prefix components/adapters/codex run typecheck
npm --prefix components/packages/foundation/host-adapter run typecheck
```

**Exit Criteria:** Legacy fixtures read, new writes are canonical, precedence is
deterministic, and model prefixes normalize uniformly.

### Task 4: Migrate CLI State and Single Daemon Ownership

**Purpose:** Introduce canonical LightRSI commands/state without duplicate proxy
processes or destructive legacy-state migration.

**Task Function:** TDD CLI, state fallback, installer, and daemon lifecycle work.

**Template Profile:** high

**Required Skills:** `skill-test-driven-development`, `skill-backend-verification`

**Dependencies:** Task 3.

**Files:**

- `components/products/cli/src/cli.ts`
- `components/products/cli/src/dispatch.ts`
- `components/products/cli/src/context-store.ts`
- `components/products/cli/src/hosts/visual-daemon.ts`
- `components/products/cli/src/hosts/shared.ts`
- `components/products/cli/scripts/install-cli.sh`
- `components/products/cli/tests/*.test.ts` covering CLI, install, and visual daemon
- `components/adapters/codex/src/cli.ts`
- `components/adapters/codex/src/config.ts`
- `components/adapters/codex/src/daemon.ts`
- `components/adapters/codex/src/install.ts`
- `components/adapters/codex/src/product-registration.ts`
- `components/adapters/codex/scripts/install-codex.ts`
- `components/adapters/codex/scripts/doctor-codex.ts`
- `components/adapters/codex/tests/config.test.ts`
- `components/adapters/codex/tests/install.test.ts`
- `components/adapters/codex/tests/daemon.test.ts`

**Authority:** Legacy state is read-only fallback and never deleted. Canonical and
legacy commands must resolve one daemon, state directory, lock, and port.

**Steps:**

1. Add state-path tests for canonical present, legacy-only, both present, empty,
   write failure, and rollback fixture.
2. Implement canonical `~/.lightrsi/state`, legacy `~/.lightmem2/state` fallback,
   and canonical-only writes; preserve TokenPilot host-state paths.
3. Add lifecycle tests invoking canonical and legacy CLIs against one running
   proxy; prove no duplicate process, port collision, or divergent state.
4. Add `lightrsi` canonical executable and keep `lightmem2` plus
   `lightmem2-install-*` aliases routed through same implementation.
5. Install canonical `lightrsi-status`, `lightrsi-report`, `lightrsi-doctor`, and
   `lightrsi-visual` skills.
6. Remove legacy command-skill directories only when known manifest/filenames
   prove adapter ownership; test repeated installation for idempotency.
7. Verify no startup fallback bypasses TokenPilot or routes Codex directly to
   9Router/provider when TokenPilot fails.

**Verification:**

```powershell
npm --prefix components/products/cli test
npm --prefix components/products/cli run typecheck
npm --prefix components/adapters/codex test
npm --prefix components/adapters/codex run typecheck
```

**Exit Criteria:** Canonical/legacy commands share one runtime, state migration is
non-destructive, installer is idempotent, and TokenPilot failure stays visible.

### Task 5: Apply Atomic Package and Product Namespace Rename

**Purpose:** Complete workspace namespace migration without mixed package scope.

**Task Function:** Mechanical atomic rename with boundary validation.

**Template Profile:** high

**Required Skills:** `skill-test-driven-development`

**Dependencies:** Task 4.

**Files:**

- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `scripts/check-package-boundaries.mjs`
- `scripts/release/build-local.sh`
- `scripts/release/smoke-host-package.mjs`
- `scripts/release/smoke-openclaw-package.mjs`
- `scripts/release/verify-version.mjs`
- package manifests under `components/adapters/{claude-code,codex,openclaw}`
- package manifests under `components/packages/features/{eviction,memory,reduction,stabilizer}`
- package manifests under `components/packages/foundation/{artifact-store,history,host-adapter,kernel,product-surface,runtime-core}`
- `components/presets/tokenpilot/package.json`
- `components/products/{cli,mcp}/package.json`
- all TypeScript imports and test imports returned by
  `rg -l '@lightmem2/' components scripts -g '*.ts' -g '*.mjs'`

**Authority:** Perform one package-scope transaction. Preserve grandfathered
compatibility strings, schema readers, cache IDs, metadata fields, CLI aliases,
and TokenPilot identities. Never edit `node_modules`.

**Steps:**

1. Freeze pre-edit inventory of every `@lightmem2/*`, `LightMem2`, `lightmem2`,
   and `LIGHTMEM2_*` occurrence and classify canonical rename vs compatibility.
2. Apply `@lightrsi/*` scope across manifests, imports, TS aliases, scripts, and
   package-boundary rules in one change set.
3. Rename root package/scripts and canonical public product strings to LightRSI.
4. Preserve explicit compatibility surfaces from Tasks 2-4 and the active spec.
5. Regenerate `pnpm-lock.yaml` using existing package manager; do not hand-edit
   workspace links beyond conflict resolution.
6. Run zero-leftover inventory. Any remaining old term must be classified as
   compatibility, historical citation, or approved TokenPilot identity.
7. Compare local result with upstream `c99e54f` file inventory, then reconcile
   intentionally retained local cache and telemetry behavior.

**Verification:**

```powershell
pnpm install --lockfile-only
pnpm check:boundaries
pnpm typecheck
pnpm build
pnpm release:verify
rg -n '@lightmem2/|LightMem2|lightmem2|LIGHTMEM2_' components scripts package.json tsconfig.base.json
```

**Exit Criteria:** Workspace has one canonical package scope, lockfile and imports
resolve, and every remaining legacy string has explicit compatibility ownership.

### Task 6: Update Documentation and Generated Product Surfaces

**Purpose:** Align user-facing naming only after runtime compatibility passes.

**Task Function:** Documentation, examples, skills, and generated-surface sync.

**Template Profile:** normal

**Required Skills:** `skill-code-standards`

**Dependencies:** Task 5.

**Files:**

- `README.md`
- `components/README.md`
- adapter and package README files changed by upstream `c99e54f`
- `docs/adapter-playbook.md`
- `docs/acceptance/**`
- `website/**`
- canonical command-skill sources and generated adapter skill directories
- release/install documentation and rollback instructions

**Authority:** Update branding and canonical commands. Preserve historical
citations, TokenPilot terminology, compatibility examples, and secret redaction.

**Steps:**

1. Apply upstream LightRSI wording and URLs after runtime/package verification.
2. Document canonical commands and legacy compatibility aliases without
   presenting legacy aliases as new defaults.
3. Document product-state fallback, single-daemon ownership, TokenPilot routing,
   9Router final-gateway contract, and rollback behavior.
4. Regenerate adapter command skills only through existing canonical generator or
   installer source; do not edit generated copies independently.
5. Search for stale user-facing LightMem2 text and classify retained historical
   or compatibility references.

**Verification:** Existing documentation/link checks, package/install smokes, and
clean generated-surface diff. Confirm no secret values appear in changed docs.

**Exit Criteria:** Public naming is LightRSI, TokenPilot ownership remains clear,
and all retained old terms have explicit historical or compatibility purpose.

### Task 7: Run Full Backend and Live Routing Verification

**Purpose:** Prove installation, state, routing, cache reuse, and existing agents
work after migration.

**Task Function:** Full automated and real-dependency verification.

**Template Profile:** xhigh

**Required Skills:** `skill-backend-verification`, `skill-verification-before-completion`

**Dependencies:** Task 6.

**Files:** Test evidence under ignored `outputs/` only; no runtime logs or secrets
are committed.

**Authority:** May run local builds, tests, installers, TokenPilot, Codex, and safe
9Router probes. Back up every modified user configuration first. Must not expose
keys or change provider routing.

**Steps:**

1. Run full workspace boundary, typecheck, test, build, release verification, and
   package-smoke commands from clean dependency state.
2. Back up Codex and TokenPilot configuration files before local installation.
3. Install canonical LightRSI CLI/adapter and run canonical plus compatibility
   doctor/status commands.
4. Verify one TokenPilot proxy is healthy and restart-safe; prove canonical and
   legacy CLIs address same PID/lock/state/port.
5. Verify port `20128` listens, 9Router health succeeds, and configured models and
   routes remain available without printing credentials.
6. Inspect effective config and prove TokenPilot upstream remains
   `http://127.0.0.1:20128/v1`; Codex must not point directly to 9Router during
   middleware verification.
7. Start fresh Codex session and send simple request. Correlate safe request IDs
   showing Codex -> TokenPilot -> 9Router -> provider -> TokenPilot -> Codex.
8. Run current custom model aliases and one existing Codex agent profile.
9. Run Codex Native or DeepAgents executor/validator initial and follow-up probes.
   Compare stable-core hash, cache family, wire-prefix hash, and provider cached
   tokens when exposed.
10. Prove rename-only requests retain old family identity; role-specific semantic
    differences remain separated after breakpoint.
11. Simulate legacy-state-only upgrade and rollback. Confirm legacy state remains
    untouched and old runtime can still read it.
12. Stop on any bypass, duplicate daemon, secret exposure, cache-family drift,
    schema loss, model/agent failure, or provider-payload difference.

**Verification:**

```powershell
pnpm check:boundaries
pnpm typecheck
pnpm -r test
pnpm build
pnpm release:verify
```

Also run canonical LightRSI Codex doctor/status commands produced by Task 4 and
bounded local port/process/config probes. Store only safe hashes, IDs, counts,
timestamps, exit codes, and redacted route names.

**Exit Criteria:** Automated suite passes; one runtime survives restart; full
routing chain is proven; custom models/agents work; multi-agent cache symmetry
and required separation are demonstrated; rollback fixture passes.

### Task 8: Review Final Diff and Prepare Handoff

**Purpose:** Ensure implementation matches active spec and preserves unrelated work.

**Task Function:** Diff review, evidence audit, and disposition preparation.

**Template Profile:** xhigh

**Required Skills:** `skill-requesting-code-review`, `skill-verification-before-completion`

**Dependencies:** Task 7.

**Files:** Entire migration diff and verification evidence inventory.

**Authority:** Read-only review and corrective patches only. No commit, merge,
push, worktree removal, or branch deletion without explicit authorization.

**Steps:**

1. Compare final diff to active specification and each task exit criterion.
2. Verify no unrelated file changed and all original local cache work remains.
3. Review every remaining `LightMem2`, `lightmem2`, `LIGHTMEM2_*`, and
   `@lightmem2/*` occurrence for explicit compatibility/historical ownership.
4. Confirm grandfathered family IDs and cache metadata names remain unchanged.
5. Confirm new product writes use LightRSI schemas/state/CLI/package names.
6. Re-run `git diff --check` and shortest relevant regression commands after any
   review correction.
7. Produce verified, incomplete, or blocked handoff with exact command evidence.
8. Await explicit Git disposition: keep worktree, create checkpoint commit,
   integrate, push, or discard.

**Verification:** Active spec checklist, task evidence, final Git status, diff
inventory, and fresh targeted tests after last edit.

**Exit Criteria:** No unresolved P1/P2 finding, evidence supports every material
claim, and user receives explicit disposition choices without automatic Git action.

## Final Verification Matrix

| Contract | Required proof |
|---|---|
| Package namespace | Boundary check, typecheck, build, lockfile, zero mixed scope |
| Legacy schemas | Old fixtures read; canonical schemas write |
| State migration | Canonical-first, legacy fallback, no delete, rollback pass |
| CLI compatibility | Canonical/legacy aliases share implementation and one daemon |
| Cache identity | Old/new key equality plus semantic-difference separation |
| Cache metadata | Existing family/metadata protocol names round-trip unchanged |
| Model handling | Uniform prefix normalization; no per-model aliases |
| Routing | Safe correlated Codex -> TokenPilot -> 9Router -> provider trace |
| Agents | Existing Codex profile and executor/validator probes pass |
| Secrets | No key in diff, logs, docs, screenshots, or evidence |

## Rollback Strategy

1. Keep original worktree and legacy state untouched throughout execution.
2. Stop new runtime before restoring configuration or binaries.
3. Restore backed-up Codex/TokenPilot configuration files atomically.
4. Reinstall prior CLI/adapter from preserved checkpoint if needed.
5. Confirm Codex can use legacy state and existing 9Router route.
6. Do not delete `~/.lightrsi` or `~/.lightmem2` automatically.
7. Preserve failed-run evidence until root cause and disposition are decided.

## Commit Policy

- Lead may create checkpoint commits only after explicit user authorization.
- Each checkpoint contains one accepted task boundary and its focused tests.
- No squash, rebase, merge, push, tag, or worktree cleanup without explicit user
  authorization after final verification.

## Completion Condition

Plan completes only when all task exit criteria and final matrix pass with fresh
evidence. Successful rename, build, or LLM response alone is insufficient.
