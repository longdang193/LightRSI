---
template_id: wayfinding-map
target_globs:
- docs/superpowers/plans/wayfinding/*/map.md
required_sections:
- Destination
- Entry Gate Evidence
- Write Control
- Decision Frontier
- Decisions Settled
- Not Yet Specified
- Out of Scope
- Canonical Promotion And Handoff
- Closure And Supersession
distribution_tier: starter_kit
---

# Wayfinding Map

## Destination

State one bounded destination and its owner. Do not expand destination into
implementation scope.

## Entry Gate Evidence

Record explicit wayfinding invocation, known destination, materially unresolved
dependent decisions, and expected multi-session duration.

## Write Control

Name one lead controller as sole writer. Record how read-only findings from
other sessions return to that writer.

## Decision Frontier

Use one row per unresolved question:

| ID | Question | Dependencies | State | Decision-work owner |
|---|---|---|---|---|
| D1 | <precise decision question> | <IDs or none> | open / stale / blocked | <named owner> |

## Decisions Settled

Record only concise provisional outcomes with evidence links and supersession
state. Do not copy specification prose.

## Not Yet Specified

List behavior, interfaces, invariants, or decisions that still need promotion
through `skill-spec-drafting`.

## Out of Scope

List code, build tasks, estimates, implementation acceptance tests, builder
assignments, tracker IDs, research logs, and prototype artifacts.

## Canonical Promotion And Handoff

Record one promotion through `skill-spec-drafting` and the later handoff to
`skill-writing-plans`. Link canonical artifacts instead of duplicating content.

## Closure And Supersession

Record destination validity, empty frontier, resolved fog, no stale items,
promotion, handoff, and closure status. If replaced, mark this map
`superseded` and link exactly one successor.
