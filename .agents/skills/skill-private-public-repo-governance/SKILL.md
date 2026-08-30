---
name: skill-private-public-repo-governance
description: Use when separating private development truth from curated public publication.
required_reads:
- docs/operating_system/governance/repo-governance.md
distribution_tier: starter_kit
---
# Private / Public Repo Governance

## Overview

Use this skill to set up or maintain a **private-source / public-mirror** workflow.

Core rule:

- private repo = development source of truth
- public repo = curated downstream mirror

Do not treat both repos as equal day-to-day development sources.

## Canonical Publication Docs

Use these docs as governing references for publication boundaries:

- `docs/operating_system/publication/public-repo-publication-policy.md`
- `docs/operating_system/publication/public-repo-publishing.md`
- `docs/operating_system/publication/public-safe-doc-rewrite-guide.md`

Precedence rule:

- boundary rules -> publication policy doc
- execution steps -> publishing runbook
- sanitization patterns -> rewrite guide

## When to Use

Use this skill when:

- a project needs a private internal repo plus a public showcase/product repo
- a public repo must stay clean while the internal repo keeps plans, drafts, agent assets, or experiments
- you need to define what stays private vs public
- you need a repeatable publish workflow between repos
- you need to validate that internal-only materials do not leak into a public release

Do not use this skill for:

- runtime/product validation
- normal single-repo branching strategy
- deployment/release engineering that is unrelated to repo boundary management

## Repo Role Model

### Private repo

The private repo is the full engineering workspace.

Typical contents:

- all source code
- tests
- full docs tree
- internal plans/specs/history
- agent/rules assets
- experiments
- debug and operating materials when useful

### Public repo

The public repo is the product-facing publication surface.

Typical contents:

- stable code
- polished README
- product-facing docs
- usage/setup guides
- examples worth showing
- clean generated discovery docs when useful

## Content Classification

Classify paths into content buckets before designing a publish workflow, then
decide whether each candidate artifact should be kept as-is, kept and
sanitized, or omitted entirely.

### `always_private`

Examples:

- `.agents/`
- `.cursor/`
- `docs/superpowers/`
- starter adoption/bootstrap docs such as `docs/operating_system/adoption/project-adoption-migration-guide.md`
- logs/debug artifacts
- internal prompts/workflow docs
- abandoned experiments
- scratch files

### `usually_public`

Examples:

- `src/`
- `tests/` when they improve clarity and trust
- `README.md`
- product-facing docs
- setup guides
- examples

### `review_before_publish`

Examples:

- generated docs
- config examples
- benchmark outputs
- sample artifacts
- architecture notes that may include internal workflow detail

## Publication Procedure

Preferred model:

1. Develop in the private repo.
2. Decide what is mature enough to publish.
3. Build a curated export for the public repo.
4. Validate the export boundary.
5. Push only the curated result to the public repo.

Prefer an **allowlist-first** publish workflow:

- copy approved paths
- avoid "copy everything, then delete bad stuff"

Choose between:

- **manual curated publish**
  Use when publication is infrequent and repo structure is still evolving.
- **scripted export workflow**
  Use when publication is recurring and boundary mistakes would be costly.

For each candidate file that survives the allowlist, choose one treatment:

- **keep as-is**
  Use when the file is already public-safe.
- **keep and sanitize**
  Use when the file's presence, schema, headings, or metadata keys help
  preserve reproducibility or navigation, but some values are private.
- **omit entirely**
  Use when the file itself is private-sensitive, or when even its existence
  would reveal internal-only operating detail.

Prefer sanitization when:

- the file contributes to public reproducibility
- the structure is safe to reveal
- sensitive values can be removed without misrepresenting the project

Short rule:

- redact payload, not evidence

## Boundary Validation

Before publishing, run a public-release boundary validation pass.

At minimum, check:

- no `.agents/` content
- no `.cursor/` content
- no `docs/superpowers/` content
- no logs/debug artifact folders
- no internal-only process docs
- no private-path references in public-facing docs
- public README still makes sense without internal context

If any of those fail, stop and fix the export boundary before pushing public changes.

Also check that you did not over-trim files whose visible structure helps the
public mirror remain credible and reproducible.

## Public Repo Smell Checks

Treat these as warning signs:

- the public repo mentions internal planning systems
- the public repo teaches how to customize the private starter repo
- public docs depend on archived internal specs/plans to be understandable
- the public repo contains agent/rule folders
- the public repo looks like a workbench instead of a product repo
- contributors are developing directly in the public repo instead of publishing into it

## Common Mistakes

### Developing in both repos

Problem:

- drift
- duplicated cleanup work
- unclear source of truth

Fix:

- keep development in private only
- publish outward intentionally

### Treating the public repo as "private minus a few deletions"

Problem:

- easy leakage of internal material

Fix:

- use an allowlist-oriented export policy

### Treating any private field as proof the whole file must disappear

Problem:

- public mirrors lose navigational shape
- reproducibility weakens because schemas, headings, or artifact slots vanish
- downstream readers cannot tell what kinds of artifacts exist upstream

Fix:

- classify sensitivity at the file, section, and field level
- preserve structure when it is safe to reveal
- sanitize private payloads instead of deleting the whole artifact when a thin,
  truthful public-safe version is possible

### Publishing starter-adoption docs as product docs

Problem:

- private bootstrap guidance leaks into the public mirror
- contributors confuse internal starter onboarding with public setup/usage docs

Fix:

- keep starter adoption/bootstrap docs private by default
- rewrite setup/usage docs intentionally for the public product-facing repo
- do not publish "how to customize the private starter repo" guidance unless it
  has been deliberately recast as public-facing documentation

### Mixing runtime validation with publish validation

Problem:

- repo-governance checks get confused with product correctness checks

Fix:

- keep this skill focused on publication-boundary validation only

## References

<LINK>
- Publish policy template:
  [references/publish-policy-template.md](references/publish-policy-template.md)
- Public release checklist:
  [references/public-release-checklist.md](references/public-release-checklist.md)
</LINK>
