---
name: command-execution
description: Define command execution safety boundaries and escalation conditions.
alwaysApply: true
required_reads:
- docs/operating_system/governance/repo-governance.md
- AGENTS.md
tags:
- rule
- safety
- execution
distribution_tier: starter_kit
---

# Command Execution Rule

Use approved command patterns by default, escalate before risky operations, and
prevent destructive execution without explicit approval flow.

## Allow

- `git status`
- `git diff`
- `git branch --show-current`
- `python -m py_compile`
- `pytest`
- `scripts/validate_repo_contracts.py --fast`
- `scripts/publish_public_repo.ps1`

## Prompt Before Execute

- `git push`
- `git push --force-with-lease`
- `docker compose up -d --build`
- recursive delete or move operations
- `scripts/publish_public_repo.ps1 -Push`

## Forbidden

- Ad hoc publication to the public repo outside `scripts/publish_public_repo.ps1 -Push`
