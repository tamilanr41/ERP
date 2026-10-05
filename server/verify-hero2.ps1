$ErrorActionPreference='Stop'
function hf($u){ try{ $r=Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 8 -ErrorAction Stop; return "GET $u => HTTP $($r.StatusCode)" }catch{ if($_.Exception.Response){ return "GET $u => HTTP $([int]$_.Exception.Response.StatusCode)" } else { return "GET $u => no-rsp" } } }
$r=Invoke-WebRequest -Uri 'http://localhost:5000/login' -UseBasicParsing -TimeoutSec 8
"login => HTTP $($r.StatusCode)"
"left-hero marker in LIVE body: $($r.Content -match 'lin-fullhero')"
"hero element present: $($r.Content -match 'hero-side')"
"login page has hospital svg text: $($r.Content -match '108ee6|952c66|small-hospital')"
hf '/admin'
hf '/api/health'
hf '/users'
"mongo 61405 listen: $([bool](Get-NetTCPConnection -LocalPort 61405 -State Listen -ErrorAction SilentlyContinue))"
