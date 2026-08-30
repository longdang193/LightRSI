# Planning Dispatch

Use `Artifact Selection` when artifact choice is unclear. Use `Executor
Selection` when task runtime choice is unclear. Create the smallest policy or
artifact needed for safe execution.

## Artifact Selection

| Condition | Action |
| --- | --- |
| Local, reversible, design-clear change | Edit directly |
| Broad problem framing, options, or trade-offs remain | Use `skill-brainstorming`; save a report only when requested |
| User explicitly invokes wayfinding for a known destination with materially unresolved dependent decisions expected to span multiple sessions | Use `skill-wayfinding` with one template-validated map and one writer |
| Behavior, UI intent, interfaces, or invariants need prototype validation | Use `skill-spec-drafting` with `draft-specification`; keep one file |
| Draft behavior is approved and all applicable post-approval inputs are complete | Promote same file to `detailed-specification` and `status: active` |
| Owner-approved UX freeze or equivalent approved visual prototype needs durable design inputs | Use an explicitly selected Design Export method; provider availability or installation does not select a provider or make it a Starter dependency |
| Behavior, interfaces, or invariants need durable definition without prototype work | Use `skill-spec-drafting` |
| Approved design or direct approved scope needs multiple implementation steps | Use `skill-writing-plans` |
| Multi-task execution needs durable resume or delegated checkpoints | Select `git-tracked` coordination |
| Parallel writers are required | Select `git-tracked` coordination with isolated worktrees and disjoint ownership |
| A change affects existing specifications, contracts, or ownership boundaries | Reconcile those impacts during specification drafting before planning; create only the needed specification and plan |
| Isolation materially reduces execution risk | Use `skill-using-git-worktrees`, then execute plan |
| Approved plan exists | Use `skill-executing-plans` |
| Final completion proof is needed | Use `skill-verification-before-completion` |
| Verified work needs an authorized Git disposition | Use `skill-finishing-a-development-branch` |

## Change Revision

Keep one specification when the accepted outcome remains the same and only
scope, design, or implementation understanding changes. Revise that
specification and reconcile its plan. Create a new specification for a
different problem, independent outcome, or scope expansion that stands alone.
Revise only `proposed` or `active` specifications. Treat `completed` and
`superseded` specifications as historical; use them as baseline evidence for a
new specification instead of rewriting them.
Do not use an arbitrary overlap threshold.

## Coordination Method Selection

Select `skill-chief-of-staff` as an optional coordination specialization of
`skill-executing-plans` only when an approved Git-tracked plan lists
`skill-chief-of-staff` in `Required skills` and needs sustained handoffs,
independent top-level Codex main-agent lanes, or cross-task coordination. Keep
ordinary single-lane work on the existing execution path.

The `Required skills` entry is the canonical CoS opt-in signal. CoS does not add
an executor, profile, plan field, or durable state artifact.
It applies only when the task ledger `Executor` is `codex` and runtime parity,
plan binding, lane identity, and profile-binding gates pass under a native Codex
lead controller. Herdr is runtime observation and
main-agent supervision, not
executor selection or task acceptance. CoS dispatches only independent Herdr
top-level Codex main-agent sessions; it never calls
`multi_agent_v1`, native Codex subagents, DeepAgents internal `task` workers,
Tura internal workers, or executor-local reviewers or helpers. `deepagents` and
`tura` retain their existing peer executor paths.
For every Herdr main-agent launch, CoS verifies branch, `HEAD`, expected base,
lane ownership, and allowed paths. It uses `scripts/herdr_main_launcher.py` for
runtime projection, exact session/pane/cwd checks, and Git-fact reporting; the
launcher resolves provider, model, and developer instructions from
`agents/*.toml`.

## Delivery Lifecycle

Use these gates only when their trigger applies:

1. Discovery or research when uncertainty exists.
2. Prototype and iterate when UX or behavior needs validation.
3. Design review when material design judgment is required.
4. UX or behavior approval when approval is required.
5. Design Export when an applicable owner-approved UX freeze or equivalent approved visual prototype needs durable design inputs.
6. Detailed specification when durable behavior or contracts need definition; specification drafting reconciles affected existing contracts, specifications, and ownership boundaries.
7. Repository reconciliation when current source, tests, contracts, or configuration must be checked against approved scope.
8. Implementation plan when work needs multiple steps, dependencies, or handoffs.
9. Implementation.
10. Integration when a boundary is crossed.
11. Applicable frontend, backend, browser, or end-to-end verification.
12. Independent review when risk or policy requires it.

Approval does not itself authorize draft promotion when an explicitly applicable
post-approval input remains incomplete. Design Export method selection is
explicit; named providers are task or runtime facts, not Starter dependencies.

A Design Export gate is complete only when the selected export method provides
a durable output identity attributable to the current task and requested
deliverable. Workspace presence, agent prose, inferred deliverable
classification, evidence from another task or run, and producer self-assessment
do not establish completion. When independent review is applicable under this
lifecycle, its PASS must apply to the same task and output identities. If those
bindings cannot be established, the Design Export gate remains incomplete or
blocked.

Downstream project-owned handoff: Release/Deploy → Observe, when applicable.

Design-clear reversible work may go directly to execution. Material backend
behavior requires direct backend proof. End-to-end verification applies only to
cross-boundary journeys. Release/deploy and observe remain project-owned and
optional; they are not generic lifecycle gates.

## Artifact Ownership

- brainstorming reports own exploration
- specifications own approved behavior, design decisions, and scope/ownership reconciliation for affected maintained contracts
- draft specifications temporarily own exploratory behavior, UI intent, assumptions, prototype references, and validation findings; promotion replaces draft content in place
- implementation plans own exact tasks, files, commands, dependencies, execution approach, shared-write controls, and verification

No artifact is required merely to connect two other artifacts. Source, tests,
configuration, and validators remain executable truth.

## Executor Selection

Executor and profile selection are independent. Select executor from task
authority, containment, topology, and expected runtime benefit. Then select the
lowest profile that can reliably complete that executor's bounded contract.

| Condition | Eligible executor |
| --- | --- |
| Codex-owned MCP, connected tools, project coordination, cross-task judgment, or final acceptance is required | `codex` |
| Task is bounded and runtime-managed batching, dependency execution, or compact execution state is likely to provide material benefit | `tura` |
| Task is bounded but long-horizon, context-heavy, exploratory, or materially helped by isolated internal contexts | `deepagents` |
| No delegated executor has clear task-specific benefit or executor fitness is unclear | `codex` |

These are advisory eligibility rules, not a classifier. Do not map profile rank
or task function permanently to an executor. Do not add automatic executor
fallback or runtime-internal plan coordination. Use task-specific evidence when
using `prefer`; otherwise keep Codex as the safe default.
