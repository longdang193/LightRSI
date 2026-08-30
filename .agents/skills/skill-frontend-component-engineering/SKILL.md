---
name: skill-frontend-component-engineering
description: Use when stateful frontend components or pages need decisions about component boundaries, state ownership, URL state, server data, or asynchronous UI transitions.
required_reads: []
distribution_tier: starter_kit
---

# Frontend Component Engineering

## Role

Implement approved UI behavior using smallest component and state structure with one owner per fact and clear failure behavior. Visual direction, accessibility, responsive layout, and rendered evidence remain in `docs/operating_system/rules/frontend-ui-rule.md` and the selected applicable design skill.

## When To Use

Use for stateful components, data-backed pages, shareable filters, client/server state decisions, or optimistic mutations.

Skip for copy-only changes, isolated styling, or simple presentational components with obvious props.

## Core Method

1. Inspect existing components, router, data cache, state libraries, and tests.
2. Read approved specification and matching `*.integration.md` sidecar when present. Use `skill-full-stack-integration` for backend contract or route work; do not invent missing product behavior during implementation.
3. Define the component contract and name the single owner of each state value.
4. Choose the nearest native owner that satisfies the behavior:
   - local state for component-only interaction
   - nearest shared ancestor for sibling coordination
   - URL state for shareable, refresh-safe, Back/Forward-aware navigation state
   - existing server-state cache for remote data, invalidation, and synchronization
   - context for stable cross-tree dependencies such as theme, locale, or session
   - existing global store only for complex app-wide client state
5. Prefer simple props. Use composition when configuration props start encoding child structure or layout.
6. Separate data orchestration from presentation only when mixing them obscures failure behavior, reuse, or testing. Do not create container components by default.
7. Model applicable transitions before implementation: pending, success, empty, error, retry, cancellation, stale or refreshing data, and duplicate submission. Scope pending locks and duplicate-action guards to the affected entity or operation; do not serialize unrelated interactions.
8. Use optimistic updates only when the action is reversible and previous state can be restored safely. Snapshot and restore the smallest affected state so rollback does not overwrite unrelated successful work. Reconcile with canonical server state after settlement.
9. Reuse current platform features and installed dependencies. Do not add stores, hooks, folders, or abstractions for hypothetical reuse.
10. Do not add memoization, caching, virtualization, prefetching, or lazy loading without evidence that the affected path is material. Follow `skill-performance-optimization` when performance is an explicit requirement or measured problem.

## Example

A searchable table whose filters, sort, page, and tab must survive refresh and support sharing uses validated URL search parameters as owner. It does not mirror them into `useState`, local storage, context, or a global store. Filter changes reset pagination in the same URL update.

## Verification

- exercise realistic, long, localized, empty, and failing data
- verify deep links, refresh, and Back/Forward when URL state is involved
- verify pending, retry, duplicate submission, failure restoration, and server reconciliation for mutations
- add the smallest focused regression check using existing test tooling
- follow `docs/operating_system/rules/frontend-ui-rule.md` for browser and accessibility evidence
- use external documentation capability only when active executor exposes it for version-specific framework or accessibility-library questions not answered by pinned project sources; resolve it through `docs/operating_system/tooling/runtime-tool-resolution.md`

## Common Mistakes

- splitting components by file length instead of ownership and change patterns
- replacing prop drilling with context before restructuring the owner boundary
- keeping the same state in URL, local state, and a global store
- duplicating request or response schemas from a canonical backend contract into frontend notes
- extracting presentation and orchestration layers when neither is reused or clearer
- optimistic UI without rollback, conflict handling, or duplicate-action control
- global mutation locks or whole-list rollback for an entity-scoped action
- speculative memoization, caching, virtualization, prefetching, or lazy loading
