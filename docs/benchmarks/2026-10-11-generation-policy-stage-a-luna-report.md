# LightRSI generation policy Stage A — Luna evidence addendum

- Source/build SHA: `8d9de589f860a2ca1f2fe88d435a8eec0997f1c2`.
- Model: exact `cx/gpt-5.6-luna`; workload: 8 fixtures × 5 repetitions.
- Execution: 160 task rows, 180 provider calls, 40 rows and 45 calls per arm.
- Correctness: 160/160 rows pass after the validator accepted semantically equivalent `absence` wording. Focused regression suite: 38/38.
- Runtime/policy identity: all policy-bearing responses reported build `8d9de589`, policy version `v2/v2`, and freshly verified Caveman/Ponytail disabled router toggles.

## 9Router evidence

The TokenPilot response body omitted cache-read details, but local 9Router records retained them. `usageHistory` and `requestDetails` each contain exactly 180 successful `gpt-5.6-luna` records for the experiment window. Prompt and completion totals match the benchmark rows exactly.

- Cached input: 180/180 records report `cached_tokens`; sum = `0`. Missing cache data is no longer assumed.
- Baseline: 14,333 total tokens; router-recorded cost `$0.046378`.
- Caveman Full: 16,353 total tokens; router-recorded cost `$0.047448` (`+$0.001070`, `+2.31%`).
- Ponytail Full: 17,482 total tokens; router-recorded cost `$0.050452` (`+$0.004074`, `+8.79%`).
- Both Full: 20,089 total tokens; router-recorded cost `$0.053594` (`+$0.007216`, `+15.56%`).

Router-recorded cost is comparative run evidence, not an external provider invoice. Evidence is preserved in `2026-10-11-generation-policy-stage-a-luna-router-evidence.json`.

## Verdict

- Treatment stability: pass; observed retry and clarification counts are zero for all rows.
- Baseline stability: unavailable by design; no repeated baseline arm was used as a separate stability control.
- Economics: fail for Caveman Full, Ponytail Full, and Both Full because each costs more than Baseline.
- Decision: **no-promotion**.
- Do not expand adapters, change defaults, or widen policy intensity from this run.
