$ErrorActionPreference = 'Stop'
$d = 'D:\TAMILAN\ERP\server'
$aerr = Join-Path $env:TEMP 'zboot2_err.log'
$aout = Join-Path $env:TEMP 'zboot2_out.log'
Remove-Item -LiteralPath $aerr, $aout -ErrorAction SilentlyContinue
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$api = Start-Process node -ArgumentList 'src/index.js' -WorkingDirectory $d -RedirectStandardOutput $aout -RedirectStandardError $aerr -PassThru -WindowStyle Hidden
$up = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  if (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue) { $up = $true; break }
}
if (-not $up) {
  Add-Content -LiteralPath (Join-Path $env:TEMP 'zboot2_res.txt') -Value "NOT LISTENING"
  Get-Content -LiteralPath $aerr -Tail 14 -ErrorAction SilentlyContinue | Add-Content -LiteralPath (Join-Path $env:TEMP 'zboot2_res.txt')
  Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
  exit 1
}
Add-Content -LiteralPath (Join-Path $env:TEMP 'zboot2_res.txt') -Value "LISTENING pid=$($api.Id)"
foreach ($u in @('/', '/index.html', '/api/health')) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:5000$u" -UseBasicParsing -TimeoutSec 8 -ErrorAction Stop
    $line = "GET $u => HTTP $($r.StatusCode) | $($r.Headers['Content-Type'])"
    Add-Content -LiteralPath (Join-Path $env:TEMP 'zboot2_res.txt') -Value $line
  } catch {
    if ($_.Exception.Response) {
      $line = "GET $u => HTTP $([int]$_.Exception.Response.StatusCode)"
    } else {
      $line = "GET $u => no-response"
    }
    Add-Content -LiteralPath (Join-Path $env:TEMP 'zboot2_res.txt') -Value $line
  }
}
Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue
