# LightRSI generation policy Stage A matched live

- Source/build SHA: `e06076cefb91007fe9b76cf271cce66afe011fe6`.
- Model: `combo-high`; workload: 8 fixtures × 5 repetitions; provider calls: 180.
- Router preflight: match via authenticated dashboard evidence captured at 2026-10-11T12:44:19.765Z; both router policy toggles were false.
- TokenPilot preflight: match; both local generation policy toggles were false.
- Runtime identity: all policy-bearing responses reported the exact source/build SHA and policy version `v2/v2`.
- Correctness: pass for Baseline, Caveman Full, Ponytail Full, and Both Full; failed rows = 0.
- Stability: unavailable because retries and clarifications were not observed by the completed-task runner.
- Economics: inconclusive because cached-input usage and pinned pricing were unavailable; missing usage was not treated as zero.
- Engineering value: unavailable because no executable Codex task fixture was available.

## What the available data establishes
- Execution integrity: 160/160 completed rows passed; each arm recorded 40 complete usage rows and 45 provider calls. The five-call surplus is exactly the five known two-turn `multiturn` fixtures; all other fixtures were single-turn and no tool calls were recorded.
- Token usage: every row has input, output, and total token counts. Aggregate totals are Baseline `7,710 / 10,918 / 18,628`, Caveman Full `10,113 / 9,513 / 19,626`, Ponytail Full `10,985 / 13,124 / 24,109`, and Both Full `13,288 / 10,976 / 24,264` for input/output/total tokens respectively.
- Provisional token deltas versus Baseline are Caveman Full `+2,403 / -1,405 / +998`, Ponytail Full `+3,275 / +2,206 / +5,481`, and Both Full `+5,578 / +58 / +5,636` for input/output/total tokens. These are token-normalized observations, not dollar savings.
- Measurement boundary: retry and clarification fields are unknown on all 160 rows, and cached-input tokens are unknown on all 160 rows. These facts narrow the result but do not justify converting stability to zero retries or economics to a dollar estimate.

## Per-pair deltas
- Baseline → caveman-full: median latency delta 272.5 ms; provider-call delta 0; turns delta 0; cost delta unavailable.
- Baseline → ponytail-full: median latency delta 439 ms; provider-call delta 0; turns delta 0; cost delta unavailable.
- Baseline → both-full: median latency delta -319.5 ms; provider-call delta 0; turns delta 0; cost delta unavailable.

- Decision: **no-promotion**.
- No adapter expansion, default-on change, intensity sweep, or combined interaction promotion is justified by this run.
- The next evidence-backed follow-up should instrument retries/clarifications and complete cached-input pricing before any promotion decision.
