$ErrorActionPreference = 'Stop'
$body = '{"username":"superadmin","password":"Admin@123"}'
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:5000/api/auth/login' -Method Post -Body $body -ContentType 'application/json' -UseBasicParsing -TimeoutSec 10
    "LOGIN => HTTP $($r.StatusCode)"
    $j = $r.Content | ConvertFrom-Json
    "msg    => $($j.message)"
    "user   => $($j.data.user.username) / $($j.data.user.roleCode) / $($j.data.user.firstName)"
    "access => $([bool]$j.data.accessToken)  refresh => $([bool]$j.data.refreshToken)"
} catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'no-response' }
    "LOGIN => HTTP $code"
    if ($_.Exception.Response) {
        $sr = $_.Exception.Response.GetResponseStream()
        $rd = New-Object IO.StreamReader($sr)
        "body  => $($rd.ReadToEnd())"
    }
}
