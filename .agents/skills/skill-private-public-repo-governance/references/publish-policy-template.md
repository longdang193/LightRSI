# Publish Policy Template

Use this template when defining what moves from a private repo into a public curated repo.

## Repo Roles

- Private repo:
  - full development source of truth
- Public repo:
  - curated product-facing mirror

## Always Include

- `src/`
- `README.md`
- product-facing docs
- setup and usage guides
- stable examples

## Always Exclude

- `.agents/`
- `.cursor/`
- `docs/superpowers/`
- `logs/`
- `sample/`
- scratch files
- internal workflow assets

## Review Before Publish

- generated docs
- config examples
- sample artifacts
- benchmark outputs
- architecture notes

## Publication Rule

Prefer allowlist export:

- copy approved paths into a clean publication target
- validate the target
- publish the validated target only
