$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$targets = @(
  'backend/src',
  'frontend/src',
  '.env.example',
  'README.md',
  'package.json'
)

# U+FFFD replacement character
$replacementChar = [char]0xFFFD

Write-Host '[check] scanning for replacement characters ...'
$replacementHits = rg -n --fixed-strings "$replacementChar" $targets 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host '[fail] found replacement characters:'
  Write-Host $replacementHits
  exit 1
}
if ($LASTEXITCODE -gt 1) {
  throw 'rg failed while scanning replacement characters'
}

Write-Host '[check] scanning for suspicious mojibake patterns ...'
$mojibakePattern = '鍖|锟|馃|鈥|鈭|绠＄悊鍛'
$mojibakeHits = rg -n --pcre2 $mojibakePattern $targets 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host '[fail] found suspicious mojibake patterns:'
  Write-Host $mojibakeHits
  exit 1
}
if ($LASTEXITCODE -gt 1) {
  throw 'rg failed while scanning mojibake patterns'
}

Write-Host '[check] validating backend JavaScript syntax ...'
$backendJs = Get-ChildItem -Path 'backend/src' -Recurse -File -Filter '*.js'
foreach ($file in $backendJs) {
  node --check $file.FullName
  if ($LASTEXITCODE -ne 0) {
    throw ('node --check failed: ' + $file.FullName)
  }
}

Write-Host '[check] validating frontend TypeScript ...'
npx tsc -p frontend/tsconfig.json --noEmit
if ($LASTEXITCODE -ne 0) {
  throw 'frontend type check failed'
}

Write-Host '[ok] i18n + syntax checks passed.'
