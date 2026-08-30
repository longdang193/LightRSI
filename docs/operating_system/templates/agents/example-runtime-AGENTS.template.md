# Runtime Instructions

This directory owns runtime behavior for the main application or pipeline.

## Editing Rules

- Preserve the authoritative contracts for runtime behavior when changing code.
- Keep runtime-facing changes aligned with the owning source-of-truth docs.
- Keep repo operating rules in `docs/operating_system/`, not in runtime code comments.
- Update tests when changing flow, artifacts, validation, or external behavior.
- Prefer explicit contracts over hidden coupling.
