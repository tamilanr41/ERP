$ErrorActionPreference='Stop'
$idx='D:\TAMILAN\ERP\client\dist\index.html'
$src='D:\TAMILAN\ERP\client\dist\hero-fullside.css'
$style='<style id="loginHero">' + [IO.File]::ReadAllText($src, [Text.Encoding]::UTF8) + '</style>'
$html=[IO.File]::ReadAllText($idx, [Text.Encoding]::UTF8)
if($html -match 'id="loginHero"'){ 'already injected' } elseif($html -match '</head>'){
  $html=$html -replace '</head>', ($style + '</head>')
  [IO.File]::WriteAllText($idx, $html, [Text.Encoding]::UTF8)
  'injected into head'
} else { 'head tag not found' }
