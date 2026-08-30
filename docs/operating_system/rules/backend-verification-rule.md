---
name: backend-verification
description: Require direct, backend-independent proof for material backend behavior changes.
alwaysApply: true
required_reads: []
distribution_tier: starter_kit
---

# Backend Verification Rule

- Use `skill-backend-verification` for every material backend behavior change, including API routes, services, commands, workers, queue consumers, scheduled tasks, and webhooks.
- Required proof covers direct boundary behavior, important business and failure behavior, final state or side effects, and fresh automated output.
- Important failed operations must leave consistent state. Verify rollback, idempotency, retry, or partial-failure behavior when applicable.
- Contract proof is required when canonical contract changes or governs behavior. Real-dependency proof is required when behavior materially depends on database, queue, cache, filesystem, external service, or infrastructure semantics.
- Schema-driven API evidence may supplement contract proof for an HTTP/API boundary with a machine-readable schema; it does not satisfy required state, side-effect, authorization, dependency, rollback/idempotency, retry, duplicate-delivery, or trace proof.
- Reconstruct one representative operation through existing logs, identifiers, dependency records, or test instrumentation when traceability is material. Do not require new observability infrastructure for every change.
- Performance proof is required only for explicit performance claims or measured regressions. Browser proof is required only when frontend behavior is in scope.
- Frontend, browser, client, mock, or MCP output never substitutes for direct backend tests and state assertions.
