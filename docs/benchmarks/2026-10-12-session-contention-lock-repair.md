# Session Persistence Lock Repair

Date: 2026-10-12

## Root cause

The session persistence locks use a directory as the acquisition marker and
write `owner.json` immediately afterward. Three implementations treated a
missing `owner.json` as malformed or stale and fell back to the lock directory
mtime. A waiter could therefore delete a lock directory during the short
window between directory creation and owner metadata creation, causing
`ENOENT` failures or unsafe lock replacement.

The missing-owner state is an active acquisition state, not proof that a lock
is stale. Malformed owner metadata remains eligible for the existing stale-lock
fallback because that is a completed lock with unreadable metadata, whereas a
missing file can still belong to a live acquirer.

## Repaired implementations

- `components/packages/foundation/host-adapter/src/state/file-store.ts`
- `components/packages/foundation/host-adapter/src/context-rewrite/plan-store.ts`
- `components/adapters/codex/src/context-rewrite/rebase-epoch.ts`

Each implementation now treats `ENOENT` while reading `owner.json` as active
contention and preserves the existing malformed-owner recovery behavior.

## Regression proof

Focused commands:

```text
pnpm --dir components/packages/foundation/host-adapter exec node --import tsx --test tests/session-store.test.ts tests/context-rewrite-plan-store.test.ts
```

Result: 30 passed, 0 failed.

```text
pnpm --dir components/adapters/codex exec node --import tsx --test --test-concurrency=1 tests/session-state.test.ts tests/context-rebase-epoch.test.ts
```

Result: 32 passed, 0 failed.

The three focused suites cover missing-owner contention, malformed stale-lock
recovery, concurrent stale-lock recovery, session persistence, and rebase
epoch durability behavior.

## Fresh contention benchmark

Command:

```text
pnpm --dir components/adapters/codex run bench:session-contention
```

Environment: Node `v24.15.0`, Windows `win32`, `x64`; 10 warmup batches and 50
measured batches per mode. Setup and cleanup are outside the timed region.

| Concurrency | Mode | Samples | Failures | p50 (ms) | p95 (ms) | p99 (ms) | Max (ms) |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | same-session | 50 | 0 | 5.776 | 7.244 | 8.191 | 8.191 |
| 1 | independent-sessions | 50 | 0 | 5.701 | 6.675 | 7.171 | 7.171 |
| 4 | same-session | 50 | 0 | 63.556 | 64.592 | 64.744 | 64.744 |
| 4 | independent-sessions | 50 | 0 | 63.070 | 65.962 | 108.764 | 108.764 |
| 8 | same-session | 50 | 0 | 125.926 | 129.351 | 171.699 | 171.699 |
| 8 | independent-sessions | 50 | 0 | 125.674 | 138.063 | 155.347 | 155.347 |

## Decision

Keep the conservative global `snapshot-updates.lock`. All modes completed with
zero failures after the repair, and independent sessions do not show a
repeatable p95 improvement over same-session work at the tested concurrency.
The evidence does not justify introducing per-session lock topology or more
recovery complexity.

This benchmark validates local persistence contention only. It does not remove
the live authenticated 9Router gate: exact economics still require one
immutable downstream `routerRecordId` joined across `usageHistory` and
`requestDetails` for every provider attempt.
