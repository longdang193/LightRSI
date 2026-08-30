---
name: skill-full-stack-integration
description: Use when frontend behavior crosses backend API contracts or routes and needs contract reconciliation, typed client wiring, or end-to-end verification.
distribution_tier: starter_kit
---

# Full-Stack Integration

## Role

Complete smallest frontend-to-backend vertical slice while preserving one transport-contract owner and direct backend proof. Follow `docs/operating_system/rules/frontend-backend-integration-rule.md`. Colocated `*.integration.md` files are optional temporary contract-to-UI mappings when cross-boundary coordination needs them; they never replace specifications, schemas, generated clients, backend routes, or tests.

## Sidecar Contract

Keep sidecars brief:

```md
# UserProfileCard Integration
Operation: `getUserProfile`
Contract owner: `openapi.yaml#getUserProfile`
Final spec: `<path when applicable>`
Status: pending

## UI Behavior
- loading: `ProfileSkeleton`
- 403: `AccessDenied`
- 404: `UserNotFound`

## Unresolved Mismatches
- none

## Required Evidence
- direct backend boundary, failure, state, and authorization checks pass
- contract conformance passes when applicable
- frontend documented states pass
- browser request and visible flow match contract
```

Reference request and response schemas; do not copy them.

## Core Method

1. Read the approved final specification when one exists or behavior needs durable definition, the prototype reference when material, the matching sidecar when one exists, the existing client or query, mocks, backend route, canonical contract owner, and focused tests.
2. Use source, canonical contracts, security policy, routes, and tests to establish current behavior. If a sidecar exists and requests conflicting behavior, report the exact mismatch and affected owners, present viable options, and ask the user to decide before implementation. Security and data-safety constraints remain non-negotiable; after approval, update all affected owners together.
3. State minimum code, route-impact, or contract capability and required evidence, then resolve it through `docs/operating_system/tooling/runtime-tool-resolution.md`.
4. Before changing an API route handler, inspect route consumers and impact with an available fresh capability when material; fall back to source search when unavailable, without weakening required proof.
5. Implement smallest complete slice: canonical contract when applicable, backend validation and authorization, narrow route or service change, existing client generation command, frontend query or mutation, and mapped UI states. Reuse existing mocks; do not add mock infrastructure by default.
6. Use `skill-backend-verification` for direct boundary, business/failure, state, dependency, contract, representative-operation, and automated backend evidence before accepting consumer proof.
7. When the consumer is frontend and independently evolving consumer/provider compatibility risk is material, invoke the generic `consumer-driven compatibility evidence` contract from `docs/operating_system/tooling/frontend-backend-integration-tools.md` after direct backend proof.
8. Use external documentation capability only when active executor exposes it and pinned local sources do not answer a version-specific library question; treat output as advisory and follow runtime data-boundary rules.
9. Run focused frontend checks. When browser-interaction capability is available, use it for repeatable user flows and accessibility state.
10. If a sidecar was created, remove it when all acceptance evidence passes. If blocked, delete completed items and retain only exact unresolved work.
11. Hand final claims to `skill-verification-before-completion`. Store MCP Memory only for a verified recurring invariant or costly failure not already owned by source or documentation when active executor exposes it; under DeepAgents, use validated Codex handoff facts. Never store task progress, payloads, credentials, or user data.

## Common Mistakes

- copying transport schemas into frontend notes
- invoking every MCP instead of one tool per question
- changing shared authorization or error mapping without consumer impact
- adding OpenAPI, MSW, registries, validators, or status systems not already needed
- keeping completed sidecars as permanent parallel documentation
- treating browser evidence as replacement for committed tests
