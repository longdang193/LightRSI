[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$SecretFile,
    [string]$SecretKey = "FITCV_LLM_API_KEY",
    [string]$CodexConfigPath = (Join-Path $HOME ".codex\config.toml"),
    [string]$UvPath = (Join-Path $HOME ".local\bin\uv.exe"),
    [string]$TuraExecutable,
    [string]$TuraProviderConfig,
    [string]$DeepAgentsCodeVersion = "0.1.64",
    [switch]$SkipInstall,
    [switch]$ResetConfig
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeRoot = Join-Path $HOME ".local\share\dcode-project"
$binRoot = Join-Path $HOME ".local\bin"
$deepAgentsToolRoot = Join-Path $runtimeRoot "deepagents-tool"
$deepAgentsBinRoot = Join-Path $runtimeRoot "bin"
$launcherSource = Join-Path $repoRoot "scripts\dcode_project.py"
$deepAgentsHome = if ($env:DEEPAGENTS_HOME) {
    $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath(
        [Environment]::ExpandEnvironmentVariables($env:DEEPAGENTS_HOME)
    )
} else {
    Join-Path $HOME ".deepagents"
}
$directMcpConfig = Join-Path $deepAgentsHome ".mcp.json"
$pythonCommand = Get-Command py -ErrorAction SilentlyContinue

if (-not (Test-Path $launcherSource -PathType Leaf)) {
    throw "Missing launcher source: $launcherSource"
}
if (-not (Test-Path $CodexConfigPath -PathType Leaf)) {
    throw "Missing Codex config: $CodexConfigPath"
}
if (-not (Test-Path $SecretFile -PathType Leaf)) {
    throw "Missing secret file: $SecretFile"
}
if (Test-Path -LiteralPath $directMcpConfig -PathType Leaf) {
    throw "Direct DeepAgents MCP config detected: $directMcpConfig. Remove it before setup: Remove-Item -LiteralPath '$directMcpConfig' -Force"
}
if ([bool]$TuraExecutable -xor [bool]$TuraProviderConfig) {
    throw "Pass both -TuraExecutable and -TuraProviderConfig, or neither."
}
if ($TuraExecutable -and -not (Test-Path -LiteralPath $TuraExecutable -PathType Leaf)) {
    throw "Missing Tura executable: $TuraExecutable"
}
if ($TuraProviderConfig -and -not (Test-Path -LiteralPath $TuraProviderConfig -PathType Leaf)) {
    throw "Missing Tura provider config: $TuraProviderConfig"
}
if ($null -eq $pythonCommand) {
    throw "Python launcher `py` is required. Install Python 3.12 or newer."
}
$pythonVersion = (& $pythonCommand.Source -3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')").Trim()
if ($LASTEXITCODE -ne 0 -or [version]$pythonVersion -lt [version]"3.12") {
    throw "DeepAgents Code requires Python 3.12 or newer; detected $pythonVersion."
}

if (-not $SkipInstall) {
    if (-not (Test-Path $UvPath -PathType Leaf)) {
        $uvCommand = Get-Command uv -ErrorAction SilentlyContinue
        if ($null -eq $uvCommand) {
            throw "uv is required to install DeepAgents Code. Pass -UvPath or install uv."
        }
        $UvPath = $uvCommand.Source
    }
    $env:UV_TOOL_DIR = $deepAgentsToolRoot
    $env:UV_TOOL_BIN_DIR = $deepAgentsBinRoot
    & $UvPath tool install --reinstall `
        "deepagents-code==$DeepAgentsCodeVersion" `
        --with "langgraph-api==0.13.0" `
        --with "langgraph-runtime-inmem==0.33.0" `
        --with "uvicorn==0.51.0"
    if ($LASTEXITCODE -ne 0) {
        throw "DeepAgents Code installation failed."
    }
}

$dcodePath = Join-Path $deepAgentsBinRoot "dcode.exe"
if (-not (Test-Path $dcodePath -PathType Leaf)) {
    $dcodeCommand = Get-Command dcode -ErrorAction SilentlyContinue
    if ($null -ne $dcodeCommand) {
        $dcodePath = $dcodeCommand.Source
    }
}
if (-not (Test-Path $dcodePath -PathType Leaf)) {
    throw "DeepAgents Code executable not found after setup."
}
$versionOutput = (& $dcodePath --version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch "deepagents-code\s+$([regex]::Escape($DeepAgentsCodeVersion))") {
    throw "DeepAgents Code version mismatch. Expected $DeepAgentsCodeVersion; got: $versionOutput"
}

New-Item -ItemType Directory -Force -Path $runtimeRoot, $binRoot | Out-Null

$configPath = Join-Path $runtimeRoot "config.toml"
if ($ResetConfig -or -not (Test-Path $configPath -PathType Leaf)) {
    $escapeToml = {
        param([string]$Value)
        $Value.Replace("\", "\\").Replace('"', '\"')
    }
    $config = @"
[paths]
codex_config = "$( & $escapeToml $CodexConfigPath )"
secret_file = "$( & $escapeToml ((Resolve-Path $SecretFile).Path ) )"
secret_key = "$( & $escapeToml $SecretKey )"
"@
    Set-Content -NoNewline -Encoding utf8 $configPath $config
}

function Escape-TomlString {
    param([string]$Value)
    return $Value.Replace("\", "\\").Replace('"', '\"')
}

function Set-TomlSectionKey {
    param(
        [string]$Text,
        [string]$Section,
        [string]$Key,
        [string]$Value
    )
    $lines = [System.Collections.Generic.List[string]]::new()
    foreach ($line in ($Text -split "`r?`n")) { [void]$lines.Add($line) }
    $sectionIndex = -1
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match "^\[$([regex]::Escape($Section))\]\s*$") {
            $sectionIndex = $index
            break
        }
    }
    $serialized = "$Key = `"$Value`""
    if ($sectionIndex -lt 0) {
        while ($lines.Count -gt 0 -and [string]::IsNullOrWhiteSpace($lines[$lines.Count - 1])) {
            $lines.RemoveAt($lines.Count - 1)
        }
        [void]$lines.Add("")
        [void]$lines.Add("[$Section]")
        [void]$lines.Add($serialized)
        return ($lines -join "`r`n") + "`r`n"
    }
    $nextSection = $lines.Count
    for ($index = $sectionIndex + 1; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match '^\[') { $nextSection = $index; break }
    }
    for ($index = $sectionIndex + 1; $index -lt $nextSection; $index++) {
        if ($lines[$index] -match "^\s*$([regex]::Escape($Key))\s*=.*$") {
            $lines[$index] = $serialized
            return ($lines -join "`r`n")
        }
    }
    $lines.Insert($nextSection, $serialized)
    return ($lines -join "`r`n")
}

if ($TuraExecutable) {
    $helpText = (& $TuraExecutable --help 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) {
        throw "Tura capability probe failed: $TuraExecutable --help"
    }
    foreach ($capability in @("prompt", "--quiet", "--json", "--sandbox", "--session-id", "--agent-id", "-C", "-m")) {
        if ($helpText -notmatch [regex]::Escape($capability)) {
            throw "Tura CLI lacks required capability: $capability"
        }
    }
    $configText = Get-Content -LiteralPath $configPath -Raw
    $configText = Set-TomlSectionKey $configText "delegation" "default_executor" "tura"
    $configText = Set-TomlSectionKey $configText "paths" "tura_executable" (Escape-TomlString ((Resolve-Path $TuraExecutable).Path))
    $configText = Set-TomlSectionKey $configText "paths" "tura_provider_config" (Escape-TomlString ((Resolve-Path $TuraProviderConfig).Path))
    Set-Content -NoNewline -Encoding utf8 $configPath $configText
}
Remove-Item -LiteralPath (Join-Path $runtimeRoot "dcode_project.py") -Force -ErrorAction SilentlyContinue

$wrapper = @'
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$DcodeArgs
)

$ErrorActionPreference = "Stop"
$executor = $DcodeArgs | Where-Object { $_ -eq "--executor" -or $_ -like "--executor=*" }
if ($executor) {
    [Console]::Error.WriteLine("dcode-project selects DeepAgents; do not pass --executor. Use project-delegate for Tura.")
    exit 2
}
$repoRoot = (git rev-parse --show-toplevel 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
    [Console]::Error.WriteLine("dcode-project: run inside a Git repository.")
    exit 2
}

& py -3 (Join-Path $repoRoot "scripts\dcode_project.py") --executor deepagents @DcodeArgs
exit $LASTEXITCODE
'@
Set-Content -NoNewline -Encoding utf8 (Join-Path $binRoot "dcode-project.ps1") $wrapper

$cmd = @'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dcode-project.ps1" %*
'@
Set-Content -NoNewline -Encoding ascii (Join-Path $binRoot "dcode-project.cmd") $cmd

if ($TuraExecutable) {
    $delegateWrapper = @'
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$DelegateArgs
)

$ErrorActionPreference = "Stop"
$executor = $DelegateArgs | Where-Object { $_ -eq "--executor" -or $_ -like "--executor=*" }
if ($executor) {
    [Console]::Error.WriteLine("project-delegate selects Tura; do not pass --executor. Use dcode-project for DeepAgents.")
    exit 2
}
$repoRoot = (git rev-parse --show-toplevel 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or -not $repoRoot) {
    [Console]::Error.WriteLine("project-delegate: run inside a Git repository.")
    exit 2
}

& py -3 (Join-Path $repoRoot "scripts\dcode_project.py") --executor tura @DelegateArgs
exit $LASTEXITCODE
'@
    Set-Content -NoNewline -Encoding utf8 (Join-Path $binRoot "project-delegate.ps1") $delegateWrapper
    $delegateCmd = @'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0project-delegate.ps1" %*
'@
    Set-Content -NoNewline -Encoding ascii (Join-Path $binRoot "project-delegate.cmd") $delegateCmd
}

$doctorWrapper = @'
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$DcodeArgs
)

$ErrorActionPreference = "Stop"
$env:DEEPAGENTS_CODE_UI_CHARSET_MODE = "ascii"
$dcodePath = Join-Path $HOME ".local\share\dcode-project\bin\dcode.exe"
if (-not (Test-Path $dcodePath -PathType Leaf)) {
    [Console]::Error.WriteLine("dcode-doctor: isolated DeepAgents Code executable not found. Run setup_deepagents_runtime.ps1.")
    exit 2
}

& $dcodePath doctor @DcodeArgs
exit $LASTEXITCODE
'@
Set-Content -NoNewline -Encoding utf8 (Join-Path $binRoot "dcode-doctor.ps1") $doctorWrapper

$doctorCmd = @'
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dcode-doctor.ps1" %*
'@
Set-Content -NoNewline -Encoding ascii (Join-Path $binRoot "dcode-doctor.cmd") $doctorCmd

Write-Output "Installed dcode-project at $(Join-Path $binRoot 'dcode-project.cmd')"
if ($TuraExecutable) {
    Write-Output "Installed project-delegate at $(Join-Path $binRoot 'project-delegate.cmd')"
    Write-Output "Default external executor: tura"
} else {
    Write-Output "Tura migration: ./scripts/setup_deepagents_runtime.ps1 -SecretFile <local-env-file> -TuraExecutable <tura-executable> -TuraProviderConfig <tura-provider-config>"
}
Write-Output "Installed dcode-doctor at $(Join-Path $binRoot 'dcode-doctor.cmd')"
Write-Output "DeepAgents Code $DeepAgentsCodeVersion verified with Python $pythonVersion"
Write-Output "dcode-project uses the active Codex provider binding but runs DeepAgents without MCP projection."
