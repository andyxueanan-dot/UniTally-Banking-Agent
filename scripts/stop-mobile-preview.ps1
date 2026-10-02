$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$repoDir = Split-Path -Parent $PSScriptRoot
$configFile = Join-Path $repoDir 'vite.mobile.config.ts'
$viteFile = Join-Path $repoDir 'node_modules\vite\bin\vite.js'
try {
  $listeners = @(Get-NetTCPConnection -LocalPort 8091 -State Listen -ErrorAction SilentlyContinue)
  foreach ($processId in @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)) {
    $processInfo = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $processId)
    if ($processInfo.Name -ne 'node.exe' -or $processInfo.CommandLine -notlike ('*' + $configFile + '*') -or $processInfo.CommandLine -notlike ('*' + $viteFile + '*')) { throw '8091不是当前项目的预览进程，未停止它。' }
    Stop-Process -Id $processId -ErrorAction Stop
  }
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'stop-bank-demo.ps1')
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host '手机版预览已停止，模拟账户数据保留。'
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
