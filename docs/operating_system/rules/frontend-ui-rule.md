---
name: frontend-ui
description: Route material front-end work through repository UI and accessibility requirements.
alwaysApply: true
required_reads: []
distribution_tier: starter_kit
---

# Frontend UI Rule

- Route material frontend and accessibility implementation through this rule. Route material visual or UX judgment through an explicitly selected applicable design skill. When `impeccable` is explicitly selected, use it for its frontend design scope and do not additionally invoke `ui-ux-pro-max` or `skill-distinctive-frontend-design` for the same design decision unless the user requests an independent second review or the scopes are materially different. When no design skill is explicitly selected, preserve existing frontend skill eligibility and routing behavior, including `ui-ux-pro-max` when available and applicable. Existing project design-system sources remain canonical; do not persist a second design-system SSOT without explicit approval.
- `impeccable` is explicitly selected only when the user directly invokes or requests it, or an approved specification, plan, or current bounded task contract names it as a required skill. Installation, discovery, availability, and generic applicability do not select it.
- Impeccable is a design method, not repository authority. Project intent, approved behavior, design-system sources, component and state ownership, integration contracts, accessibility requirements, tests, measured performance claims, and final verification remain owned by their existing Project OS sources.
- Do not create or update `PRODUCT.md`, `DESIGN.md`, or persistent Impeccable-managed state in the starter workflow unless a separate integration decision assigns an owner, lifecycle, and cleanup/update contract. Hooks remain opt-in integration decisions.
- Curate generated design exports before adopting them as project design-system sources; generated output does not become canonical by appearing in the repository.
- When frozen UX reference, specification, project design system, and implementation conflict, surface the conflict for reconciliation; do not silently rewrite the frozen reference or implementation.
- Impeccable may assist with frontend optimization, but measured performance claims and acceptance evidence remain owned by `skill-performance-optimization`.
- Skip skill invocation for copy-only edits, mechanical selector changes, or isolated nonvisual frontend logic.
- Prefer intrinsic, relational, and bounded layout over fixed coordinates, magic offsets, fixed heights on text-bearing containers, and duplicated calculations. Use Grid, Flexbox, `gap`, `minmax()`, `clamp()`, `auto`, `fr`, `aspect-ratio`, and wrapping where they express the relationship directly.
- Declare each layout relationship once. Parents own child arrangement; children own internal layout and behavior. Reuse existing components, semantic tokens, typography, spacing, icon family, and interaction patterns, but do not create abstractions or tokens for one-off values.
- Design components to reflow in narrow containers and under long, localized, missing, or zoomed content. Use container queries when behavior depends on container size; use media queries when behavior depends on viewport or device capability.
- Prefer semantic HTML and native controls over custom scripted equivalents.
- Meet the project's accessibility contract, defaulting to WCAG 2.2 AA when no stricter baseline exists. Preserve keyboard operation, visible focus, descriptive labels, sufficient contrast, reduced-motion support, responsive layout, supported themes, and clear loading, empty, error, disabled, hover, focus, and pressed states where applicable.
- Put shareable or restorable filters, sorting, tabs, pagination, and similar navigation state in the URL when the router supports it. Avoid duplicate local or global owners; verify deep links, refresh, and browser Back/Forward behavior.
- Model asynchronous UI as explicit transitions where applicable: pending, success, empty, error, retry, cancellation, stale or refreshing data, and optimistic rollback. Prevent duplicate submissions and preserve prior data when it remains valid.
- Use `skill-frontend-component-engineering` for stateful components, server-data ownership, URL state, or asynchronous transitions. Approved specification owns product behavior; component work must not invent it.
- When work crosses frontend behavior and backend contracts or routes, use `skill-full-stack-integration`. A matching `*.integration.md` sidecar owns temporary contract-to-UI mapping, unresolved mismatches, and acceptance evidence only; existing schemas, generated clients, backend routes, and tests establish current transport behavior. Report conflicts and affected owners before implementation.
- Among equally correct and safe options, minimize total user burden through safe defaults, recognition over recall, progressive disclosure, error prevention, and reversible actions.
- Material visual changes require fresh rendered or browser evidence for affected container sizes, supported themes, long content and zoom, keyboard and focus behavior, console errors, and unexpected layout shifts. Reuse existing visual-regression tooling; do not add tooling solely for this rule. Source inspection alone is insufficient.
- When a browser-interaction capability is available, use it for repeatable navigation, forms, accessibility snapshots, viewport checks, and screenshots. Browser evidence never replaces committed regression tests. Resolve the capability through `docs/operating_system/tooling/runtime-tool-resolution.md`.
- Use external documentation capability only when active executor exposes it and pinned project sources do not answer version-specific UI framework or accessibility-library behavior. Treat returned guidance as advisory and follow runtime data-boundary rules.
- Browser MCP sessions provide live evidence, not durable regression coverage. Preserve important behavior in the existing Playwright Test or end-to-end suite when one exists; do not add a new test framework solely for this rule.
- Keep detailed command playbooks, style catalogs, and checklists inside the selected design skill; do not duplicate them in repository rules or root instructions.
- If no applicable design skill is selected or available, follow this rule and the existing product design system. Do not block a safe local fix.
