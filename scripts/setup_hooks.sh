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
  python_cmd="./.venv/Scripts/python.exe"
elif [ -x "./.venv/bin/python" ]; then
  python_cmd="./.venv/bin/python"
else
  python_cmd="py -3"
fi

if [ -f "$repo_root/scripts/validate_repo_contracts.py" ]; then
  validator="$repo_root/scripts/validate_repo_contracts.py"
else
  validator="$HOME/.agents/project-os/scripts/validate_repo_contracts.py"
fi
if [ ! -f "$validator" ]; then
  echo "Missing Project OS validator: $validator" >&2
  exit 1
fi

if [ "$python_cmd" = "py -3" ]; then
  py -3 "$validator" --repo-root "$repo_root" --fast
else
  "$python_cmd" "$validator" --repo-root "$repo_root" --fast
fi
HOOK

chmod +x "$hook_path"
printf 'Installed pre-commit hook at %s\n' "$hook_path"
