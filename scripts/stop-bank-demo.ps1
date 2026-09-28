$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$projectDir = Split-Path -Parent $PSScriptRoot
$backendFile = Join-Path $projectDir 'backend\bank-server.js'
$receiptPath = Join-Path $projectDir '.cache\bank-agent\launcher.json'
try {
  if (-not (Test-Path -LiteralPath $receiptPath)) { Write-Host '没有找到本项目的启动记录。未停止任何程序；若网站仍在运行，请联系技术队友。'; exit 0 }
  $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
  if ($receipt.backend -ne $backendFile -or $receipt.pid -isnot [int] -or $receipt.pid -le 0) { throw '启动记录不符合本项目，未停止任何程序。' }
  $current = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $receipt.pid)
  if (-not $current) { Write-Host '银行演示已经停止。'; exit 0 }
  $pattern = '(?:^|\s)"?' + [regex]::Escape($backendFile) + '"?(?:\s|$)'
  if ($current.Name -ne 'node.exe' -or $current.CommandLine -notmatch $pattern -or $current.CreationDate.ToUniversalTime().ToString('o') -ne $receipt.createdAt) {
    throw '进程身份与启动时不一致，未停止它，请联系技术队友。'
  }
  Stop-Process -Id $receipt.pid -ErrorAction Stop
  Write-Host '本项目的银行演示已停止。账户记录保留，没有关闭其他项目。'
} catch {
  Write-Host ('无法安全停止：' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}
