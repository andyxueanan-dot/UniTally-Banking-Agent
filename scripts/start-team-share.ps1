$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$shareDir = Join-Path $projectDir '.cache\team-share'
$tunnelBinary = Join-Path $shareDir 'cloudflared.exe'
$backendFile = Join-Path $projectDir 'backend\team-share-server.js'
$receiptFile = Join-Path $shareDir 'processes.json'
$launched = @()
try {
  if (-not (Test-Path -LiteralPath $tunnelBinary)) { throw 'Missing verified cloudflared binary. See docs/development/TEAM_SHARE.md.' }
  if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'dist-mobile\index.html'))) { throw 'Run npm run mobile:build first.' }
  if (Get-NetTCPConnection -LocalPort 5093 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 5093 is already occupied; no process was stopped.' }
  if (Test-Path -LiteralPath $receiptFile) {
    $old = Get-Content -LiteralPath $receiptFile -Raw | ConvertFrom-Json
    foreach ($entry in $old.processes) {
      $live = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$entry.pid)
      if ($live -and $live.CreationDate.ToUniversalTime().ToString('o') -eq $entry.createdAt) { throw 'A previous share process is still active. Stop it using stop-team-share.ps1 first.' }
    }
  }
  $tunnel = Start-Process -FilePath $tunnelBinary -ArgumentList @('tunnel','--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:5093') -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $shareDir 'tunnel.stdout.log') -RedirectStandardError (Join-Path $shareDir 'tunnel.stderr.log')
  $launched += $tunnel
  $publicOrigin = $null
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    Start-Sleep -Milliseconds 500
    $log = Get-Content -LiteralPath (Join-Path $shareDir 'tunnel.stderr.log') -Raw -ErrorAction SilentlyContinue
    if ($log -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $publicOrigin = $Matches[0]; break }
    if ($tunnel.HasExited) { throw 'Tunnel exited; inspect the local tunnel log.' }
  }
  if (-not $publicOrigin) { throw 'No temporary HTTPS address was assigned within 45 seconds.' }
  & node (Join-Path $PSScriptRoot 'init-team-share.cjs') $publicOrigin
  if ($LASTEXITCODE -ne 0) { throw 'Could not initialize share settings.' }
  $backend = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList ('"' + $backendFile + '"') -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $shareDir 'server.stdout.log') -RedirectStandardError (Join-Path $shareDir 'server.stderr.log')
  $launched += $backend
  $records = @($launched | ForEach-Object {
    $processInfo = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $_.Id)
    if (-not $processInfo) { throw 'A launched process exited unexpectedly.' }
    @{ pid = [int]$processInfo.ProcessId; createdAt = $processInfo.CreationDate.ToUniversalTime().ToString('o'); executable = $processInfo.ExecutablePath; commandLine = $processInfo.CommandLine }
  })
  @{ origin = $publicOrigin; processes = $records } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $receiptFile -Encoding UTF8
  Write-Host ('Share started. Verify before sending: ' + $publicOrigin)
  Write-Host ('Team password remains in local file: ' + (Join-Path $shareDir 'access.json'))
} catch {
  foreach ($processInfo in $launched) { if (-not $processInfo.HasExited) { $processInfo.Kill() } }
  Write-Error $_
  exit 1
}
