# LightRSI benchmark guide

This directory contains reproducible benchmark manifests, raw results, reports,
and reconciled router evidence for LightRSI generation-policy experiments. It is
not the repository README: it documents how to run, interpret, and retain
measurement evidence.

## What the benchmark measures

The generation-policy benchmark compares the same workload under four Stage A
arms:

| Arm | Policy treatment |
| --- | --- |
| `baseline` | No LightRSI generation policy |
| `caveman-full` | Caveman at full intensity |
| `ponytail-full` | Ponytail at full intensity |
| `both-full` | Both policies at full intensity |

The matched Stage A workload currently has eight fixtures (`prose`, `code`,
`json`, `tool-history`, `security`, `detail`, `multiturn`, and `artifact`) and
five repetitions per fixture. That produces 40 task rows per arm. The five
known multi-turn fixtures add a second provider call, so the expected total is
45 provider calls per arm, or 180 calls for the four-arm experiment.

Correctness is evaluated before economics. A row must satisfy its fixture
oracle, including required verification commands and artifact facts. A passing
token or cost total cannot rescue a correctness failure.

## Running it

From the repository root:

```text
pnpm --filter @lightrsi/codex-adapter run bench:generation-policy -- --mock
```

The mock run validates the report contract without provider traffic. A live
matched run requires the benchmark environment and one distinct base URL for
each Stage A arm:

```text
pnpm --filter @lightrsi/codex-adapter run bench:generation-policy -- --matched-live
```

For the smaller authenticated attribution repair gate, use `--live-repair`.
It exercises the security and multi-turn paths for each Stage A arm without
claiming economics. Set `LIGHTRSI_BENCHMARK_REPETITIONS=1` when checking the
router join; the default is five repetitions (60 provider calls), while one
repetition produces 12 calls. The live-repair command also accepts a fresh
sanitized `LIGHTRSI_BENCHMARK_ROUTER_SETTINGS_EVIDENCE` file when the dashboard
session can read `/api/settings` but the provider API key cannot. The evidence
must use `source: "9router_dashboard"`, the matching `routerUrl`, HTTP `status:
200`, both policy flags set to `false`, and be no more than five minutes old.

Required live inputs include `LIGHTRSI_BENCHMARK_BASE_URL`,
`LIGHTRSI_BENCHMARK_ROUTER_URL`, `LIGHTRSI_BENCHMARK_MODEL`,
`OPENAI_API_KEY`, `LIGHTRSI_BUILD_ID`, and
`LIGHTRSI_BENCHMARK_<ARM>_BASE_URL` for every arm. Set
`LIGHTRSI_BUILD_ID` to the committed source SHA used by the run. If it is
missing, the adapter reports `runtimeBuildId: "unavailable"` and the identity
gate correctly fails closed; do not treat that as a provider or policy defect.
Pricing is optional for execution but required before claiming provider-dollar
economics; configure the input, cached-input, output rates, and a pricing table
version through the `LIGHTRSI_BENCHMARK_*_USD_PER_MILLION` variables and
`LIGHTRSI_BENCHMARK_PRICING_TABLE_VERSION`.

The live command writes the machine-readable result to the configured
`LIGHTRSI_BENCHMARK_OUTPUT`, or to the system temporary directory when that
variable is absent. Durable reports belong in this directory only after review.

## Data sources and authority

Use the narrowest authoritative source for each claim:

1. **Benchmark results** establish task-row correctness, arm assignment,
   provider-call counts, prompt tokens, completion tokens, and LightRSI policy
   identity.
2. **The router's `usageHistory` and `requestDetails` records** establish
   observed provider usage, `cached_tokens`, and router-recorded cost when the
   response payload does not include cache details.
3. **The report and evidence JSON** preserve the exact source SHA, model,
   experiment window, row counts, reconciliation status, and interpretation.

The current Luna addendum demonstrates this reconciliation in
`2026-10-11-generation-policy-stage-a-luna-router-evidence.json`: 180 router
records matched the experiment window, prompt/completion totals matched the
benchmark rows, and cached input was present with a measured total of zero.

The corrected build-identity run is preserved in
`2026-10-12-generation-policy-stage-a-luna-router-evidence.json` with its
human-readable verdict in `2026-10-12-generation-policy-stage-a-luna-report.md`.

Router reconciliation is window- and model-based unless an immutable
request-level join key is available. It is comparative run evidence, not an
external provider invoice or account settlement.

When reconciling a matched result, join each `policyEvidence[].requestId` to
one router record, then group those records back to the benchmark row before
comparing usage. A multi-turn benchmark row has one aggregate `usage` object
but two provider-call evidence records; comparing the row aggregate to either
single call creates a false token mismatch. The row-level comparison must sum
all joined router records for that row, while the request-level checks must
still require one unique immutable `routerRecordId` per provider attempt.

## Economic calculations

For each arm, calculate:

```text
totalTokens = inputTokens + outputTokens
costDeltaUsd = arm.routerRecordedCostUsd - baseline.routerRecordedCostUsd
costDeltaPercent = 100 * costDeltaUsd / baseline.routerRecordedCostUsd
tokenDelta = arm.totalTokens - baseline.totalTokens
```

Report both absolute totals and normalized values per task row or provider call
when arms have different call counts. Do not divide by a zero or missing
baseline cost. Preserve null when a required input is absent.

`routerRecordedCostUsd` is the router's comparative cost signal for the matched
run. It becomes a provider-dollar estimate only when the router's pricing
provenance is known and the report identifies the pricing table version. A
`cached_tokens` value of `0` is an observation; a missing or null value is not
zero.

## Promotion decision

Use this order:

1. Confirm source/build and policy identity for every arm.
2. Confirm the expected row and provider-call counts.
3. Confirm every row passes its correctness oracle.
4. Confirm usage completeness and router reconciliation.
5. Compare each treatment with the same-run baseline.
6. Record `no-promotion` when a treatment costs more, correctness fails,
   identity is mismatched, or required evidence is unavailable.

Missing retries, clarifications, repeated-baseline stability, cached-input
coverage, or pricing provenance must be reported as unavailable—not converted
to zero and not used to claim savings. Token-normalized differences are still
useful provisional evidence when cost provenance is incomplete, but they are
not dollar savings.

The accepted Luna evidence currently reports higher router-recorded cost for
all policy arms and therefore keeps the decision at **no-promotion**. It does
not authorize adapter expansion, default changes, or stronger policy intensity.

## Evidence files

- `*-manifest.json`: experiment identity, workload, arms, and run mode.
- `*-results.json`: row-level and aggregate machine-readable results.
- `*-report.md`: human-readable verdict and limitations.
- `*-router-evidence.json`: post-run router reconciliation and economic
  calculations.
- `2026-10-12-session-contention-lock-repair.md`: root-cause analysis,
  regression proof, and the fresh same-session versus independent-session
  contention benchmark.

Keep raw results and reconciliation evidence together. Do not overwrite an old
run; add a new dated artifact and explicitly label historical reports.

## 9Router attribution verification

The adapter-side header test is not sufficient to authorize live economics. The
router must preserve `x-lightrsi-request-id` and
`x-lightrsi-provider-attempt-id`, assign one router-owned immutable
`routerRecordId`, and expose the same three identifiers in both `usageHistory`
and `requestDetails`.

Root-cause review of the local 9Router checkout found that the headers reached
the chat boundary but were discarded before persistence. The usage-history
deduplication key also omitted the router record ID, so two attempts with the
same timestamp and token counts could be collapsed. The repair adds additive
attribution columns, carries one generated record ID through success, failure,
streaming, and forced-SSE paths, and makes attributed attempts distinct for
deduplication.

The fixture-backed router probe is
`9router/tests/unit/attribution-persistence.test.js`. Run it from the 9Router
checkout root with the committed Vitest configuration:

```text
npx vitest run tests/unit/attribution-persistence.test.js tests/unit/request-details-tab.test.js --config tests/vitest.config.js
```

It must prove:

1. The two LightRSI headers are preserved.
2. One router-owned `routerRecordId` is present in both authoritative tables.
3. The IDs match across the tables and remain visible through the details API.
4. Distinct provider attempts are not collapsed when measurements are equal.

The local fixture run also exposed two test-harness issues, both repaired in the
router checkout: the fixtures used the nonexistent `enableObservability2` setting
instead of `enableObservability`, and the request-details backup test hardcoded
`better-sqlite3` even when the router correctly selected Node's built-in
`node:sqlite` fallback. On October 12, 2026, the focused command above passed all
three attribution checks and all 22 adjacent request-details checks under the
fallback driver. The run emitted only the expected unavailable-native-binding
warning for `better-sqlite3`; it did not modify package metadata or authorize a
live provider run.

The durable patch-hub overlay is
`project-OS-starter/tools/local-patch-hub/Apply-9RouterAttributionOverlay.ps1`,
with exact-base overlays for `0.5.69` (`eb712ca8`) and `0.5.99`
(`ce4460ef`). The `0.5.99` overlay is rebased over the newer `toolNameMap` and
schema layout and was verified to apply and reverse-check cleanly. The script
supports exact-base application, already-
applied detection, temporary-index 3-way verification, and fail-closed conflict
handling. Use it to keep the attribution repair present across upstream releases
until the fix is merged upstream.

The current local 9Router checkout is a dirty `0.5.65`-derived attribution
branch at `840a4421`, not a clean overlay target. Verifying the old overlay
against that branch correctly fails closed and reports that the patch must be
rebased; it does not justify applying the old patch over unrelated tracked
changes. The patch hub now carries the rebased `0.5.99` entry instead.

The broader local Vitest sweep is not a release gate in this checkout: 193 test
files passed, 34 failed, and 11 were skipped. The failures include missing
optional dependencies, files that contain no Vitest suite, provider-specific
endpoint assumptions, and external-service or credential-dependent cases. No
failure occurred in the attribution fixture or the adjacent request-details
regression.

A later rerun from the dirty `0.5.65`-derived checkout could not locate the
attribution fixture and reported 19/22 adjacent request-details tests: the
three failures were the known fallback-driver/test-harness mismatch
(`better-sqlite3` unavailable, stale observability fixture setup, and temporary
database cleanup), not evidence against the attribution contract. The rebased
overlay carries the fixture and fallback-driver corrections for clean targets.

Before live economics, exercise one authenticated request through the deployed
router and confirm the two LightRSI headers map to one immutable
`routerRecordId` in both tables. Then benchmark same-session versus
independent-session persistence contention and define the immutable downstream
record-ID join before comparing arms. Until the contention and economics gates
pass, do not treat a window/model match as a substitute for request-level or
provider-dollar evidence.

That gate was completed on October 12, 2026 after installing the verified
9Router `0.5.99` attribution overlay globally. The sanitized evidence is in
`2026-10-12-9router-attribution-live-probe.md`: one authenticated Responses
request returned HTTP 200, and the same router-owned `routerRecordId` was found
in both `usageHistory` and `requestDetails`, alongside the supplied request and
provider-attempt IDs. This proves the durable join for the repaired runtime; it
does not authorize live economics by itself.

The probe also exposed and repaired a benchmark CLI defect: `--live-repair`
previously ignored `LIGHTRSI_BENCHMARK_REPETITIONS` and always ran five
repetitions (60 provider calls). The command now honors that setting; one
repetition is 12 calls and remains the recommended attribution-gate size.

## Session persistence contention

The dated report
`2026-10-12-session-contention-lock-repair.md` records a repaired race shared
by the file-store, context-mutation-plan, and Codex rebase-epoch lock
implementations. A lock directory without `owner.json` is now treated as active
contention rather than stale state, preventing a waiter from reclaiming a lock
while its owner metadata is still being written. Malformed owner metadata keeps
the prior stale-lock recovery path.

After the repair, the focused suites passed 30/30 host-adapter tests and 32/32
Codex tests. The six-mode contention benchmark completed 300/300 measured
batches with zero failures. Independent-session p95 remained comparable to
same-session p95, so the conservative global lock remains the selected design.
The October 12, 2026 rerun (`pnpm --dir components/adapters/codex run
bench:session-contention`) again completed all 300 measured batches with zero
failures; p95 was 7.138/6.822 ms at concurrency 1, 64.398/66.615 ms at
concurrency 4, and 128.169/139.782 ms at concurrency 8 for same-session /
independent-session modes. The rerun does not justify changing the lock
topology.

## Cache-audit history durability

Per-session cache-audit JSONL files are the canonical read path. When an older
installation has no per-session file, the first read performs a full migration
from the legacy `cache-audit.jsonl` file instead of relying on a fixed tail
window. Matching records are written chronologically to the session file, and
an empty session file records that migration found no history so later reads do
not rescan the global file. A malformed global tail is returned with its
diagnostic flag but is not marked as migrated, allowing a later repair to retry
without silently losing records needed for baseline classification.

On October 12, 2026, the built Codex adapter at commit `fedef2d1` was smoke
tested through `renderCodexSessionReport` with an isolated state directory. A
legacy target record placed before 300 newer records was recovered, written to
the per-session file, and remained readable after the legacy global file was
removed. The live local runtime was rebuilt from the same commit and returned
HTTP 200 from `/health`.
