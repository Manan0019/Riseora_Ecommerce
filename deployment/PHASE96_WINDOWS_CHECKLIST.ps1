# Safe Windows operator worksheet. Does not deploy without explicitly using -Execute.
param([switch]$Execute)
$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root
Write-Host "Riseora Phase 96 Windows Launch Worksheet"
Write-Host "Project: $root"
if (-not $Execute) {
  Write-Host "PLAN ONLY. Next run: npm run launch:plan; npm run launch:tests; npm run launch:doctor"
  Write-Host "To execute a confirmed cutover: npm run release:prepare -- --execute --confirm=RISEORA-LIVE"
  exit 0
}
& npm run launch:tests; if($LASTEXITCODE -ne 0){throw "Launch tests failed"}
& npm run launch:doctor; if($LASTEXITCODE -ne 0){throw "Launch doctor failed"}
& npm run launch:plan; if($LASTEXITCODE -ne 0){throw "Launch plan failed"}
Write-Host "Checks completed. Production deploy still requires explicit confirmation via the guarded release command."
