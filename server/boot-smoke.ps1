$ErrorActionPreference = 'Stop'
$d = 'D:\TAMILAN\ERP\server'
$aerr = Join-Path $env:TEMP 'zapi5_err.log'
$aout = Join-Path $env:TEMP 'zapi5_out.log'
Remove-Item -LiteralPath $aerr, $aout -ErrorAction SilentlyContinue

Get-Process node -ErrorAction SilentlyContinue | ForEach-Object {
  try {
    $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine
    if ($cl -match 'TAMILAN') { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
  } catch {}
}

$api = Start-Process node -ArgumentList 'src/index.js' -WorkingDirectory $d `
  -RedirectStandardOutput $aout -RedirectStandardError $aerr -PassThru -WindowStyle Hidden

$up = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    if (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue) { $up = $true; break }
  } catch {}
}

if ($up) {
  "LISTENING pid=$($api.Id)"
  foreach ($u in @('/api/health', '/api/opd/visits', '/api/lab/tests')) {
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:5000$u" -UseBasicParsing -TimeoutSec 8 -ErrorAction Stop
      "GET $u => HTTP $($r.StatusCode)"
    } catch {
      if ($_.Exception.Response) { "GET $u => HTTP $([int]$_.Exception.Response.StatusCode)" }
      else { "GET $u => no-response" }
    }
  }
  "=== static checks ==="
  foreach ($u in @('/index.html')) {
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:5000$u" -UseBasicParsing -TimeoutSec 8 -ErrorAction Stop
      "GET $u => HTTP $($r.StatusCode) | $($r.Headers['Content-Type'])"
    } catch {
      if ($_.Exception.Response) { "GET $u => HTTP $([int]$_.Exception.Response.StatusCode)" }
      else { "GET $u => no-response" }
    }
  }
} else {
  "NOT LISTENING - err tail:"
  Get-Content -LiteralPath $aerr -Tail 12 -ErrorAction SilentlyContinue
}
