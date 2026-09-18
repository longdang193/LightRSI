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
$localTemplate = Join-Path (Get-Location) "docs/operating_system/templates/brainstorming-detailed-report-template.md"
$sharedTemplate = Join-Path $HOME ".agents/project-os/docs/operating_system/templates/brainstorming-detailed-report-template.md"
$template = if (Test-Path -LiteralPath $localTemplate -PathType Leaf) { $localTemplate } elseif (Test-Path -LiteralPath $sharedTemplate -PathType Leaf) { $sharedTemplate } else { throw "Brainstorming template not found in repository or shared Project OS installation." }
$report = "$root/report.md"

if (Test-Path -LiteralPath $root) { throw "Brainstorming report already exists: $root" }

New-Item -ItemType Directory -Path $root | Out-Null
Copy-Item -LiteralPath $template -Destination $report

Write-Host "Created brainstorming report at $report"
