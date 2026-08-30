---
name: skill-performance-optimization
description: Use when measured latency, throughput, memory, query, bundle, rendering, Core Web Vitals, or prompt-cache behavior needs diagnosis and verified improvement.
required_reads: []
distribution_tier: starter_kit
---

# Performance Optimization

## Role

Prove performance changes against a stable workload. Optimize the measured bottleneck, preserve correctness, and reject speculative caches, indexes, memoization, loading changes, and dependencies.

## When To Use

Use for explicit performance requirements, monitoring regressions, slow user flows, tail-latency alarms, throughput limits, memory growth, expensive queries, bundle growth, rendering bottlenecks, or prompt-cache hit/cost claims.

Skip when no performance claim or symptom exists.

## Core Method

1. Name the claim, affected flow, metric, and owner.
2. Fix comparison conditions: version, environment, representative data, workload, concurrency, warm or cold state, device, and network where relevant.
3. Use an existing SLO, budget, alert, field threshold, or approved requirement. If none exists, do not invent a universal pass gate; record exploratory baseline and obtain or state a task-specific target owner.
4. Capture baseline with enough repetitions to expose variance or tail behavior. Keep raw command, trace, query plan, or monitoring source.
5. Trace the full path and identify the dominant constraint before editing. Use `skill-systematic-debugging` for root-cause investigation.
6. Form one hypothesis and apply the smallest fix to the proven bottleneck. Do not bundle unrelated optimizations.
7. Rerun the identical workload and environment. Report absolute change, relative change, variance or percentiles, resource tradeoffs, and correctness results.
8. Keep only proven wins. Add an existing benchmark, budget, deterministic proxy, or monitor guard when stable and valuable.

For prompt-cache claims, apply `docs/operating_system/rules/prompt-cache-contract-rule.md`. Equal local hashes prove serialization stability, not a provider cache hit; require provider usage evidence or report the cache claim as unverified.

## Evidence Map

When performance work depends on an unfamiliar external GitHub repository, use
available external-repository orientation capability only when needed and
resolve it through `docs/operating_system/tooling/runtime-tool-resolution.md`.
Measurements remain authoritative.

| Surface | Useful evidence |
|---|---|
| browser | field telemetry when available, production build, trace, network waterfall, relevant Web Vitals |
| service | request rate, errors, p50/p95/p99 latency, dominant spans, CPU or saturation |
| database | query count, execution plan, actual rows, scans, joins, sort spill, total time |
| memory | retained heap, allocation profile, growth across repeated workload |
| build | initial and route chunks, transferred bytes, loading sequence |
| prompt cache | exact provider-bound prefix, stable/volatile boundary, cache read/write tokens, route/model, latency, and cost |

## Example

A checkout p95 regression uses the alarm's production dimensions and last healthy window as baseline. Traces identify one repeated database query. Fix that query, rerun comparable traffic, confirm p95 and p99 improve without price or inventory errors, then retain the existing alert as guard. Do not add whole-response caching without freshness, invalidation, isolation, and bounds.

## Common Mistakes

- comparing different builds, data, traffic, devices, or warm states
- using averages when users suffer tail latency
- treating lab evidence as field proof or field data as a reproducible diagnosis
- inventing percentage, millisecond, score, bundle, or cache-TTL gates
- optimizing a convenient layer instead of the dominant constraint
- caching without freshness, invalidation, isolation, memory bounds, and eviction
- treating equal prompt hashes or total input tokens as proof of provider cache reuse
- logging raw prompts, tool arguments, retrieved content, or credentials while auditing cache behavior
- reporting faster output without proving semantic correctness

## Integration

- `skill-systematic-debugging` owns root-cause investigation.
- `skill-verification-before-completion` owns final completion claims.
- `docs/operating_system/rules/frontend-ui-rule.md` owns browser tool routing and UI invariants.
