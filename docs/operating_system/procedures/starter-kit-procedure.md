# Starter-Kit Procedure

This document defines how maintainers rebuild, validate, and review the
generated `project-OS-starter-kit` from source.

## Rule

`project-OS-starter` is the only source of truth.

Do not edit generated `project-OS-starter-kit` output directly.

If kit behavior or contents must change, edit source-owned files in
`project-OS-starter`, then rebuild and revalidate the kit.

## When To Rebuild

Rebuild the starter kit after changing any shipped source-owned surface such as:

- `AGENTS.md`
- shipped root instruction docs (`GEMINI.md`, `CLAUDE.md`)
- `.agents/skills/`
- shipped `docs/operating_system/` docs
- shipped `repo_config/` starter inputs
- shipped validator scripts or shipped tests
- `repo_config/starter-kit-manifest.json`
- `scripts/build_starter_kit.py`
- `scripts/validate_starter_kit.py`

## Build Output

The default generated output root is:

```text
generated_exports/project-OS-starter-kit/
```

Treat that tree as disposable generated output.

Use this generated path directly as starter-kit distribution. Do not maintain or
sync a separate sibling `project-OS-starter-kit` folder. Rebuild this output
from `project-OS-starter` before creating or refreshing a consumer repository.

## Rebuild Steps

1. validate repo config inputs
2. rebuild the kit
3. validate generated kit shape and content
4. inspect generated diff before publishing or copying elsewhere

Commands:

```powershell
py -3 scripts/validate_repo_config.py
py -3 scripts/build_starter_kit.py
py -3 scripts/validate_starter_kit.py
```

Optional focused regression commands:

```powershell
py -3 -m pytest tests/test_starter_kit_generation.py tests/test_validate_repo_config.py -q
```

## Review Standard

Before treating a rebuild as ready, confirm:

- generated root contains shipped `AGENTS.md`, `GEMINI.md`, and `CLAUDE.md`
- required starter directories exist under `docs/superpowers/`
- forbidden factory-only paths are absent
- forbidden source-only references do not appear in shipped human-facing docs,
  skills
- direct edits were made only in source-owned repo files, not inside generated
  output

## Related Procedures

Keep these procedures separate:

- starter-kit procedure -> build consume-only clone-ready starter output
- public mirror procedure -> curate product-facing public export
- source-only adapter regeneration procedure -> maintain private factory/runtime
  generation surfaces outside starter output
- private runtime-bundle procedures -> maintain local provider/runtime deployment
  surfaces outside starter output

The starter kit ships final root instruction files for downstream use, but it
must not ship downstream adapter-regeneration machinery.
