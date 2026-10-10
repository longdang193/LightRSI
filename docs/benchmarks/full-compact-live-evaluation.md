# Full Output vs Compact Admission

**Measurement date:** 2026-09-25
**Runtime commit:** `111a7494ddb019c80c349ec6346a308d5f0d58c2`
**Provider:** `9Router`
**Model:** `combo-normal`
**Comparison:** Same sessions with full tool outputs versus Compact admission

## Method

- Three seeded scenarios: noise sizes `240`, `360`, and `520`.
- Twenty continuation turns per seed and configuration.
- `60` requests per arm; `120` requests total.
- Proxy restart after turn `10` in every run; restart-specific correctness was not
  independently asserted by this runner.
- Usage fields recorded for every request: input, cached input, and output tokens.
- Quality checks: critical facts and tool-call closure; proxy restart was
  exercised but not independently asserted.

## Pricing

Estimated cost uses pinned pricing from `9Router` pricing source commit
`6efb97904b8497d697a04b5730e75cc7afd48e88`, effective September 3, 2026:

| Token type | USD per million |
| :-- | --: |
| Input | $1.00 |
| Cached input | $0.10 |
| Output | $6.00 |

Calculation: uncached input tokens × input price, plus cached input tokens ×
cached-input price, plus output tokens × output price.

## Aggregate result

| Metric | Full tool output | Compact | Change |
| :-- | --: | --: | :-- |
| Requests | 60 | 60 | Same workload |
| Input tokens | 8,255,954 | 3,227,188 | **60.91% lower** |
| Cached input tokens | 7,462,656 | 2,480,128 | 66.77% lower |
| Output tokens | 952 | 1,283 | 34.77% higher |
| Estimated cost | $1.545276 | $1.002771 | **35.11% lower** |

## Per-seed result

| Seed | Full input | Compact input | Full cost | Compact cost | Cost saving |
| :-- | --: | --: | --: | --: | --: |
| 1 | 1,780,918 | 220,649 | $0.336377 | $0.077400 | **76.99%** |
| 2 | 2,654,878 | 995,427 | $0.498198 | $0.359957 | **27.75%** |
| 3 | 3,820,158 | 2,011,112 | $0.710700 | $0.565413 | **20.44%** |

## Quality evidence

- Full configuration: `3/3` seeded runs passed.
- Compact configuration: `3/3` seeded runs passed.
- Critical-fact checks: `6/6` passed across both configurations.
- Tool-call closure checks: `120/120` passed.
- Proxy restart exercised: `6/6` runs.
- Restart-specific correctness: not independently asserted by this runner.
- Requests with missing usage: `0`.
- Provider errors: `0`.

Passing these checks does not establish universal answer-quality equivalence.

## Post-merge real-session smoke

**Measurement date:** 2026-10-10
**Runtime commit:** `726df36bb86a10273d1dd5178bef2d57a5cdd951`
**Boundary:** restarted local Codex proxy at `http://127.0.0.1:17667/v1`
**Provider:** `9Router`
**Artifact:** `C:\tmp\lightrsi-real-session-compact-smoke-20261010-v4.json`

- Two bounded Responses requests completed with HTTP `200`.
- Proxy restart occurred between requests; continuation completed with the
  same session and a valid response chain.
- Tool payload reduction applied on the first request: `9,523` characters
  saved, one item and one block changed.
- Tool-call closure input remained present; raw prompt, provider response,
  response ID, and authorization data were not persisted in the artifact.
- This smoke proves runtime wiring, reduction application, and restart
  continuity. It is not a new multi-seed economics or answer-quality study.

## Post-merge full-vs-Compact evaluation

**Measurement date:** 2026-10-10
**Runtime commit:** `726df36bb86a10273d1dd5178bef2d57a5cdd951`
**Provider:** `9Router`
**Model:** `combo-normal`
**Artifact:** `C:\tmp\lightrsi-full-compact-quality-postmerge-20261010.json`

- Three seeds, twenty turns per arm, and `120` provider requests total.
- Proxy restart boundary exercised in all six runs.
- Full and Compact arms passed `3/3` each; critical-fact checks passed `6/6`;
  tool-call closure passed `6/6`; missing usage was `0`.

| Metric | Full | Compact | Change |
| :-- | --: | --: | :-- |
| Input tokens | 8,255,954 | 671,870 | **91.86% lower** |
| Cached input tokens | 7,462,656 | 519,936 | 93.03% lower |
| Output tokens | 1,013 | 987 | 2.57% lower |
| Estimated cost | $1.545642 | $0.209850 | **86.42% lower** |

Pricing and cost formula match this document's pinned `9Router` schedule.
This remains workload-specific evidence, not a universal quality or economics
claim.

## Limits

This is one controlled workload using one provider, model, pricing schedule, and
small seed count. Results do not generalize to all coding tasks, providers,
models, or session lengths. The local runner and raw provider responses remain
outside Git; this record is a sanitized summary, not a complete reproduction
bundle.
