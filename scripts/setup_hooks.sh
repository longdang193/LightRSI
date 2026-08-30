# distribution_tier: starter_kit
#!/usr/bin/env bash
set -eu

repo_root="$(git rev-parse --show-toplevel)"
hook_path="$repo_root/.git/hooks/pre-commit"
mkdir -p "$(dirname "$hook_path")"

cat > "$hook_path" <<'HOOK'
#!/bin/sh
set -eu

if [ -x "./.venv/Scripts/python.exe" ]; then
  ./.venv/Scripts/python.exe scripts/validate_repo_contracts.py --fast
else
  ./.venv/bin/python scripts/validate_repo_contracts.py --fast
fi
HOOK

chmod +x "$hook_path"
printf 'Installed pre-commit hook at %s\n' "$hook_path"
