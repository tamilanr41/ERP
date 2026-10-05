$ErrorActionPreference='Stop'
$idx='D:\TAMILAN\ERP\client\dist\index.html'
$src='D:\TAMILAN\ERP\server\login-hero-side.html'
if(-not(Test-Path -LiteralPath $src)){ throw 'missing hero src' }
$style='<style>'+[IO.File]::ReadAllText($src,[Text.Text.Encoding]::UTF8)+'</style>'
$html=[IO.File]::ReadAllText($idx,[Text.Text.Encoding]::UTF8)
if($html -match 'id="linhero-side"'){ 'already present - reverted no-op' } 
elseif($html -match '</head>'){
  $html=[regex]::Replace($html,'</head>',($style+'</head>'),1)
  [IO.File]::WriteAllText($idx,$html,[Text.Text.Encoding]::UTF8)
  'INJECTED hero-side style into dist/index.html head'
}else{ throw 'no head' }