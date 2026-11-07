# Inkwell Daily installer for Windows.
#
#   powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/randyellis-wealthberry/inkwell-daily/main/scripts/install.ps1 | iex"
#
# Options after the script block are not supported through `iex`; set the
# environment variables instead:
#   $env:INKWELL_HOUR = "7"
#   $env:INKWELL_NO_OPEN = "1"
#
# Node.js 20 or later is required. If it's missing and winget is available,
# the LTS release is installed first.

$ErrorActionPreference = "Stop"

$Repo = if ($env:INKWELL_REPO) { $env:INKWELL_REPO } else { "randyellis-wealthberry/inkwell-daily" }
$Version = $env:INKWELL_VERSION
$Hour = if ($env:INKWELL_HOUR) { [int]$env:INKWELL_HOUR } else { 5 }
$NoOpen = $env:INKWELL_NO_OPEN -eq "1"
$NoSchedule = $env:INKWELL_NO_SCHEDULE -eq "1"

function Say($text) { Write-Host $text }
function Fail($text) { Write-Error "inkwell-daily: $text"; exit 1 }

if ($Hour -lt 0 -or $Hour -gt 23) { Fail "INKWELL_HOUR must be 0-23" }

function Get-NodeMajor {
  try { return [int](& node -p "process.versions.node.split('.')[0]") } catch { return 0 }
}

if ((Get-NodeMajor) -lt 20) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Say "Node.js 20 or later is needed; installing Node.js LTS with winget..."
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  }
  if ((Get-NodeMajor) -lt 20) {
    Fail "Node.js 20 or later is required. Install it from https://nodejs.org, then run this again."
  }
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Fail "npm was not found beside node.exe. Install the full Node.js distribution, then run this again."
}

if (-not $Version) {
  try {
    $Release = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/latest" -Headers @{ "User-Agent" = "inkwell-daily-installer" }
    $Version = $Release.tag_name
  } catch {}
}

if ($Version) {
  $Tag = if ($Version.StartsWith("v")) { $Version } else { "v$Version" }
  $Source = "https://github.com/$Repo/archive/refs/tags/$Tag.tar.gz"
  Say "Installing Inkwell Daily $Tag..."
} else {
  $Source = "https://github.com/$Repo/archive/refs/heads/main.tar.gz"
  Say "Installing Inkwell Daily from main..."
}

& npm install -g $Source
if ($LASTEXITCODE -ne 0) { Fail "npm install failed." }

if (-not (Get-Command inkwell-daily -ErrorAction SilentlyContinue)) {
  $Prefix = (& npm config get prefix).Trim()
  $env:Path = "$Prefix;$env:Path"
}

if ($NoSchedule -eq $false) {
  & inkwell-daily install --hour $Hour
  if ($LASTEXITCODE -ne 0) { Write-Warning "The morning schedule was not set; run: inkwell-daily install" }
}

Say "Setting yesterday's edition..."
& inkwell-daily build
if ($LASTEXITCODE -eq 0 -and -not $NoOpen) { & inkwell-daily open }

Say ""
Say "Inkwell Daily is installed. Read it with: inkwell-daily open"
Say "Change the morning hour with: inkwell-daily install --hour 7"
