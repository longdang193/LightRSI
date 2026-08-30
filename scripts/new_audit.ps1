# distribution_tier: starter_kit
param(
  [Parameter(Mandatory=$true)][string]$AuditId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($AuditId -notmatch '^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$') {
  throw "AuditId must match YYYY-MM-DD-HH-MM-<topic>: $AuditId"
}

$root = "docs/superpowers/plans/audit/$AuditId"
$template = "docs/operating_system/templates/audit-report-with-evidence-template.md"
$report = "$root/report.md"

if (Test-Path -LiteralPath $root) { throw "Audit report already exists: $root" }
if (-not (Test-Path -LiteralPath $template)) { throw "Audit template not found: $template" }

New-Item -ItemType Directory -Path $root | Out-Null
Copy-Item -LiteralPath $template -Destination $report

Write-Host "Created audit report at $report"
