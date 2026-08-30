# Public Repo Publication Policy

This document is normative publication-boundary policy for private-source to public-mirror export.

## Scope

This policy defines:

- repo role model
- classification buckets for publication decisions
- mandatory inclusion/exclusion boundaries
- policy authority and precedence

This policy does not define execution commands. Use runbook:

- [Publication Procedure](../procedures/publication-procedure.md)

For doc sanitization patterns, use:

- [Public-Safe Doc Rewrite Guide](./public-safe-doc-rewrite-guide.md)

## Repo Roles

- Private repo:
  - full engineering source of truth
  - internal planning/governance/agent assets allowed
- Public repo:
  - curated downstream mirror
  - product-facing code and docs only

Day-to-day development happens in private repo only.

## Publication Authority

Canonical policy source for path and metadata boundary enforcement:

- `repo_config/publication-config.json`

If script/runbook wording conflicts with this policy, this policy controls boundary rules.

## Content Classification

### always_private

Never publish. Examples:

- `.agents/`
- `.cursor/`
- `docs/operating_system/`
- `docs/superpowers/`
- logs/debug/scratch internals

### usually_public

Usually publish when stable and product-facing. Examples:

- `src/`
- `tests/` (when useful)
- `README.md`
- public setup/usage docs

### review_before_publish

Case-by-case review. Examples:

- generated docs
- sample artifacts
- architecture docs with possible internal references

## Mandatory Boundary Rules

- use allowlist-first export
- deny policy always overrides allowlist inclusion
- denylisted paths must not appear in export
- forbidden metadata markers (example: `repo: private`) must fail export
- forbidden filename markers (example: `.private.`, `.local.`) must fail export
- `distribution_tier: starter_kit` is classification metadata only, not secrecy marker
- missing/malformed boundary policy must fail closed

## Public README Rule

Public README must stand alone for external reader and must not depend on private planning/governance context.

## Enforcement Expectations

Publication workflow must include:

1. curated export
2. policy validation (paths + metadata markers + forbidden filename markers)
3. required-path checks
4. reviewer inspection
5. publication

Procedure details belong to runbook:

- [Publication Procedure](../procedures/publication-procedure.md)
