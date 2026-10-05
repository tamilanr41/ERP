$ErrorActionPreference='Stop'
$bundle = (Get-ChildItem -LiteralPath 'D:\TAMILAN\ERP\client\dist\assets' -Filter '*.css' | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
$frag   = 'D:\TAMILAN\ERP\client\dist\login-hero.css'
$data   = [IO.File]::ReadAllText($frag, [Text.Encoding]::UTF8)
[IO.File]::AppendAllText($bundle, "`n" + $data, [Text.Encoding]::UTF8)
"appended hero to -> $bundle"
"len now KB: $([math]::Round((Get-Item -LiteralPath $bundle).Length/1KB))"
Remove-Item -LiteralPath $frag -ErrorAction SilentlyContinue
"frag cleaned"
