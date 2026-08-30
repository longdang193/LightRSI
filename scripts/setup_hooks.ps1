param()

# distribution_tier: starter_kit
$ErrorActionPreference = "Stop"

$repoRoot = git rev-parse --show-toplevel
if (-not $repoRoot) {
    throw "Unable to resolve repo root."
}

$hookPath = Join-Path $repoRoot ".git/hooks/pre-commit"
$hookDir = Split-Path -Parent $hookPath
if (-not (Test-Path -LiteralPath $hookDir)) {
    New-Item -ItemType Directory -Force -Path $hookDir | Out-Null
}

$hook = @'
#!/bin/sh
set -eu

./.venv/Scripts/python.exe scripts/validate_repo_contracts.py --fast
'@

Set-Content -LiteralPath $hookPath -Value $hook -Encoding UTF8
Write-Host "Installed pre-commit hook at $hookPath"
