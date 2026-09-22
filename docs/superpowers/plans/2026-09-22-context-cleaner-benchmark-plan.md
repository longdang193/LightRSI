---
artifact_type: plan
template_id: implementation-plan
contract_version: "1"
status: in_progress
layer: change
---

# Context Cleaner Benchmark Baseline

## Goal

Measure exact agent-directed occurrence release against no-release forwarding
before changing performance-sensitive code. Prove local correctness, expose
phase latency, and keep provider usage claims separate from local estimates.

Scope starts from `origin/main` at `e97455f1e5a72efe7ee193614ba380273c6ca8df`.
Do not add an estimator, automatic pruning policy, persistent benchmark state,
new ledger, scheduler, solver, or mandatory model call. Do not push `upstream`.

## Measurement Contract

- Local benchmark uses real Codex proxy and public Cleaner entrypoints with a
  deterministic mock upstream.
- First workload set has two fixtures: `short/noisy` and `long/noisy`.
- Each arm runs pre-release, exact release, continuation, second release, and
  restart continuation. Baseline arm performs no releases.
- Streaming remains enabled for core runs. First useful output means text or
  tool-call delta; SSE comments and heartbeats do not count.
- Report flat monotonic timings for handler start, body completion, dispatch,
  upstream headers, first useful output, response finish, and durable receipt
  completion. Client send timing remains client-harness evidence.
- Report provider usage only when provider-reported fields exist. Character or
  tokenizer values remain explicitly local estimates.
- A run is incomplete when its request summary is missing or trace records are
  dropped. Incomplete runs cannot support savings claims.

## Execution Approach

- Mode: `inline sequential`
- Coordination: `git-tracked`
- Required skills: `skill-test-driven-development`, `skill-backend-verification`,
  `skill-verification-before-completion`
- Isolation: worktree `C:\Users\HOANG PHI LONG DANG\.codex\worktrees\cleaner-benchmark\LightMem2`
- Branch: `codex/cleaner-benchmark`
- Base: `origin/main` at `e97455f1e5a72efe7ee193614ba380273c6ca8df`
- Commit policy: no commit until focused proof and report pass
- User-approval actions: push, PR, merge, branch/worktree deletion, and any
  live provider run that needs credentials or incurs provider cost

## Tasks

| Task | State | Required proof |
| --- | --- | --- |
| 1. Define report schema and reusable noisy fixtures | `complete` | tracked plan and fixture contract |
| 2. Add flat benchmark timing helper | `complete` | focused timing/report test failed before implementation, then passed |
| 3. Build deterministic local A/B runner around public Cleaner entrypoint | `complete` | real proxy, streamed mock upstream, occurrence release/restart sequence |
| 4. Run five paired local repetitions and publish JSON evidence | `complete` | 20/20 runs passed; all timing records complete; paired latency and forwarded-byte deltas emitted |
| 5. Run bounded live-provider smoke only after local gates | `complete` | three paired `short/noisy` repetitions; 60/60 streamed turns passed; provider usage captured |
| 6. Run alternating live diagnostic A/B | `complete` | five alternating pairs; 100/100 streamed turns passed; per-turn provider shape and header timing captured |

## Exit Criteria

- Exact selected occurrences removed; protected findings retained.
- No resurrection after restart and no duplicate dispatch attributable to cleanup.
- Streaming first-useful-output and durable-completion timings are present.
- Instrumentation overhead is measured with instrumentation enabled and disabled.
- JSON report distinguishes measured provider usage, local estimates, and A/B
  differences; missing values remain unknown.
- No production behavior changes outside measurement instrumentation.

## Local Evidence

On 2026-09-22, five paired repetitions passed for both `short/noisy` and
`long/noisy` fixtures. Mock-provider usage is intentionally unknown. Baseline
handler-to-finish p50/p95 was `76.7/109.7 ms`; Cleaner was `100.6/218.7 ms`.
Cleaner reduced forwarded input by `350` bytes per short run and `1,225` bytes
per long run. Results show optimization is not justified until the live route
confirms whether this local latency shape is representative.

## Live Evidence

On 2026-09-22, three paired live repetitions passed for `short/noisy` through
provider host `127.0.0.1` using model `combo-high`. All 60 streamed turns had
complete timing and exact occurrence/restart assertions passed. Baseline
handler-to-finish p50/p95 was `2550.6/5239.5 ms`; Cleaner was
`3285.3/6207.3 ms`. Provider-reported usage was present on all 60 requests:
baseline input/output/total `33543/855/34398`; Cleaner
`34200/957/35157`. Cached-input tokens were `0` in both arms. Forwarded local
input bytes were `252397` baseline and `258860` Cleaner, so this probe does not
justify a savings or latency claim.

The first live attempt exposed benchmark-only defects: the harness fabricated
short assistant history instead of replaying streamed provider output items,
and its oracle searched assistant echoes instead of user occurrences. The
harness now replays streamed output items and validates only `role=user`
input. No production behavior changed.

## Deferred

- Four-fixture expansion, sequential-versus-batched comparison, p99 claims,
  cache-isolation claims, and optimization wait for baseline evidence.
- Cache-hit claims remain unknown beyond provider-reported usage; no provider
  cache tokens were observed in this route.

## Alternating Diagnostic Evidence

On September 22, 2026, five alternating live pairs passed for `short/noisy`
(100/100 streamed turns). Cleaner forwarded `378208` bytes versus baseline
`401383`, with `240` user items versus `275` and `410` structured replay items
versus `433`. Provider input tokens were `57279` Cleaner versus `56630`
baseline; total tokens were `58975` versus `58143`, with zero cached-input
tokens in both arms. Per-pair input-token deltas ranged from `-569` to `+1054`,
so token savings are not stable enough to claim.

Median dispatch-to-provider-headers was `2196.9 ms` Cleaner versus `2542.3 ms`
baseline. Inferred local preparation/dispatch overhead was `47.1 ms` Cleaner
versus `12.7 ms` baseline, a `34.4 ms` median increase. Provider variance
dominates total latency; no production optimization is justified yet.
