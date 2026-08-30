# Public-Safe Doc Rewrite Guide

Use this guide when a private-source project wants to publish selected docs into
a curated public mirror without leaking starter-only or repo-internal context.

This guide is about rewriting docs, not merely copying them. A doc becomes
public-safe when it can stand alone for an external reader who does not have
access to the private repo's governance layers, planning artifacts, or starter
customization flow.

Scope of this document:

- sanitization decisions and rewrite patterns only

Canonical companions:

- policy authority: [Public Repo Publication Policy](./public-repo-publication-policy.md)
- execution runbook: [Publication Procedure](../procedures/publication-procedure.md)

Public-safe does not mean "delete everything private-adjacent." The public
mirror should preserve reproducible shape whenever that structure is safe to
reveal.

## Core Principle

Rewrite docs from this:

- how to adapt the private starter repo

into this:

- how to use, configure, contribute to, or understand the public product-facing repo

If a reader would need access to private repo context to understand the doc,
the doc is not public-safe yet.

Short form:

- redact payload, not evidence

## Decide: Keep, Sanitize, Or Omit

Use one of three treatments for each candidate file.

### Keep As-Is

Use when the file is already public-safe and can be published without
redaction.

Typical examples:

- a rewritten `README.md`
- product-facing setup or usage docs
- public examples

### Keep And Sanitize

Use when the file's presence, schema, headings, or metadata keys help preserve
reproducibility or navigation, but some values are private.

Typical examples:

- manifests or inventories that can keep their shape while removing sensitive entries
- metadata-bearing docs whose private refs can be blanked
- files that should still show the public artifact slots even when details are withheld

Sanitize when:

- the file contributes to the public mirror's credibility or traceability
- the structure is safe to reveal
- sensitive values can be removed without misrepresenting the project

### Omit Entirely

Use when the file itself is private-sensitive, or when even its existence would
expose internal-only operating details.

Typical examples:

- agent memory
- internal publication workflows
- internal prompts
- private runbooks whose existence is itself sensitive

## Preserve Structural Shape

When a file is part of the public mirror's observable structure, prefer
preserving:

- the file path
- headings and sections
- metadata keys
- link roles
- artifact slots that help readers understand what kinds of records exist

Do not treat a private field inside a file as automatic evidence that the whole
file should disappear from the public mirror.

Good public-safe sanitization preserves:

- parseability
- truthful structure
- enough visible context for a downstream reader to understand what was withheld

Avoid:

- broken schemas
- empty headings with no explanation
- broken links with no replacement or note
- deleting a whole file when a thin, truthful public-safe version would work

## Sensitivity Levels

Use this decision boundary:

- file-level sensitivity: omit the file entirely
- section-level sensitivity: keep the file and replace the sensitive section with a short public-safe summary or redaction note
- field-level sensitivity: keep the file and blank, redact, or neutralize only the sensitive values

When in doubt, ask whether the file's visible structure helps a public reader
understand or reproduce the project shape. If yes, prefer sanitization over
omission when the structure is safe.

## Sanitization Patterns

Good sanitization patterns include:

- `specs: []`
- `plans: []`
- `related_docs: []`
- `private_notes: redacted in public mirror`
- a short public-safe summary replacing an internal execution section

Use placeholders that preserve syntax and communicate intent. A sanitized file
should still be valid and understandable.

## What Usually Stays Private

Do not publish docs that still depend on:

- `docs/operating_system/`
- `docs/superpowers/`
- `.agents/`
- `.codex/`
- private adapter or publication workflows
- starter customization order
- adoption-mode decisions
- "replace starter identity" framing

Examples of private-source docs:

- `docs/operating_system/adoption/project-adoption-migration-guide.md`
- starter migration runbooks
- starter bootstrap checklists
- internal publication workflow guidance

Some files in those categories should still be omitted entirely. The presence
of a private-only reference inside a different file does not automatically mean
that second file must also be omitted; it may need sanitization instead.

## Public-Safe Rewrite Checklist

Before treating a doc as public-safe, confirm:

- starter/adoption/bootstrap framing is removed or recast for public readers
- private-only path references are removed, replaced, or sanitized
- internal planning and governance references are removed, summarized, or redacted appropriately
- the doc explains the public project directly
- linked docs are also public-safe or intentionally omitted from the public mirror
- the doc makes sense to an external contributor or user on its own
- the doc keeps any structural elements that help reproducibility when those elements are safe to reveal

## Red Flags

These phrases or patterns should trigger rewrite review:

- `replace starter identity`
- `first hour checklist`
- `choose adoption mode`
- `docs/operating_system/`
- `docs/superpowers/`
- `.agents/`
- `.codex/`
- adapter sync instructions
- private publication workflow details
- `how to customize the private starter repo`

Their presence does not always mean a doc must be private, but they are strong
signals that the doc still depends on private repo context.

## File-Specific Rewrite Guidance

### `README.md`

Public-safe `README.md` should:

- describe the product or project directly
- explain what the repo contains in public-facing terms
- link only to public-safe docs
- stand alone without private planning or governance context

Remove or rewrite:

- starter/bootstrap framing
- private customization order
- required reading from `docs/operating_system/`
- references to private planning or agent layers

Keep or strengthen:

- project description
- public setup and usage entrypoints
- contributor-facing quickstart
- links to public-safe docs
- stable public navigation structure when it helps readers understand the repo

### `docs/setup.md`

Public-safe setup docs should:

- explain how a contributor or user gets a working environment
- list dependencies, required tool versions, prerequisites, and install steps
- describe bootstrap in product-facing terms

Remove or rewrite:

- starter-adoption sequencing
- "after cloning the starter" framing
- private repo customization order
- private workflow prerequisites that do not apply to public contributors

Keep or strengthen:

- installation commands
- required toolchain versions
- local environment setup steps
- non-obvious prerequisites
- public-safe notes about intentionally redacted private bootstrap details when needed

### `docs/configuration.md`

Public-safe configuration docs should:

- explain configuration surfaces that matter to public users or contributors
- describe environment variables, config files, profiles, defaults, and overrides
- clarify which config belongs in public-safe runtime surfaces

Remove or rewrite:

- private publication config details
- internal repo-governance references
- private-only path assumptions
- explanations that depend on private planning systems

Keep or strengthen:

- config ownership that matters to public contributors
- environment-variable docs
- examples of safe local configuration
- defaults and override behavior
- config schema shape or key groupings when they help readers understand the system

### `docs/usage.md`

Public-safe usage docs should:

- explain how to run or use the project after setup
- document public commands, entrypoints, or contributor workflows
- help an external reader understand normal operation

Remove or rewrite:

- instructions about turning the starter into a project
- private onboarding sequencing
- internal-only contributor workflow assumptions

Keep or strengthen:

- commands
- entrypoints
- normal user or contributor flows
- examples of expected usage
- visible workflow structure even if some internal-only variants are redacted

### `docs/pipeline.md`

Public-safe pipeline docs should:

- explain the system workflow or processing flow in product-facing language
- describe stages, handoffs, or major steps that matter to external readers

Remove or rewrite:

- internal migration steps
- starter-adoption sequencing
- private workflow artifacts that are not part of the public system story

Keep or strengthen:

- stage descriptions
- end-to-end sequence
- operational or processing flow
- public-safe diagrams or summaries
- stage or artifact slots whose presence helps a public reader understand the workflow shape

### `docs/architecture.md`

Public-safe architecture docs should:

- explain the public-facing system architecture
- describe components, boundaries, and integrations that help readers understand the product
- focus on runtime or system shape, not internal repo method

Remove or rewrite:

- internal repo-governance layers presented as system architecture
- private planning or adapter surfaces
- starter-method explanations that do not belong in public product docs

Keep or strengthen:

- major components
- data/control/information flow
- integration points
- reader-facing architecture rationale
- public-safe structural views even when some internal planning references are removed

## Rewrite Pattern

When rewriting a doc, use this sequence:

1. Identify all private-only phrases, links, and dependencies.
2. Decide whether the file should be kept as-is, kept and sanitized, or omitted entirely.
3. Remove, replace, or sanitize starter-specific framing and private payloads.
4. Re-express the doc for an external reader:
   - user
   - contributor
   - operator
5. Check that every linked doc is also intended for the public mirror.
6. Re-read the doc as if the private repo did not exist.

If that last step fails, the doc still needs rewrite work.

## Practical Review Questions

Before publishing a rewritten doc, ask:

- would this still make sense if the reader never saw the private repo?
- does this doc talk about the product, or mostly about how the starter repo is managed?
- are any linked files private-only?
- does the doc still assume private workflows, private planning docs, or private tooling layers?
- did I remove too much structure for the public mirror to stay credible and reproducible?

If the answer is "yes" to the last two questions, keep rewriting or keep the
doc private.
