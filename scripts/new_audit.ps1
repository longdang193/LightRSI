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
$localTemplate = Join-Path (Get-Location) "docs/operating_system/templates/audit-report-with-evidence-template.md"
$sharedTemplate = Join-Path $HOME ".agents/project-os/docs/operating_system/templates/audit-report-with-evidence-template.md"
$template = if (Test-Path -LiteralPath $localTemplate -PathType Leaf) { $localTemplate } elseif (Test-Path -LiteralPath $sharedTemplate -PathType Leaf) { $sharedTemplate } else { throw "Audit template not found in repository or shared Project OS installation." }
$report = "$root/report.md"

if (Test-Path -LiteralPath $root) { throw "Audit report already exists: $root" }

New-Item -ItemType Directory -Path $root | Out-Null
Copy-Item -LiteralPath $template -Destination $report

Write-Host "Created audit report at $report"
