# repo: private
# distribution_tier: starter_kit
[CmdletBinding()]
param(
    [string]$ExportRoot = (Join-Path $env:TEMP "project-public-export"),
    [string]$PublicRemote = "public",
    [string]$PublicBranch = "main",
    [string]$CommitMessage = "Publish curated public mirror",
    [string]$ConfigPath = 'repo_config/publication-config.json',
    [switch]$Push
)

$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    $root = git rev-parse --show-toplevel
    if (-not $root) {
        throw "Unable to resolve repo root."
    }

    return $root.Trim()
}

function Get-PublicationConfig {
    param(
        [string]$RepoRoot,
        [string]$ConfigPath
    )

    $configFullPath = if ([System.IO.Path]::IsPathRooted($ConfigPath)) {
        $ConfigPath
    } else {
        Join-Path $RepoRoot $ConfigPath
    }
    if (-not (Test-Path -LiteralPath $configFullPath)) {
        throw "Publication config not found: $configFullPath"
    }

    return Get-Content -Raw -LiteralPath $configFullPath | ConvertFrom-Json
}

function Ensure-CleanDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }

    New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Ensure-ParentDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
    }
}

function Copy-PublicPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourceRoot,
        [Parameter(Mandatory = $true)]
        [string]$DestinationRoot,
        [Parameter(Mandatory = $true)]
        [string]$RelativePath
    )

    $source = Join-Path $SourceRoot $RelativePath
    if (-not (Test-Path -LiteralPath $source)) {
        return
    }

    $sourceItem = Get-Item -LiteralPath $source -ErrorAction Stop
    $destination = Join-Path $DestinationRoot $RelativePath
    Ensure-ParentDirectory -Path $destination

    if ($sourceItem.PSIsContainer) {
        Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
    } else {
        $relativeDirectory = Split-Path -Parent $RelativePath
        $destinationDirectory = if ([string]::IsNullOrWhiteSpace($relativeDirectory) -or $relativeDirectory -eq '.') {
            $DestinationRoot
        } else {
            Join-Path $DestinationRoot $relativeDirectory
        }
        if (-not (Test-Path -LiteralPath $destinationDirectory)) {
            New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
        }
        Copy-Item -LiteralPath $source -Destination $destinationDirectory -Force
        if (-not (Test-Path -LiteralPath $destination)) {
            $bytes = [System.IO.File]::ReadAllBytes([System.IO.Path]::GetFullPath($source))
            [System.IO.File]::WriteAllBytes([System.IO.Path]::GetFullPath($destination), $bytes)
        }
    }

    if (Test-Path -LiteralPath $destination) {
        $cacheDirs = Get-ChildItem -LiteralPath $destination -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue
        foreach ($dir in $cacheDirs) {
            Remove-Item -LiteralPath $dir.FullName -Recurse -Force
        }

        $pycFiles = Get-ChildItem -LiteralPath $destination -Recurse -File -Filter '*.pyc' -ErrorAction SilentlyContinue
        foreach ($file in $pycFiles) {
            Remove-Item -LiteralPath $file.FullName -Force
        }
    }
}

function Get-RelativePathCompat {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BasePath,
        [Parameter(Mandatory = $true)]
        [string]$TargetPath
    )

    $baseFull = [System.IO.Path]::GetFullPath($BasePath)
    $targetFull = [System.IO.Path]::GetFullPath($TargetPath)

    if ($baseFull -eq $targetFull) {
        return '.'
    }

    try {
        return [System.IO.Path]::GetRelativePath($baseFull, $targetFull)
    } catch {
        # PowerShell 5 / older runtime: fall back to URI-based relative path logic below.
    }

    $baseWithSep = if ($baseFull.EndsWith([System.IO.Path]::DirectorySeparatorChar) -or $baseFull.EndsWith([System.IO.Path]::AltDirectorySeparatorChar)) {
        $baseFull
    } else {
        $baseFull + [System.IO.Path]::DirectorySeparatorChar
    }

    $baseUri = New-Object System.Uri($baseWithSep)
    $targetUri = New-Object System.Uri($targetFull)
    $relativeUri = $baseUri.MakeRelativeUri($targetUri)
    $relative = [System.Uri]::UnescapeDataString($relativeUri.ToString())
    return $relative.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
}

function Normalize-RelativePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $normalized = $Path.Replace('\', '/')
    if ($normalized.StartsWith('./')) {
        $normalized = $normalized.Substring(2)
    }
    if ($normalized.StartsWith('/')) {
        $normalized = $normalized.Substring(1)
    }
    return $normalized
}

function Resolve-PublicPathSeeds {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourceRoot,
        [Parameter(Mandatory = $true)]
        [string[]]$PublicPaths
    )

    $resolved = New-Object System.Collections.Generic.HashSet[string] ([System.StringComparer]::OrdinalIgnoreCase)

    foreach ($relativePath in $PublicPaths) {
        $source = Join-Path $SourceRoot $relativePath
        if (-not (Test-Path -LiteralPath $source)) {
            throw "Configured public path does not exist: $relativePath"
        }

        $item = Get-Item -LiteralPath $source -ErrorAction Stop
        if ($item.PSIsContainer) {
            $files = Get-ChildItem -LiteralPath $source -Recurse -File
            foreach ($file in $files) {
                $rel = Get-RelativePathCompat -BasePath $SourceRoot -TargetPath $file.FullName
                $null = $resolved.Add((Normalize-RelativePath -Path $rel))
            }
        } else {
            $rel = Get-RelativePathCompat -BasePath $SourceRoot -TargetPath $item.FullName
            $null = $resolved.Add((Normalize-RelativePath -Path $rel))
        }
    }

    return @($resolved | Sort-Object)
}

function Apply-PublicExcludeGlobs {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Paths,
        [Parameter(Mandatory = $false)]
        [string[]]$ExcludeGlobs
    )

    if (-not $ExcludeGlobs -or $ExcludeGlobs.Count -eq 0) {
        return $Paths
    }

    $kept = New-Object System.Collections.Generic.List[string]
    foreach ($path in $Paths) {
        $isExcluded = $false
        foreach ($pattern in $ExcludeGlobs) {
            if ($path -like $pattern) {
                $isExcluded = $true
                break
            }
        }
        if (-not $isExcluded) {
            $kept.Add($path) | Out-Null
        }
    }

    return @($kept | Sort-Object)
}

function Assert-PublicPathIsFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourceRoot,
        [Parameter(Mandatory = $true)]
        [string]$RelativePath
    )

    $source = Join-Path $SourceRoot $RelativePath
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Configured public path does not exist: $RelativePath"
    }

    $item = Get-Item -LiteralPath $source
    if ($item.PSIsContainer) {
        throw "Directory-level publicPaths entry is not allowed: $RelativePath. Use explicit file paths only."
    }
}

function Assert-ForbiddenPathAbsent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DestinationRoot,
        [Parameter(Mandatory = $true)]
        [string]$RelativePath
    )

    $path = Join-Path $DestinationRoot $RelativePath
    if (Test-Path -LiteralPath $path) {
        throw "Forbidden path present in public export: $RelativePath"
    }
}

function Assert-RequiredPathPresent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DestinationRoot,
        [Parameter(Mandatory = $true)]
        [string]$RelativePath
    )

    $path = Join-Path $DestinationRoot $RelativePath
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Required public path missing from export: $RelativePath"
    }
}

function Assert-NoPrivateReferences {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DestinationRoot
    )

    $patterns = @(
        'AGENTS\.md',
        '\.agents/',
        '\.codex/',
        '\.cursor/',
        'docs/operating_system/',
        'docs/superpowers/',
        '/[A-Za-z]:/',
        '\([A-Za-z]:/',
        'file://'
    )

    $files = Get-ChildItem -LiteralPath $DestinationRoot -Recurse -File -Include *.md,*.yaml,*.yml,*.txt
    foreach ($file in $files) {
        $content = Get-Content -Raw -LiteralPath $file.FullName
        foreach ($pattern in $patterns) {
            if ($content -match $pattern) {
                throw "Private-only reference found in public export: $($file.FullName)"
            }
        }
    }
}

function Assert-NoLocalAbsoluteLinks {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DestinationRoot
    )

    $patterns = @(
        '/[A-Za-z]:/',
        '\([A-Za-z]:/',
        'file://'
    )

    $files = Get-ChildItem -LiteralPath $DestinationRoot -Recurse -File -Include *.md,*.yaml,*.yml,*.txt
    foreach ($file in $files) {
        $content = Get-Content -Raw -LiteralPath $file.FullName
        foreach ($pattern in $patterns) {
            if ($content -match $pattern) {
                throw "Local absolute link found in public export: $($file.FullName)"
            }
        }
    }
}

function Assert-NoForbiddenMetadataMarkers {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DestinationRoot,
        [string[]]$Markers
    )

    if (-not $Markers -or $Markers.Count -eq 0) {
        return
    }

    $files = Get-ChildItem -LiteralPath $DestinationRoot -Recurse -File -Include *.md,*.yaml,*.yml,*.txt,*.json,*.ps1,*.py,*.sh
    foreach ($file in $files) {
        $content = Get-Content -Raw -LiteralPath $file.FullName
        foreach ($marker in $Markers) {
            if (-not [string]::IsNullOrWhiteSpace($marker) -and $content -match [regex]::Escape($marker)) {
                throw "Forbidden metadata marker found in public export: $($file.FullName) -> $marker"
            }
        }
    }
}

function Remove-ForbiddenMetadataMarkedFiles {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DestinationRoot,
        [string[]]$Markers
    )

    if (-not $Markers -or $Markers.Count -eq 0) {
        return
    }

    $files = Get-ChildItem -LiteralPath $DestinationRoot -Recurse -File -Include *.md,*.yaml,*.yml,*.txt,*.json,*.ps1,*.py,*.sh
    foreach ($file in $files) {
        $content = Get-Content -Raw -LiteralPath $file.FullName
        foreach ($marker in $Markers) {
            if (-not [string]::IsNullOrWhiteSpace($marker) -and $content -match [regex]::Escape($marker)) {
                Remove-Item -LiteralPath $file.FullName -Force
                break
            }
        }
    }
}

function Assert-NoForbiddenFilenameMarkers {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DestinationRoot,
        [string[]]$Markers
    )

    if (-not $Markers -or $Markers.Count -eq 0) {
        return
    }

    $files = Get-ChildItem -LiteralPath $DestinationRoot -Recurse -File
    foreach ($file in $files) {
        $name = $file.Name.ToLowerInvariant()
        foreach ($marker in $Markers) {
            if ([string]::IsNullOrWhiteSpace($marker)) {
                continue
            }
            $needle = $marker.ToLowerInvariant()
            if ($name.Contains($needle)) {
                throw "Forbidden filename marker found in public export: $($file.FullName) -> $marker"
            }
        }
    }
}

function Remove-UnlistedGeneratedDocs {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DestinationRoot,
        [string[]]$AllowedGeneratedPaths
    )

    $generatedRoot = Join-Path $DestinationRoot 'docs/generated'
    if (-not (Test-Path -LiteralPath $generatedRoot)) {
        return
    }

    $allowed = @{}
    foreach ($path in $AllowedGeneratedPaths) {
        $allowed[$path.Replace('\', '/').ToLowerInvariant()] = $true
    }

    $generatedFiles = Get-ChildItem -LiteralPath $generatedRoot -Recurse -File
    foreach ($file in $generatedFiles) {
        $relative = (Get-RelativePathCompat -BasePath $DestinationRoot -TargetPath $file.FullName).Replace('\', '/').ToLowerInvariant()
        if (-not $allowed.ContainsKey($relative)) {
            Remove-Item -LiteralPath $file.FullName -Force
        }
    }
}

function Remove-PythonBuildArtifacts {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DestinationRoot
    )

    if (-not (Test-Path -LiteralPath $DestinationRoot)) {
        return
    }

    $cacheDirs = Get-ChildItem -LiteralPath $DestinationRoot -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue
    foreach ($dir in $cacheDirs) {
        Remove-Item -LiteralPath $dir.FullName -Recurse -Force
    }

    $pycFiles = Get-ChildItem -LiteralPath $DestinationRoot -Recurse -File -Filter '*.pyc' -ErrorAction SilentlyContinue
    foreach ($file in $pycFiles) {
        Remove-Item -LiteralPath $file.FullName -Force
    }
}

function Remove-PythonBuildArtifacts {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DestinationRoot
    )

    if (-not (Test-Path -LiteralPath $DestinationRoot)) {
        return
    }

    $cacheDirs = Get-ChildItem -LiteralPath $DestinationRoot -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue
    foreach ($dir in $cacheDirs) {
        Remove-Item -LiteralPath $dir.FullName -Recurse -Force
    }

    $pycFiles = Get-ChildItem -LiteralPath $DestinationRoot -Recurse -File -Filter '*.pyc' -ErrorAction SilentlyContinue
    foreach ($file in $pycFiles) {
        Remove-Item -LiteralPath $file.FullName -Force
    }
}

function Remove-PrivateAdapterFiles {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DestinationRoot
    )

    $agentFiles = Get-ChildItem -LiteralPath $DestinationRoot -Recurse -File -Filter 'AGENTS.md' -ErrorAction SilentlyContinue
    foreach ($file in $agentFiles) {
        Remove-Item -LiteralPath $file.FullName -Force
    }
}

function Remove-PrivateReferenceLines {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DestinationRoot,
        [Parameter(Mandatory = $true)]
        [string]$RelativePath
    )

    $patterns = @(
        'AGENTS\.md',
        'docs/superpowers/',
        'docs/operating_system/',
        '\.codex/',
        '\.agents/',
        '\.cursor/'
    )

    $targetRoot = Join-Path $DestinationRoot $RelativePath
    if (-not (Test-Path -LiteralPath $targetRoot)) {
        return
    }

    $files = Get-ChildItem -LiteralPath $targetRoot -Recurse -File -Include *.md,*.yaml,*.yml
    foreach ($file in $files) {
        $lines = Get-Content -LiteralPath $file.FullName
        $filtered = foreach ($line in $lines) {
            $skip = $false
            foreach ($pattern in $patterns) {
                if ($line -match $pattern) {
                    $skip = $true
                    break
                }
            }

            if (-not $skip) {
                $line
            }
        }

        Set-Content -LiteralPath $file.FullName -Value $filtered
    }
}

$repoRoot = Get-RepoRoot
$config = Get-PublicationConfig -RepoRoot $repoRoot -ConfigPath $ConfigPath
$publicPaths = @($config.publicPaths)
$forbiddenPaths = @($config.forbiddenPaths)
$requiredPaths = @($config.requiredPaths)
$allowedGeneratedPaths = @($config.allowedGeneratedPaths)
$scrubPrivateReferencePaths = @($config.scrubPrivateReferencePaths)
$forbiddenMetadataMarkers = @($config.forbiddenMetadataMarkers)
$forbiddenFilenameMarkers = @($config.forbiddenFilenameMarkers)
$publicExcludeGlobs = if ($null -ne $config.publicExcludeGlobs) { @($config.publicExcludeGlobs) } else { @() }
$effectivePublicPaths = Resolve-PublicPathSeeds -SourceRoot $repoRoot -PublicPaths $publicPaths
$effectivePublicPaths = Apply-PublicExcludeGlobs -Paths $effectivePublicPaths -ExcludeGlobs $publicExcludeGlobs

$remoteUrl = $null
if ($Push) {
    $remoteUrl = git remote get-url $PublicRemote 2>$null
    if (-not $remoteUrl) {
        throw "Remote '$PublicRemote' is not configured."
    }
}

Ensure-CleanDirectory -Path $ExportRoot

if ($Push) {
    Remove-Item -LiteralPath $ExportRoot -Recurse -Force
    $remoteHeads = git ls-remote --heads $PublicRemote

    if ($remoteHeads) {
        git clone --branch $PublicBranch --single-branch $remoteUrl $ExportRoot | Out-Null
        Get-ChildItem -LiteralPath $ExportRoot -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Recurse -Force
    } else {
        New-Item -ItemType Directory -Force -Path $ExportRoot | Out-Null
        git -C $ExportRoot init -b $PublicBranch | Out-Null
        git -C $ExportRoot remote add origin $remoteUrl
    }
}

foreach ($relativePath in $effectivePublicPaths) {
    $source = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $source)) {
        throw "Resolved public path does not exist at copy time: $relativePath"
    }

    $destination = Join-Path $ExportRoot $relativePath
    Ensure-ParentDirectory -Path $destination
    [System.IO.File]::Copy(
        [System.IO.Path]::GetFullPath($source),
        [System.IO.Path]::GetFullPath($destination),
        $true
    )
}

Remove-PythonBuildArtifacts -DestinationRoot $ExportRoot
Remove-UnlistedGeneratedDocs -DestinationRoot $ExportRoot -AllowedGeneratedPaths $allowedGeneratedPaths
Remove-PrivateAdapterFiles -DestinationRoot $ExportRoot
# Keep exported allowlist output intact until required-path checks run.
# Marker policy enforcement remains fail-fast at Assert-NoForbiddenMetadataMarkers.

foreach ($relativePath in $scrubPrivateReferencePaths) {
    Remove-PrivateReferenceLines -DestinationRoot $ExportRoot -RelativePath $relativePath
}

foreach ($relativePath in $forbiddenPaths) {
    Assert-ForbiddenPathAbsent -DestinationRoot $ExportRoot -RelativePath $relativePath
}

foreach ($relativePath in $requiredPaths) {
    Assert-RequiredPathPresent -DestinationRoot $ExportRoot -RelativePath $relativePath
}

Assert-NoPrivateReferences -DestinationRoot $ExportRoot
Assert-NoLocalAbsoluteLinks -DestinationRoot $ExportRoot
Assert-NoForbiddenMetadataMarkers -DestinationRoot $ExportRoot -Markers $forbiddenMetadataMarkers
Assert-NoForbiddenFilenameMarkers -DestinationRoot $ExportRoot -Markers $forbiddenFilenameMarkers

Write-Host "Public export prepared at: $ExportRoot"

if ($Push) {
    git -C $ExportRoot add -A
    $status = git -C $ExportRoot status --short

    if (-not $status) {
        Write-Host "No public-repo changes to publish."
        exit 0
    }

    git -C $ExportRoot commit -m $CommitMessage | Out-Null
    git -C $ExportRoot push origin $PublicBranch
    Write-Host "Public repo updated on branch '$PublicBranch'."
}
