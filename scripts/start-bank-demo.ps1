param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding
$projectDir = Split-Path -Parent $PSScriptRoot
$backendFile = Join-Path $projectDir 'backend\bank-server.js'
$entry = 'http://localhost:5091/bank-agent'
$healthUrl = 'http://127.0.0.1:5091/api/bank/health'
$logDir = Join-Path $projectDir '.cache\bank-agent'
$receiptPath = Join-Path $logDir 'launcher.json'
$ready = $false
$startupLock = $null

function Test-OwnBankProcess($processInfo) {
  if (-not $processInfo -or -not $processInfo.CommandLine) { return $false }
  $escapedPath = [regex]::Escape($backendFile)
  return $processInfo.Name -eq 'node.exe' -and $processInfo.CommandLine -match ('(?:^|\s)"?' + $escapedPath + '"?(?:\s|$)')
}
function Save-LaunchReceipt($processInfo) {
  @{ pid = [int]$processInfo.ProcessId; createdAt = $processInfo.CreationDate.ToUniversalTime().ToString('o'); backend = $backendFile } |
    ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding UTF8
}
function Install-ProjectDependencies($directory, $requiredFiles, $markerName) {
  $lockPath = Join-Path $directory 'package-lock.json'
  if (-not (Test-Path -LiteralPath $lockPath)) { throw '缺少 package-lock.json，请完整解压项目后重试。' }
  $marker = Join-Path $logDir $markerName
  $hashProvider = [Security.Cryptography.SHA256]::Create()
  $lockStream = [IO.File]::OpenRead($lockPath)
  try { $lockHash = [BitConverter]::ToString($hashProvider.ComputeHash($lockStream)).Replace('-', '') }
  finally { $lockStream.Dispose(); $hashProvider.Dispose() }
  $installedHash = if (Test-Path -LiteralPath $marker) { (Get-Content -LiteralPath $marker -Raw).Trim() } else { '' }
  $missing = @($requiredFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $directory $_)) })
  if ($missing.Count -gt 0 -or $installedHash -ne $lockHash) {
    Write-Host '正在安装/核对项目依赖，首次需要联网，请不要关闭窗口……'
    Push-Location $directory
    try { & npm.cmd ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。请保留窗口截图，检查网络后重试。' } }
    finally { Pop-Location }
    Set-Content -LiteralPath $marker -Value $lockHash -Encoding ASCII
  }
}
try {
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  try { $startupLock = [IO.File]::Open((Join-Path $logDir 'startup.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None) }
  catch { throw '另一个启动窗口正在安装或启动，请等待那个窗口完成，不要重复双击。' }
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $nodeCommand -or -not $npmCommand) { throw '找不到 Node.js。请先安装 Node.js 24：https://nodejs.org/en/download ，再重新双击启动按钮。' }
  $nodeVersion = & $nodeCommand.Source --version
  if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.') { throw '无法读取 Node.js 版本，请重新安装 Node.js 24 后重试。' }
  if ([int]$Matches[1] -lt 24) { throw '本版启动入口要求 Node.js 24 或更新版本，请更新后重试。' }
  $listener = @(Get-NetTCPConnection -LocalPort 5091 -State Listen -ErrorAction SilentlyContinue)
  if ($listener.Count -gt 0) {
    $processIds = @($listener | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($processIds.Count -ne 1) { throw '5091 端口状态不明确，未停止任何程序，请联系技术队友。' }
    $existing = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $processIds[0])
    if (-not (Test-OwnBankProcess $existing)) { throw '5091 端口被其他程序或另一份项目占用，未停止它，请联系技术队友。' }
    $status = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5
    if ($status.service -ne 'unitally-bank-sandbox') { throw '已有服务不是预期的银行演示，未作修改。' }
    Save-LaunchReceipt $existing
    $ready = $true
    Write-Host '网站已经在运行。如果刚更新过项目，请先点停止，再重新启动。'
  }
  if (-not $ready) {
    Write-Host '[1/3] 准备网页和后台依赖'
    Install-ProjectDependencies $projectDir @('node_modules\vite\bin\vite.js','node_modules\react\package.json','node_modules\@simplewebauthn\browser\package.json') 'frontend-lock.sha256'
    Install-ProjectDependencies (Join-Path $projectDir 'backend') @('node_modules\express\package.json','node_modules\@simplewebauthn\server\package.json') 'backend-lock.sha256'
    Write-Host '[2/3] 生成当前版本的网页'
    Push-Location $projectDir
    try { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw '网页生成失败，请保留错误窗口截图给技术队友。' } }
    finally { Pop-Location }
    Write-Host '[3/3] 启动本机银行演示'
    $bankProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList ('"' + $backendFile + '"') -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'server.stdout.log') -RedirectStandardError (Join-Path $logDir 'server.stderr.log')
    $started = Get-CimInstance Win32_Process -Filter ("ProcessId = " + $bankProcess.Id)
    if (-not (Test-OwnBankProcess $started)) { throw '无法核验刚启动的服务，请查看 .cache\bank-agent 日志。' }
    Save-LaunchReceipt $started
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      Start-Sleep -Milliseconds 300
      try { $status = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2; if ($status.service -eq 'unitally-bank-sandbox') { $ready = $true; break } } catch { }
      if ($bankProcess.HasExited) { throw '银行服务退出，请保留 .cache\bank-agent 的错误日志给技术队友。' }
    }
    if (-not $ready) { throw '服务没有按时就绪，请保留日志；没有停止其他程序。' }
  }
  Write-Host ("网站已就绪：" + $entry)
  Write-Host '这是本机模拟环境，不会进行真实银行交易。没有配置 AI 密钥也能使用离线案例和表单。'
  if (-not $NoBrowser) { Start-Process $entry }
} catch {
  Write-Host ("启动未完成：" + $_.Exception.Message) -ForegroundColor Red
  exit 1
} finally {
  if ($startupLock) { $startupLock.Dispose() }
}
