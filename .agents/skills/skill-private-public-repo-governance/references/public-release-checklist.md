# Public Release Checklist

Run this checklist before pushing to the public curated repo.

## Boundary Checks

- `.agents/` is absent
- `.cursor/` is absent
- `docs/superpowers/` is absent
- `logs/` is absent
- `sample/` is absent unless intentionally published as a reviewed public example set
- no internal prompt/process docs are included

## Doc Checks

- `README.md` describes the product clearly without internal context
- public docs do not depend on internal specs or plans
- public links resolve inside the public repo

## Presentation Checks

- repo structure is easy to scan
- examples are intentional and current
- no obviously abandoned experiments are included

## Governance Checks

- private repo remains the only development source of truth
- public repo changes came from a curated publish step
- content was reviewed under the private/public policy
