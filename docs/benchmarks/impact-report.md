# LightRSI Impact Report

**Measurement date:** 2026-09-24
**Repository:** LightMem2
**Commit:** `d6517fd346671d4d2f2cada5c4da58881caba3ef`
**Environment:** Windows, Node `v24.15.0`

## Scope

This report separates three claims:

1. **Fork engineering evidence:** local behavior and performance measured in this fork.
2. **Component evidence:** Context Cleaner Keep/Release behavior inside this fork.
3. **Fork-versus-upstream impact:** measured with matched provider protocol smoke and a three-task deterministic coding pilot; broad coding-task impact remains deferred.

Mock benchmarks do not establish provider token usage, provider cache hits,
provider latency, provider cost, or full coding-task success.

## Current Evidence

| Area | Result | Status |
| --- | --- | --- |
| Indexed artifact recovery, 1,000 entries | Early median `1.1215 ms`, p95 `1.6637 ms`; late median `1.1914 ms`, p95 `1.6074 ms`; exact content correctness | Measured |
| Missing/stale index rebuild, 1,000 entries | Median `297.0969–300.9107 ms`; p95 `315.8645–363.8364 ms`; exact content correctness | Measured |
| Cache-audit tail read, 100,000 records | Median `1.6365 ms`, p95 `2.2607 ms`; ordering correct; malformed tail rejected | Measured |
| Cache-audit append, 100,000 records | Median `2.7967 ms`, p95 `3.4104 ms` | Measured |
| Forwarding, long history, concurrency 16 | p50 `51.646 ms`, p95 `134.127 ms`; no-op reference preserved `16/16` | Measured, exploratory |
| Forwarding, nested block, concurrency 16 | p50 `52.798 ms`, p95 `176.031 ms`; no-op reference preserved `16/16` | Measured, exploratory |
| Context Cleaner mock benchmark | `40` runs, `640` samples per arm, execution complete, correctness pass | Measured |
| Context Cleaner live Stage B economics | `40` runs, `20` comparable pairs, complete usage/cache/correctness evidence; marginal cost increased `11.07%` | Measured, no savings |
| Deterministic coding-task pilot | Original `3/3`, fork `3/3` verifier passes across implementation, bug-fix, and recovery/restart tasks; fork used `1,091,844` vs `1,364,321` Codex-reported input tokens (`-19.97%`) | Measured, small pilot |
| Original-vs-fork provider rebase smoke | Original `5/5` pass; fork `4/5` pass; successful runs saved median `6,471` vs `6,468` input tokens; one fork run had zero replayable items | Measured, limited |

## Existing Diagnostic Evidence

Prior repository evidence records command-aware diagnostic reduction:

- TAP fixture: `11,957 B` to `863 B`, `92.8%` fewer output bytes.
- TypeScript fixture: `10,229 B` to `723 B`, `92.9%` fewer output bytes.

These are output-byte measurements, not token measurements. Source:
`docs/intent/2026-09-23-lightrsi-p1-closure-plan.md`.

## Benchmark Details

### Artifact recovery

Command:

```powershell
pnpm --dir components/packages/foundation/artifact-store run bench:recovery
```

Configuration: `50` samples per operation; archive sizes `1`, `100`, and
`1,000` entries. Current run returned exact content for indexed lookup,
index rebuild, missing artifact, range recovery, and search recovery.

### Cache audit

Command:

```powershell
pnpm --dir components/packages/features/stabilizer run bench:cache-audit
```

Configuration: `7` samples at `100`, `1,000`, `10,000`, and `100,000` records.
Tail-read behavior stayed bounded by the `65,536`-byte read budget at larger
files. Ordering and malformed-tail checks passed at every size.

### Forwarding

Command:

```powershell
pnpm --dir components/adapters/codex run bench:forwarding
```

Configuration: `3` warmups, `15` samples, concurrency `1`, `4`, and `16`.
The benchmark measures local request processing and allocation proxies. It does
not measure provider latency, OS CPU, peak process memory, or disk I/O.

### Context Cleaner

Command:

```powershell
$env:LIGHTRSI_BENCHMARK_MODE="mock"
pnpm --dir components/adapters/codex run bench:context-cleaner
```

Current mock summary:

| Arm | Samples | p50 handler-to-finish | p95 handler-to-finish | Input bytes |
| --- | ---: | ---: | ---: | ---: |
| Baseline / Keep | `640` | `77.086 ms` | `98.971 ms` | `9,688,675` |
| Cleaner / Release | `640` | `111.443 ms` | `286.588 ms` | `9,668,955` |

Statuses: execution `complete`; measurement `unavailable`; correctness `pass`;
economics `inconclusive`. The mock upstream returned no provider usage records.
The input-byte delta is not a token or cost estimate.

### Original-versus-fork provider smoke

This comparison used the original LightRSI fork-base revision
`2fc0a6734a8380b15e99cd027877cdcd950caa63` and fork revision
`d6517fd346671d4d2f2cada5c4da58881caba3ef`.

Both revisions ran the same `context-rebase-provider-smoke` workload with:

- provider endpoint `127.0.0.1:20128`;
- model `cx/gpt-5.6-luna`;
- five setup/continuation repetitions per revision;
- five continuation turns per successful run;
- centralized credentials from `C:\Users\HOANG PHI LONG DANG\.codex\tokenpilot.env`;
- identical encrypted-reasoning, function-call, rebase, restart, and usage gates.

| Metric | Original | Fork | Interpretation |
| --- | ---: | ---: | --- |
| Successful repetitions | `5/5` | `4/5` | Fork had one failed repetition |
| Successful rebase commits | `5/5` | `4/4` | All completed fork runs committed rebase |
| Successful restart preservation | `5/5` | `4/4` | All completed fork runs preserved mapping |
| Median saved input tokens | `6,468` | `6,471` | Difference is negligible; not a cost claim |
| Median subsequent saved input tokens per turn | `1,342` | `1,345` | Difference is negligible; not a cost claim |

The failed fork repetition reported only sanitized diagnostics:
`source=proxy_journal; incomplete=true; deferred=none; unresolved=0; replayable=0`.
The failure makes this a limited compatibility result, not proof that the fork
improves reliability, latency, or provider cost. Raw artifacts were stored
outside Git at `C:\tmp\lightrsi-impact-20260924\original-vs-fork`.

## Deferred Measurements

### Live provider economics — completed

The live run used the centralized provider environment file and a temporary
manifest pinned to the clean measured commit `d6517fd346671d4d2f2cada5c4da58881caba3ef`.
The tracked manifest currently points at a different approved runtime SHA and
was not modified during this run.

`docs/superpowers/experiments/2026-09-24-context-cleaner-stage-b.json`

Run configuration: four fixtures, five repetitions, `20` comparable pairs,
provider model `cx/gpt-5.6-luna`, pinned pricing, and spending cap `$10`.

Results:

| Metric | Keep / baseline | Release / cleaner | Difference |
| --- | ---: | ---: | ---: |
| Input tokens | `2,264,477` | `2,258,927` | `-5,550` (`-0.25%`) |
| Cached input tokens | `1,903,616` | `1,825,280` | `-78,336` |
| Cached input share | `84.06%` | `80.80%` | `-3.26 pp` |
| Output tokens | `5,256` | `5,186` | `-70` |
| Estimated marginal cost | `$0.5827586` | `$0.6472910` | `+$0.0645324` (`+11.07%`) |

Statuses: execution `complete`; measurement `complete`; correctness `pass`;
economics `pass` as an evidence-completeness gate. No sustained break-even was
observed. This run does not support a provider cost-savings claim.

An earlier pilot attempt made zero provider requests because the tracked
manifest SHA did not match the dirty checkout. The preflight was not bypassed.

### Deterministic coding-task pilot

This pilot compared the original revision and fork revision on three fixed
fixtures. Each arm used the same task prompt, model profile, proxy protocol,
repository state, and verifier. The recovery task resumed after a proxy restart.

| Task | Original input | Fork input | Input delta | Original output | Fork output | Output delta | Verifier |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Implementation | `431,793` | `436,821` | `+1.16%` | `1,718` | `1,731` | `+0.76%` | `1/1` both |
| Bug-fix | `366,475` | `303,779` | `-17.11%` | `2,095` | `1,974` | `-5.78%` | `1/1` both |
| Recovery/restart, two turns | `566,053` | `351,244` | `-37.95%` | `3,267` | `2,067` | `-36.73%` | `1/1` both |
| **Total** | **`1,364,321`** | **`1,091,844`** | **`-19.97%`** | **`7,080`** | **`5,772`** | **`-18.47%`** | **`3/3` both** |

Codex-reported cached input tokens were `851,712` original versus `717,568`
fork (`-15.75%`). These are session usage fields, not provider billing or
provider cache telemetry. Provider cost, standardized end-to-end duration, and
cost per successful task remain unavailable. This small pilot does not support
a general task-success or efficiency claim.

## CV Wording

Current evidence supports:

- Reduced command-aware diagnostic payloads by `92.8–92.9%` while preserving actionable evidence.
- Achieved approximately `1.1–1.2 ms` median indexed artifact lookup across `1,000` archived entries with exact-content verification.
- Built reproducible A/B measurement infrastructure for local latency, cache behavior, recovery correctness, provider usage, and break-even economics.
- Compared original and fork revisions with matched provider rebase smoke; original passed `5/5`, fork passed `4/5`, so no reliability-improvement claim is justified.
- Ran a three-task original-versus-fork coding pilot with deterministic verifiers; both arms passed `3/3`, while the fork used `19.97%` fewer Codex-reported input tokens in this small sample.

Do not currently claim provider cost reduction, broad coding-task success,
latency improvement, or fork-versus-upstream superiority. The Context Cleaner
live run supports a measured `0.25%` input-token reduction but not a savings
claim. The original-vs-fork smoke shows near-identical token savings on
successful runs, with one fork failure. The coding pilot has only three tasks
and uses Codex-reported session usage rather than provider billing.

## Reproduction and Limits

Raw benchmark output was kept outside Git during execution. Re-run commands
above from the recorded commit and compare workload, environment, sample count,
cache state, and provider identity before attributing changes.

Upstream TokenPilot numbers in `README.md` remain upstream research results and
are not measurements of this fork. The original-vs-fork smoke above is a local
reproduction against the pinned original revision, not an upstream research
claim.
