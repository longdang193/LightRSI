---
name: python-contracts
description: Enforce typing, exception, data-safety, and verification invariants for Python changes.
alwaysApply: false
required_reads:
- .agents/skills/skill-code-standards/SKILL.md
distribution_tier: starter_kit
---

# Python Contracts Rule

- Validate untrusted inputs at boundaries.
- Use precise types where they prevent ambiguity.
- Never swallow exceptions or lose failure context.
- Preserve data before destructive migration or cleanup.
- Add focused verification for non-trivial behavior.
- Existing `@meta` blocks are grandfathered; new Python metadata is not required.
