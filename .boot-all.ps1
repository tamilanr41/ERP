$ErrorActionPreference = 'Continue'
$root = 'D:\TAMILAN\ERP'
$logs = Join-Path $root '.boot-logs'
New-Item -ItemType Directory -Force -Path ${logs} | Out-Null
$log  = Join-Path $logs 'boot.txt'
function TLog($m){ $m | Tee-Object -Append $log }
function Listen($port){ [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) }
function MonshInit{
  param([string]$nodelike)
  # use node + mongodb driver from root node_modules to run replSetInitiate
  $script = @'
import { MongoClient } from 'mongodb';
const url = 'mongodb://127.0.0.1:61405/?directConnection=true';
const c = new MongoClient(url, { serverSelectionTimeoutMS: 6000 });
try {
  await c.connect();
  const res = await c.db('admin').command({
    replSetInitiate: { _id: 'erptest', members: [{ _id: 0, host: '127.0.0.1:61405' }] }
  });
  console.log('initiate OK ' + JSON.stringify(res));
} catch (e) {
  console.log('initiate ERR ' + e.message);
} finally {
  await c.close();
}
'@
  $f = Join-Path ${logs} 'rs-init.mjs'
  Set-Content -Path $f -Value $script -Encoding UTF8
  & node $f 2>&1 | ForEach-Object{ "  > $_" | TLog }
}

"===== BOOT $([DateTime]::Now) =====" | TLog

"--- cached mongod binaries ---"
$cands = @('C:\Users\acer\.cache\mongodb-binaries\mongod-x64-win32-7.0.24.exe',
           'C:\Users\acer\.cache\mongodb-binaries\mongod-x64-win32-6.0.22.exe',
           'D:\New folder\.cache\mongodb-binaries\mongod-x64-win32-7.0.24.exe')
$mongod = $cands | Where-Object{ Test-Path $_ } | Select-Object -First 1
"mongod => $mongod" | TLog

# --- Mongo on 61405 ---
if (Listen 61405) {
  "mongo already listening 61405; skipping binary spawn" | TLog
} elseif ($mongod) {
  $dbp = Join-Path $root 'data\mongo-db'
  New-Item -ItemType Directory -Force -Path $dbp | Out-Null
  $p = Start-Process -FilePath $mongod -ArgumentList @('--port','61405','--replSet','erptest','--dbpath',$dbp,'--bind_ip','127.0.0.1') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'mongo.out') -RedirectStandardError (Join-Path $logs 'mongo.err')
  "mongo spawn pid=$($p.Id)" | TLog
  Start-Sleep 12
} else {
  "MONGOD BINARY NOT FOUND" | TLog
}
"mongo listen=61405 $(Listen 61405)" | TLog
"  RS status probe:" | TLog
& $mongod --version 2>&1 | Select-Object -First 1 | ForEach-Object{ "  $($_.Split("`n")[0])" | TLog }
# try initiate (idempotent-tolerant)
MonshInit
Start-Sleep 12

# --- API on 5000 ---
if (Listen 5000) {
  "api already on 5000" | TLog
} else {
  $clientDir = Join-Path $root 'server'
  $p = Start-Process -FilePath (Get-Command node).Source -ArgumentList @('src/index.js') -WorkingDirectory $clientDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'api.out') -RedirectStandardError (Join-Path $logs 'api.err')
  "api spawn pid=$($p.Id)" | TLog
  Start-Sleep 15
}
"api listen=5000 $(Listen 5000)" | TLog

# --- Vite on 5173 ---
if (Listen 5173) {
  "vite already on 5173" | TLog
} else {
  $cdir = Join-Path $root 'client'
  $p = Start-Process -FilePath (Get-Command node).Source -ArgumentList @('node_modules/vite/bin/vite.js') -WorkingDirectory $cdir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'vite.out') -RedirectStandardError (Join-Path $logs 'vite.err')
  "vite spawn pid=$($p.Id)" | TLog
  Start-Sleep 15
}
"vite listen=5173 $(Listen 5173)" | TLog

"--- PORTS FINAL ---"
"mongo(61405)=$(Listen 61405) api(5000)=$(Listen 5000) vite(5173)=$(Listen 5173)" | TLog

"--- web probes ---"
foreach($u in @('http://localhost:61405','http://localhost:5000/api/health','http://localhost:5173/','http://localhost:5173/api/health')){
  try {
    $r = Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 15
    "PROBE OK  $u -> $($r.StatusCode)" | TLog
  } catch {
    "PROBE FAIL $u -> $($_.Exception.Message)" | TLog
  }
}

"--- api.err tail (if any) ---"
if(Test-Path (Join-Path $logs 'api.err')){ (Get-Content (Join-Path $logs 'api.err')) | Where-Object{$_.Trim()} | Select-Object -Last 12 | ForEach-Object{ "  $_" | TLog } }
"===== DONE $([DateTime]::Now) =====" | TLog
