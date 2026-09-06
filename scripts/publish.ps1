$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$DataDir = Join-Path $Root 'data'
$RepoPath = Join-Path $DataDir 'repo.json'
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path','Machine')
  $user = [Environment]::GetEnvironmentVariable('Path','User')
  $env:Path = "$machine;$user"
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw 'Git est absent et winget n est pas disponible.' }
  Write-Host 'Installation automatique de Git...' -ForegroundColor Yellow
  winget install Git.Git --accept-source-agreements --accept-package-agreements --silent
  Refresh-Path
}

Write-Host ''
Write-Host '=== Publication initiale GlucyZen sur GitHub ===' -ForegroundColor Cyan
Write-Host 'Cree d abord un depot GitHub VIDE, puis colle son URL ici.' -ForegroundColor Yellow
$remote = Read-Host 'URL du depot (https://github.com/owner/repo.git)'
$remote = $remote.Trim()
if ($remote -notmatch '^https://github\.com/([^/]+)/([^/]+?)(?:\.git)?$') { throw 'URL GitHub invalide.' }
$owner = $Matches[1]
$name = $Matches[2]
if (-not $remote.EndsWith('.git')) { $remote = "$remote.git" }

Push-Location $Root
try {
  if (-not (Test-Path (Join-Path $Root '.git'))) { git init | Out-Host }
  git config user.name 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { git config user.name 'GlucyZen local' }
  git config user.email 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { git config user.email 'glucyzen@local.invalid' }
  git add .
  git commit -m 'GlucyZen v0.5 - one-click setup and updater' 2>$null | Out-Host
  git branch -M main
  git remote remove origin 2>$null
  git remote add origin $remote
  Write-Host ''
  Write-Host 'GitHub peut ouvrir une fenetre de connexion lors du premier push.' -ForegroundColor Yellow
  git push -u origin main
  if ($LASTEXITCODE -ne 0) { throw 'Le push GitHub a echoue.' }

  [pscustomobject]@{ owner=$owner; name=$name; branch='main' } | ConvertTo-Json | Set-Content -Path $RepoPath -Encoding UTF8
  Write-Host ''
  Write-Host 'Depot publie. Mettre-a-jour.cmd est maintenant configure.' -ForegroundColor Green
} finally {
  Pop-Location
}
