---
name: prompt-cache-contract
description: Keep prompt-cache optimizations deterministic, provider-owned, observable, and semantically neutral.
alwaysApply: false
required_reads:
  - .agents/skills/skill-performance-optimization/SKILL.md
distribution_tier: starter_kit
---

# Prompt Cache Contract Rule

Use this rule when changing system prompts, subagent bootstrap messages, tool
schemas, provider adapters, prompt serialization, cache controls, cache audits,
or token-cost reporting.

- Keep deterministic instructions, tool schemas, and stable system blocks before
  the provider cache boundary. Put assignments, local context, timestamps,
  runtime IDs, paths, and other volatile values after it when provider semantics
  allow.
- Preserve model-visible structure and meaning. Do not flatten structured system
  content, reorder tools, rewrite schemas, or normalize provider payloads only to
  improve a local hash.
- Let each provider adapter own native cache controls, breakpoints, TTLs, keys,
  retry behavior, and usage-field parsing. Do not invent a cross-provider cache
  service, database, or universal TTL.
- Keep cache identity isolated by provider, model, route, tenant, and security
  boundary. Never use raw prompts, credentials, tool arguments, retrieved text,
  or personal data as audit output.
- Treat stable-prefix hashes as serialization evidence only. A cache-hit claim
  requires provider-reported read tokens or equivalent provider evidence. If the
  provider does not expose that evidence, report the claim as unverified.
- When direct provider probing is prohibited or impractical, use the local
  project-owned provider boundary as the observation boundary. Require explicit
  cache counters or cache headers there; equal token counts, latency, output,
  or hashes alone do not prove cache reuse.
- Do not use direct-provider calls by default. Missing cache fields at the local
  boundary are an observability gap, not proof that provider caching is absent.
- For material changes, run focused proof for: cold then warm requests with an
  unchanged prefix and changed suffix; mutation before and after the cache
  boundary; tool/schema ordering; role or assignment changes; retries after
  optional cache-field rejection; and tenant/key isolation.
- Record exact wire shape, model, route, stable-prefix fingerprint, cache-family
  identifier, read/write token counters, latency, cost, and test conditions.
  Redact raw prompt content and secrets.
- Do not invent universal hit-rate, TTL, latency, or cost thresholds. Use the
  provider contract or an approved task-specific target. A failed local-boundary
  probe blocks the corresponding cache claim.
