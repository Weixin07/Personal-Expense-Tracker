<#
.SYNOPSIS
Activates the vm-1 Node environment in the current shell.

.DESCRIPTION
Puts the workspace's node_modules/.bin at the front of PATH, selects the Node
version named in .nvmrc when fnm or nvm is installed, and prefixes the prompt
with (vm-1). Warns when the running Node does not match .nvmrc.

Dot-source it (. .\vm-1\Activate.ps1); run as a plain script it leaves the
calling shell unchanged. Disable-Vm1 restores the previous PATH and prompt.
#>

if ($env:VM1_ROOT) { return }

$vm1Root = Split-Path -Parent $PSScriptRoot
$vm1Bin = Join-Path $vm1Root 'node_modules\.bin'
$vm1Nvmrc = Join-Path $vm1Root '.nvmrc'

$global:Vm1OriginalPath = $env:PATH

$vm1Pinned = $null
if (Test-Path $vm1Nvmrc) {
    $vm1Pinned = (Get-Content -Raw $vm1Nvmrc).Trim().TrimStart('v')
}

if ($vm1Pinned) {
    if (Get-Command fnm -ErrorAction SilentlyContinue) {
        fnm use --install-if-missing $vm1Pinned 2>&1 | Out-Null
        fnm env --shell power-shell | Out-String | Invoke-Expression
    }
    elseif (Get-Command nvm -ErrorAction SilentlyContinue) {
        nvm use $vm1Pinned 2>&1 | Out-Null
    }
}

$env:PATH = "$vm1Bin;$env:PATH"
$env:VM1_ROOT = $vm1Root

if ((Test-Path Function:\prompt) -and -not (Test-Path Function:\Vm1OriginalPrompt)) {
    Copy-Item Function:\prompt Function:\global:Vm1OriginalPrompt
}
function global:prompt { '(vm-1) ' + (Vm1OriginalPrompt) }

function global:Disable-Vm1 {
    if ($global:Vm1OriginalPath) {
        $env:PATH = $global:Vm1OriginalPath
        Remove-Variable -Name Vm1OriginalPath -Scope Global
    }
    if (Test-Path Function:\Vm1OriginalPrompt) {
        Copy-Item Function:\Vm1OriginalPrompt Function:\global:prompt
        Remove-Item Function:\Vm1OriginalPrompt
    }
    Remove-Item Env:\VM1_ROOT -ErrorAction SilentlyContinue
}

$vm1Node = Get-Command node -ErrorAction SilentlyContinue
if (-not $vm1Node) {
    Write-Warning 'vm-1: no node on PATH.'
    return
}

$vm1Actual = (& node --version).Trim().TrimStart('v')
if ($vm1Pinned -and $vm1Actual -ne $vm1Pinned) {
    Write-Warning "vm-1: node $vm1Actual is active, .nvmrc pins $vm1Pinned. Install a version manager (winget install Schniz.fnm) to switch automatically."
}
else {
    Write-Host "vm-1 active - node $vm1Actual" -ForegroundColor DarkGray
}
