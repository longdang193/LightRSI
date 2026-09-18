param()

# distribution_tier: starter_kit
$ErrorActionPreference = "Stop"

$repoRoot = git rev-parse --show-toplevel
if (-not $repoRoot) {
    throw "Unable to resolve repo root."
}

$hookDir = (git -C $repoRoot rev-parse --path-format=absolute --git-path hooks).Trim()
$hookPath = Join-Path $hookDir "pre-commit"
$previousHook = Join-Path $hookDir "pre-commit.project-os.previous"
if ((Test-Path -LiteralPath $hookPath) -and -not (Select-String -LiteralPath $hookPath -Pattern "project-os-pre-commit-v1" -Quiet)) {
    if (-not (Test-Path -LiteralPath $previousHook)) {
        Copy-Item -LiteralPath $hookPath -Destination $previousHook
    }
}
if (-not (Test-Path -LiteralPath $hookDir)) {
    New-Item -ItemType Directory -Force -Path $hookDir | Out-Null
}

$hook = @'
#!/bin/sh
set -eu
# project-os-pre-commit-v1

repo_root="$(git rev-parse --show-toplevel)"
hooks_dir="$(git -C "$repo_root" rev-parse --path-format=absolute --git-path hooks)"
previous_hook="$hooks_dir/pre-commit.project-os.previous"
if [ -f "$repo_root/scripts/validate_repo_contracts.py" ]; then
  validator="$repo_root/scripts/validate_repo_contracts.py"
else
  validator="$HOME/.agents/project-os/scripts/validate_repo_contracts.py"
fi
if [ ! -f "$validator" ]; then
  echo "Missing Project OS validator: $validator" >&2
  exit 1
fi

if [ -x "$repo_root/.venv/Scripts/python.exe" ]; then
  "$repo_root/.venv/Scripts/python.exe" "$validator" --repo-root "$repo_root" --fast
elif [ -x "$repo_root/.venv/bin/python" ]; then
  "$repo_root/.venv/bin/python" "$validator" --repo-root "$repo_root" --fast
else
  py -3 "$validator" --repo-root "$repo_root" --fast
fi
if [ -x "$previous_hook" ]; then
  "$previous_hook"
fi
'@

Set-Content -LiteralPath $hookPath -Value $hook -Encoding UTF8
Write-Host "Installed pre-commit hook at $hookPath"
