# LightRSI generation policy Stage A — Luna router-reconciled evidence

- Source/build SHA: `300e1c22655b7b05af2a8b99f33241c67b164885`.
- Model: exact `cx/gpt-5.6-luna`; workload: 8 fixtures × 5 repetitions.
- Execution: 160 task rows, 180 provider calls, 40 rows and 45 calls per arm.
- Correctness: 160/160 rows pass; all four arms report `correctness: pass`.
- Runtime identity: every policy-bearing response reports the committed build SHA.
- Policy identity: policy versions, digests, applied states, and bypass states match the arm definitions.
- Transport retries: 0; cached-input telemetry in the adapter response: unavailable.

## 9Router reconciliation

The authenticated run covered `2026-10-12T07:56:15.684Z` through
`2026-10-12T08:05:34.561Z` in the local 9Router `0.5.99` runtime with the
verified attribution overlay. All 180 benchmark request IDs matched exactly
one row in both `usageHistory` and `requestDetails`.

- Immutable router records: 180/180 present and unique.
- Cross-table identifiers: 0 conflicts for `routerRecordId`,
  `experimentRequestId`, or `providerAttemptId`.
- Row-level usage: 160/160 benchmark rows match after summing all joined
  provider records for each row; this is required for multi-turn fixtures.
- Cached input: 180/180 records report `cached_tokens`; sum = `0`.

| Arm | Input tokens | Output tokens | Total tokens | Router-recorded cost |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 7,682 | 6,089 | 13,771 | `$0.044216` |
| Caveman Full | 10,161 | 6,072 | 16,233 | `$0.046593` |
| Ponytail Full | 10,731 | 5,834 | 16,565 | `$0.045735` |
| Both Full | 13,348 | 6,271 | 19,619 | `$0.050974` |

Relative to baseline, router-recorded cost is `+$0.002377` (`+5.38%`) for
Caveman Full, `+$0.001519` (`+3.44%`) for Ponytail Full, and `+$0.006758`
(`+15.28%`) for Both Full. All treatments also use more total tokens than the
same-run baseline.

## Verdict

- Exact request-level attribution: **passes**.
- Comparative router-cost signal: **fails**; every treatment is higher than baseline.
- Provider-dollar economics: **inconclusive** because pricing provenance is not configured.
- Decision: **no-promotion**.

Do not expand adapters, change defaults, or widen policy intensity from this
run. The router cost is comparative evidence from `usageHistory.cost`, not an
external provider invoice.

## Anomaly root cause and repair

The earlier invalid-identity run used disposable proxies without
`LIGHTRSI_BUILD_ID`, so the adapter emitted `runtimeBuildId: "unavailable"` and
the existing identity gate failed closed. Restarting those proxies with the
committed SHA repaired the run; no production behavior patch was justified.

The initial reconciliation check also compared an aggregate multi-turn row to
one provider-call record. That was a measurement-procedure defect, not a
LightRSI defect. The corrected check aggregates all `policyEvidence` records
back to their benchmark row before comparing tokens, and reports zero row
mismatches. The procedure is now documented in `docs/benchmarks/README.md`.
