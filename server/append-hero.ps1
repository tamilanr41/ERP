$ErrorActionPreference='Stop'
$css = (Get-ChildItem -LiteralPath 'D:\TAMILAN\ERP\client\dist\assets' -Filter '*.css' | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
$src = 'D:\TAMILAN\ERP\client\dist\login-hero.css'
$data = [IO.File]::ReadAllText($src, [Text.Encoding]::UTF8)
[IO.File]::AppendAllText($css, "`n" + $data, [Text.Encoding]::UTF8)
"appended to: $css"
"size: $([math]::Round((Get-Item -LiteralPath $css).Length/1KB)) KB"
Remove-Item -LiteralPath $src -ErrorAction SilentlyContinue
"src cleaned; tail bytes ok = " + ((Get-Item -LiteralPath $css).Length -gt 50000)
