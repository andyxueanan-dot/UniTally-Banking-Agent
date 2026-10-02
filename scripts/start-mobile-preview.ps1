param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$repoDir = Split-Path -Parent $PSScriptRoot
$configFile = Join-Path $repoDir 'vite.mobile.config.ts'
$viteFile = Join-Path $repoDir 'node_modules\vite\bin\vite.js'
$logs = Join-Path $repoDir '.cache\mobile'
try {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-bank-demo.ps1') -NoBrowser
  if ($LASTEXITCODE -ne 0) { throw '银行后台尚未就绪，请先处理上方提示。' }
  $listener = @(Get-NetTCPConnection -LocalPort 8091 -State Listen -ErrorAction SilentlyContinue)
  if ($listener.Count) {
    $existing = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $listener[0].OwningProcess)
    if (-not $existing -or $existing.CommandLine -notlike ('*' + $configFile + '*') -or $existing.CommandLine -notlike ('*' + $viteFile + '*')) { throw '8091被其他服务占用，没有结束任何程序。' }
  } else {
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    Push-Location $repoDir
    try { & npm.cmd run mobile:build; if ($LASTEXITCODE -ne 0) { throw '手机版构建失败，请保留错误提示。' } }
    finally { Pop-Location }
    $nodePath = (Get-Command node.exe).Source
    $preview = Start-Process -FilePath $nodePath -ArgumentList ('"' + $viteFile + '" preview --config "' + $configFile + '"') -WorkingDirectory $repoDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'preview.log') -RedirectStandardError (Join-Path $logs 'preview-error.log')
    $ready = $false
    for ($attempt=0; $attempt -lt 30; $attempt++) {
      Start-Sleep -Milliseconds 300
      & $nodePath (Join-Path $PSScriptRoot 'probe-mobile-preview.mjs')
      if ($LASTEXITCODE -eq 0) { $ready=$true; break }
      if ($preview.HasExited) { throw '手机版预览服务提前退出，请检查 .cache/mobile 日志。' }
    }
    if (-not $ready) { throw '预览未就绪，请检查日志。' }
  }
  Write-Host '手机版已就绪：http://localhost:8091 （电脑内预览，不是公网地址或安装包）'
  if (-not $NoBrowser) { Start-Process 'http://localhost:8091' }
} catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
