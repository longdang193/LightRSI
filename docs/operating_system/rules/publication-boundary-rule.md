---
name: publication-boundary
description: Enforce private/public publication boundaries and controlled export workflow.
alwaysApply: true
required_reads:
- docs/operating_system/procedures/publication-procedure.md
- docs/operating_system/governance/repo-governance.md
tags:
- rule
- publication
- boundary
distribution_tier: starter_kit
---

# Publication Boundary Rule

Keep private-source surfaces out of public outputs and require the governed
publication workflow for mirror/export actions.

## Forbidden Paths For Public Publication

- `.agents/`
- `.cursor/`
- source-only generation machinery and private build inputs
- `docs/operating_system/`
- `docs/superpowers/`
- `logs/`
- `sample/`
- `.worktrees/`

## Prompt Before Execute

- Any command that would publish or copy private-only paths into the public repo.
