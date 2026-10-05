$b='D:\TAMILAN\ERP'
"===vite present?==="
Test-Path -LiteralPath "$b\client\node_modules\.bin\vite.cmd"
Test-Path -LiteralPath "$b\client\node_modules\vite\bin\vite.js"
"===client package.json==="
Get-Content -LiteralPath "$b\client\package.json" -Raw
"===dashboard route registrations (server/routes/*.js)==="
$files = Get-ChildItem -LiteralPath "$b\server\src\routes" -Filter '*.js'
Select-String -LiteralPath $files.FullName -Pattern "dashboard" -ErrorAction SilentlyContinue | ForEach-Object { "  " + (Split-Path $_.Path -Leaf) + ":" + $_.LineNumber + ": " + $_.Line.Trim() }
"===controllers mentioning dashboard==="
$cf = Get-ChildItem -LiteralPath "$b\server\src\controllers" -Filter '*.js'
Select-String -LiteralPath $cf.FullName -Pattern "export const .*dashboard.*Controller|router\.(get|post).*dashboard" -ErrorAction SilentlyContinue | ForEach-Object { "  " + (Split-Path $_.Path -Leaf) + ":" + $_.LineNumber + ": " + $_.Line.Trim() }
"===dist index.html line count==="
(Get-Content -LiteralPath "$b\client\dist\index.html" | Measure-Object -Line).Lines
"===is there a src/pages/Dashboards dir or single Dashboard.jsx==="
Get-ChildItem -LiteralPath "$b\client\src\pages" -Filter '*.jsx' | ForEach-Object { $_.Name }
