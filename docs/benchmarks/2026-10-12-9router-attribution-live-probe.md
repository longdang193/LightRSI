# 9Router attribution live probe — October 12, 2026

## Scope

This is a durable-attribution probe, not an economics comparison. It exercised
one authenticated `POST /v1/responses` request through the installed 9Router
`0.5.99` runtime after the verified attribution overlay `1.1.0` was installed.

## Evidence

- Router URL: `http://127.0.0.1:20128`
- Model requested: `combo-high`
- HTTP status: `200`
- Response: successful Responses payload
- `x-lightrsi-request-id`: preserved as `live-join-d6f58824-b71d-45c6-a45c-305ea10498a0`
- `x-lightrsi-provider-attempt-id`: preserved as `attempt-de08aca1-c937-4583-a3f3-12c8c5da3298`
- Immutable `routerRecordId`: `95181a43-745e-4876-a6ca-a8796f223f49`
- `usageHistory`: one matching row, with the same three identifiers
- `requestDetails`: one matching row, with the same three identifiers
- Response usage: 20 prompt tokens, 5 completion tokens, router cost `0.000125`

The check queried the router's SQLite database after the request had flushed and
matched rows by the immutable experiment request and provider-attempt IDs. No
API key or request payload was retained in this report.

## Root cause repaired

The deployed global router was an unpacked package without the local attribution
overlay, even though the clean `0.5.99` overlay workspace had already passed its
apply and reverse-check verification. The patch-hub installer was used to build
and install the verified overlay; the global runtime was then restarted and the
probe above passed.

Separately, the LightMem2 live-repair CLI ignored
`LIGHTRSI_BENCHMARK_REPETITIONS`, which caused an intended one-repetition gate
to run five repetitions and 60 provider calls. The CLI now reads that setting,
with focused regression coverage in
`components/adapters/codex/tests/benchmark-generation-policy.test.ts`.

## Decision

The immutable request-level attribution gate passes. Same-session versus
independent-session persistence contention and any live economics comparison
remain separate follow-up work; this probe does not claim promotion or provider
invoice accuracy.
