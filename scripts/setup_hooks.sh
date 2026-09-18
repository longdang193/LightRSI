# distribution_tier: starter_kit
#!/usr/bin/env bash
set -eu

repo_root="$(git rev-parse --show-toplevel)"
hooks_dir="$(git -C "$repo_root" rev-parse --path-format=absolute --git-path hooks)"
hook_path="$hooks_dir/pre-commit"
previous_hook="$hooks_dir/pre-commit.project-os.previous"
if [ -f "$hook_path" ] && ! grep -q 'project-os-pre-commit-v1' "$hook_path"; then
  if [ ! -e "$previous_hook" ]; then
    cp -p "$hook_path" "$previous_hook"
  fi
fi
mkdir -p "$hooks_dir"

cat > "$hook_path" <<'HOOK'
#!/bin/sh
set -eu
# project-os-pre-commit-v1

repo_root="$(git rev-parse --show-toplevel)"
hooks_dir="$(git -C "$repo_root" rev-parse --path-format=absolute --git-path hooks)"
previous_hook="$hooks_dir/pre-commit.project-os.previous"

if [ -x "$repo_root/.venv/Scripts/python.exe" ]; then
  python_cmd="$repo_root/.venv/Scripts/python.exe"
elif [ -x "$repo_root/.venv/bin/python" ]; then
  python_cmd="$repo_root/.venv/bin/python"
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

if [ -x "$previous_hook" ]; then
  "$previous_hook"
fi
HOOK

chmod +x "$hook_path"
printf 'Installed pre-commit hook at %s\n' "$hook_path"
