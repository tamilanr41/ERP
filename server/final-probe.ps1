$ErrorActionPreference='Stop'
$u='http://localhost:5000/admin'
try{
  $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 12
  "GET $u => HTTP $($r.StatusCode) | $($r.Headers['Content-Type']) | $([math]::Round($r.Content.Length/1KB)) KB"
  if($r.Content -match '<title>([^<]*)</title>'){ "title => $($matches[1])" }
}catch{
  if($_.Exception.Response){ "GET $u => HTTP $([int]$_.Exception.Response.StatusCode)" } else { "GET $u no-response: $($_.Exception.Message.Split([char]10)[0])" }
}
$h = try{ (Invoke-WebRequest -Uri 'http://localhost:5000/api/health' -UseBasicParsing -TimeoutSec 8).Content }catch{ 'down' }
"health => $h"
"mongo listen 61405: $([bool](Get-NetTCPConnection -LocalPort 61405 -State Listen -ErrorAction SilentlyContinue))"
"node procs on 5000: $((Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count)"
