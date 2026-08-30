# Code Intelligence Tools

Use code-intelligence capability only when native file inspection, search, and
tests do not answer current question. Keep source, tests, contracts, and CI as
truth. Resolve any unmet capability through
`docs/operating_system/tooling/runtime-tool-resolution.md`.

## Capability Guidance

| Question | Capability and evidence |
|---|---|
| current files or bounded local change | native file tools, search, diff, and tests |
| exact symbol, reference, implementation, or diagnostic | symbol-aware code intelligence; verify against current source |
| unknown-location concept or similar implementation | repository-wide discovery; verify matches against current source |
| structural search or edit preview | structural analysis; source remains edit truth |
| execution flow, dependency, or impact | flow/impact analysis when fresh; treat graph output as advisory |
| unfamiliar external repository orientation | external repository documentation; verify pinned source before implementation |
| correctness and architecture enforcement | tests, static checks, and CI |
| durable architecture boundary or rationale | `docs/architecture.md` and ADRs |

## Handoff

1. State question, minimum capability, authority boundary, and required evidence.
2. Start with native tools for current files and bounded scope.
3. Resolve only unmet capability through runtime tool resolution.
4. Use one primary provider per capability question; combine independent capabilities only when claim needs independent evidence.
5. Smoke-check unfamiliar provider before relying on material output.
6. Current source and tests win every conflict.
7. Tool absence or stale analysis never blocks safe source-first work, but never downgrades mandatory evidence.

## Boundary

No code-intelligence capability owns architecture, contracts, runtime behavior,
or completion status. Do not create provider catalogs, duplicate contracts, or
persist tool output as repository truth.
