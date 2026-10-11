# Session Persistence Contention and Attribution Gate

Date: 2026-10-11

## Contention benchmark

Command:

```text
pnpm --dir components/adapters/codex run bench:session-contention
```

Environment: Node `v24.15.0`, Windows `win32`, `x64`; 10 warmup batches and 50 measured batches per mode; each batch completes concurrent turns through the production `completeCodexSessionTurn` path. The same-session mode uses one session ID for every turn. The independent-session mode uses a distinct session ID per turn. Setup and cleanup are outside the timed region.

| Concurrency | Mode | Samples | Failures | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | same-session | 50 | 0 | 21.100 | 365.121 | 401.675 | 401.675 |
| 1 | independent-sessions | 50 | 0 | 12.945 | 19.203 | 24.463 | 24.463 |
| 4 | same-session | 50 | 0 | 62.802 | 78.659 | 96.702 | 96.702 |
| 4 | independent-sessions | 50 | 0 | 63.027 | 78.217 | 206.234 | 206.234 |
| 8 | same-session | 50 | 0 | 125.670 | 127.906 | 175.854 | 175.854 |
| 8 | independent-sessions | 50 | 0 | 126.326 | 142.468 | 145.132 | 145.132 |

### Decision

Keep the conservative global `snapshot-updates.lock`. At the relevant concurrent workloads, independent sessions do not show a repeatable p95 improvement over same-session work. This benchmark does not prove that a per-session lock split could never help; it shows that the current evidence does not justify adding lock topology or recovery complexity.

The isolated concurrency-one same-session outlier is not sufficient to establish a lock regression. Re-run with tracing of lock wait and filesystem operations if a production symptom or stronger contention signal appears.

## Immutable attribution contract

No live provider economics experiment is authorized until the downstream router exposes a stable request-level join.

### Required identifiers

- `experimentRequestId`: one opaque ID generated at benchmark ingress for each logical benchmark row.
- `providerAttemptId`: one opaque ID generated for each actual upstream send, including retries and replay/fallback sends. Retries must not reuse an attempt ID.
- `routerRecordId`: one immutable ID assigned by the downstream router to the persisted provider record.

The adapter must persist `experimentRequestId` and `providerAttemptId` in its local trace and pass them through a supported router metadata/header field. The router must preserve them without rewriting and return or expose the resulting `routerRecordId` in the usage record and request-details record.

### Current boundary status

The Codex adapter now forwards `x-lightrsi-request-id` and a unique
`x-lightrsi-provider-attempt-id` to upstreams identified as 9Router, and keeps
the attempt ID in local transport evidence. This proves only the adapter-side
boundary. Exact attribution remains unavailable until 9Router preserves those
IDs and exposes an immutable `routerRecordId` in both authoritative tables.
### Join invariants

1. Every successful or failed provider attempt has exactly one `routerRecordId` or an explicit unavailable outcome.
2. `usageHistory` and `requestDetails` expose the same `routerRecordId` for the same attempt.
3. `routerRecordId` is unique within the evidence window and remains stable across rereads.
4. Each `routerRecordId` maps to exactly one `experimentRequestId` and one `providerAttemptId`.
5. Retry, replay, and fallback attempts are represented as separate records and can be grouped by the logical request ID without collapsing attempt-level cost or usage.
6. The evidence query rejects duplicates, missing joins, model/provider mismatches, and status mismatches instead of guessing.

### Evidence output

The reconciler must emit, per provider attempt:

```text
experimentRequestId
providerAttemptId
routerRecordId
arm
model
provider
status
inputTokens
cachedInputTokens
outputTokens
routerRecordedCostUsd
observedAt
```

It must also emit coverage counts for logical requests, provider attempts, usage rows, request-detail rows, exact joins, duplicate IDs, and missing IDs. Exact request-level economics are `unavailable` unless all required joins pass. Window- and model-based totals remain comparative evidence only and cannot authorize promotion.

### Promotion gate

A live experiment may proceed only after a dry-run or fixture-backed router probe demonstrates the join invariants and the reconciler fails closed on a missing, duplicate, or conflicting `routerRecordId`.
