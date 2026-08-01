# Watchdog: keep SMART Print Agent running (crash → restart).
# Used by Scheduled Task / Start Menu "SMART Print Service".
$ErrorActionPreference = 'Continue'
$agentRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $agentRoot

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  Write-Error 'Node.js 20+ is required.'
  exit 1
}
$node = $nodeCmd.Source

$tsxCli = Join-Path $agentRoot 'node_modules\tsx\dist\cli.mjs'
if (-not (Test-Path $tsxCli)) {
  npm install --silent
}

$entry = Join-Path $agentRoot 'src\index.ts'
$backoff = 2

while ($true) {
  Write-Host "$(Get-Date -Format o) Starting Print Service..."
  $proc = Start-Process -FilePath $node -ArgumentList @("`"$tsxCli`"", "`"$entry`"") `
    -WorkingDirectory $agentRoot `
    -WindowStyle Hidden `
    -PassThru `
    -Wait
  $code = $proc.ExitCode
  Write-Host "$(Get-Date -Format o) Print Service exited code=$code — restarting in ${backoff}s"
  Start-Sleep -Seconds $backoff
  if ($backoff -lt 30) { $backoff = [Math]::Min(30, $backoff * 2) }
}
