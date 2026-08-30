# Project Adoption Migration

Prefer the generated Starter kit as the atomic adoption unit:

1. Build and validate generated Starter kit from the source repository.
2. Copy that generated kit into the new repository without mixing in source-only factory files.
3. Preserve product code and tests, then replace starter identity and project-specific docs.
4. Remove optional layers only when their references and consumers are removed together.
5. Run `py -3 scripts/validate_repo_contracts.py --fast` from the adopted repository.

Code discovery remains source-first. Describe required capability and evidence
before selecting a runtime tool. Resolve unmet capabilities through
`docs/operating_system/tooling/runtime-tool-resolution.md`; unavailable tools
never block safe work and never replace mandatory evidence.

Do not use manual file-by-file copying as the primary adoption path. Do not
import generated architecture lineage, private tooling state, or source-only
adapter machinery into consume-only repositories.
