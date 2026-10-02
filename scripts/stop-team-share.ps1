$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$receiptFile = Join-Path $projectDir '.cache\team-share\processes.json'
$expectedTunnel = Join-Path $projectDir '.cache\team-share\cloudflared.exe'
$expectedBackend = Join-Path $projectDir 'backend\team-share-server.js'
if (-not (Test-Path -LiteralPath $receiptFile)) { Write-Host 'No share receipt found; no process stopped.'; exit 0 }
$receipt = Get-Content -LiteralPath $receiptFile -Raw | ConvertFrom-Json
foreach ($entry in $receipt.processes) {
  $current = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$entry.pid)
  if (-not $current) { continue }
  $isTunnel = $current.ExecutablePath -eq $expectedTunnel -and $current.CommandLine.Contains('http://127.0.0.1:5093')
  $isBackend = $current.Name -eq 'node.exe' -and $current.CommandLine -match ('(?:^|\s)"?' + [regex]::Escape($expectedBackend) + '"?(?:\s|$)')
  if ((-not ($isTunnel -or $isBackend)) -or $current.CommandLine -ne $entry.commandLine -or $current.CreationDate.ToUniversalTime().ToString('o') -ne $entry.createdAt) { throw 'Process identity changed; refusing to stop it.' }
  Stop-Process -Id $current.ProcessId -ErrorAction Stop
}
Write-Host 'Team sharing stopped. Local preview and all ledger files were preserved.'
