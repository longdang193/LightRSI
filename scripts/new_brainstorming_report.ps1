# distribution_tier: starter_kit
param(
  [Parameter(Mandatory=$true)][string]$ReportId
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($ReportId -notmatch '^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$') {
  throw "ReportId must match YYYY-MM-DD-HH-MM-<topic>: $ReportId"
}

$root = "docs/superpowers/plans/brainstorming/$ReportId"
$template = "docs/operating_system/templates/brainstorming-detailed-report-template.md"
$report = "$root/report.md"

if (Test-Path -LiteralPath $root) { throw "Brainstorming report already exists: $root" }
if (-not (Test-Path -LiteralPath $template)) { throw "Brainstorming template not found: $template" }

New-Item -ItemType Directory -Path $root | Out-Null
Copy-Item -LiteralPath $template -Destination $report

Write-Host "Created brainstorming report at $report"
