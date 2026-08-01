GUA-06 Cross-host Acceptance

## Scope

- Independent validator: 观祥
- Repository: `zjunlp/LightMem2`
- Base commit: `734da09e1e19d6bbb37c8b52bb703f0db70bd122`
- Provider: committed mock upstreams only
- Secrets/API keys: none

This report independently checks the merged Claude request rewrite and Codex
response-chain rebase behavior. The shared protocol-closure comparison is
deferred because the shared implementation is not present at the accepted base
commit.

## Environment

- OS/architecture: `Microsoft Windows 10.0.26200`, `x64`
- Node: `v24.18.0`
- pnpm: `10.32.1`
- OpenClaw: `2026.7.1-2 (0790d9f)`
- Claude CLI: unavailable
- Codex CLI: unavailable

All tests use temporary state directories and mock upstreams. They do not read
or write the user's real Claude, Codex, or OpenClaw configuration.

## Claude independent acceptance

Command:

```text
corepack pnpm --filter @lightmem2/openclaw-adapter exec node --import tsx --test src/context-rewrite/claude-cross-acceptance.test.ts
```

Result:

```text
tests 2
pass 2
fail 0
```

Verified:

- Five consecutive full-history requests were sent through the real Claude
  gateway runtime.
- The first three requests ran before restart and the final two ran after a new
  gateway runtime started with the same state directory.
- `EVICT_ME_<uuid>` was absent from every captured rewritten upstream request.
- `KEEP_ME_<uuid>` remained present before and after restart.
- Anthropic `tool_use` / `tool_result` closure remained complete.
- Saved characters were computed from the raw captured upstream bodies.
- A synthetic rewrite exception was injected through `structuredClone`.
- The gateway bypassed the rewrite, forwarded the unmodified sentinel-bearing
  history, preserved tool closure, returned a successful upstream response, and
  recorded `analysis_or_apply_error` without exposing raw context in the trace.

Claude portion: **PASS** for mock non-streaming acceptance.

Known limitation: this independent test does not use a real Claude provider or
the streaming path.

## Codex independent acceptance

Command:

```text
corepack pnpm --filter @lightmem2/codex-adapter exec node --import tsx --test tests/context-rebase-behavior.test.ts tests/context-rebase-pipeline.test.ts tests/context-rebase-cooldown.test.ts tests/context-rebase-epoch.test.ts
```

Result:

```text
tests 44
pass 44
fail 0
```

Verified:

- Rebase requests removed the old `previous_response_id`.
- `EVICT_ME_*` was absent and `KEEP_ME_*` remained in rebuilt input.
- Five turns continued on the newly committed response chain.
- A new response id remained bound to the original Codex session.
- Proxy restart preserved the committed rebase chain.
- Function/custom tool call-output closure tests passed.
- Rejected non-streaming and streaming rebases retried the original request.
- Successful original fallback entered cooldown and did not interrupt the user
  request.
- Pending epochs were recovered after restart.
- Missing response ids, journal failures, malformed epoch rows, and cooldown
  persistence failures did not produce unsafe commits.

Codex portion: **PASS** for mock streaming/non-streaming acceptance.

Known limitation: this independent run does not use a real Codex provider.

## Rollout parser regression

Command:

```text
corepack pnpm --filter @lightmem2/codex-adapter exec node --import tsx --test tests/context-history-rollout.test.ts
```

Result:

```text
tests 8
pass 8
fail 0
```

Malformed rows degrade gracefully, the latest compaction baseline is selected,
unsafe items are deferred, and function/custom tool outputs remain correctly
typed.

## Static validation

The following commands passed:

```text
corepack pnpm --filter @lightmem2/openclaw-adapter typecheck
corepack pnpm --filter @lightmem2/claude-code-adapter typecheck
corepack pnpm --filter @lightmem2/codex-adapter typecheck
corepack pnpm --filter @lightmem2/host-adapter typecheck
corepack pnpm run check:boundaries
```

Boundary result:

```text
Package boundaries valid (16 packages, 57 internal edges).
```

## Deferred shared-closure acceptance

Status: **DEFERRED**

At base commit `734da09e...`:

```text
components/packages/foundation/host-adapter/src/context-rewrite/
├── contracts.ts
└── index.ts
```

`protocol-closure.ts` is absent and `index.ts` exports only `contracts.ts`.
Therefore the shared closure implementation cannot yet be compared with the
OpenClaw reference without modifying 亚彬's owned files. This report deliberately
does not implement or patch that dependency.

Re-run this final GUA-06 item after the shared closure commit is merged into
`main`.

## Full OpenClaw suite note

The complete OpenClaw suite was also run:

```text
corepack pnpm --filter @lightmem2/openclaw-adapter test
```

Result on this machine:

```text
tests 103
pass 100
fail 3
```

Both new GUA-06 tests pass inside the complete suite. The three failures are
pre-existing Windows/environment baselines:

1. `uses isolated config paths and does not inherit secrets` constructs
   `new RegExp(environment.rootDir)` without escaping Windows backslashes. The
   actual config path is inside the temporary root, but the regular expression
   interprets the backslashes as escapes.
2. `normalizeConfig preserves the TokenPilot default module contract` expects a
   hard-coded POSIX `/tmp/...` path while Windows correctly produces
   `\tmp\...`.
3. `release package loads without monorepo workspace dependencies` cannot spawn
   `bash` from this PowerShell environment (`spawn bash ENOENT`).

The focused golden fixture tests pass. No GUA-02 through GUA-05 code is changed
in this branch.

## Overall decision

- Claude independent acceptance: **PASS**
- Codex independent acceptance: **PASS**
- Rollout regression: **PASS**
- Shared closure vs OpenClaw reference: **DEFERRED**
- Overall GUA-06: **PARTIAL PASS**, pending 亚彬's shared closure commit and
  maintainer review by 徐步强
