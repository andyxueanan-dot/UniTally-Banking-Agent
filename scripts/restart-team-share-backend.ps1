$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$shareDir = Join-Path $projectDir '.cache\team-share'
$backendFile = Join-Path $projectDir 'backend\team-share-server.js'
$receiptFile = Join-Path $shareDir 'processes.json'
$receipt = Get-Content -LiteralPath $receiptFile -Raw | ConvertFrom-Json
$entry = @($receipt.processes | Where-Object { $_.commandLine.Contains($backendFile) })
if ($entry.Count -ne 1) { throw 'Expected one backend receipt.' }
$entry = $entry[0]
$current = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$entry.pid)
if (-not $current -or $current.Name -ne 'node.exe' -or $current.CommandLine -ne $entry.commandLine -or $current.CreationDate.ToUniversalTime().ToString('o') -ne $entry.createdAt) { throw 'Backend identity mismatch; nothing stopped.' }
Stop-Process -Id $current.ProcessId
$started = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList ('"' + $backendFile + '"') -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $shareDir 'server.stdout.log') -RedirectStandardError (Join-Path $shareDir 'server.stderr.log')
$newProcess = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $started.Id)
if (-not $newProcess) { throw 'Restart failed; tunnel remains gated by unavailable backend.' }
$entry.pid = [int]$newProcess.ProcessId
$entry.createdAt = $newProcess.CreationDate.ToUniversalTime().ToString('o')
$entry.executable = $newProcess.ExecutablePath
$entry.commandLine = $newProcess.CommandLine
$receipt | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $receiptFile -Encoding UTF8
Write-Host 'Team gateway restarted; all team login cookies revoked. URL and bank ledger unchanged.'
