$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$DataDir = Join-Path $Root 'data'
$RepoPath = Join-Path $DataDir 'repo.json'
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

Write-Host ''
Write-Host '=== Mise a jour GlucyZen ===' -ForegroundColor Cyan
Write-Host 'La configuration Nightscout locale sera preservee.' -ForegroundColor DarkGray

# Depot officiel GlucyZen. Un repo.json local peut le surcharger pour un fork/test.
$repo = [pscustomobject]@{ owner='K9orK9'; name='glucyzen'; branch='main' }
if (Test-Path $RepoPath) {
  try {
    $saved = Get-Content $RepoPath -Raw | ConvertFrom-Json
    if ($saved.owner -and $saved.name) {
      $repo = [pscustomobject]@{
        owner = $saved.owner
        name = $saved.name
        branch = if ($saved.branch) { $saved.branch } else { 'main' }
      }
    }
  } catch {}
} else {
  $repo | ConvertTo-Json | Set-Content -Path $RepoPath -Encoding UTF8
}

$branch = if ($repo.branch) { $repo.branch } else { 'main' }
$archiveUrl = "https://github.com/$($repo.owner)/$($repo.name)/archive/refs/heads/$branch.zip"
$tempRoot = Join-Path $env:TEMP ("glucyzen-update-" + [guid]::NewGuid().ToString('N'))
$zipPath = Join-Path $tempRoot 'update.zip'
$extractDir = Join-Path $tempRoot 'extract'
New-Item -ItemType Directory -Force -Path $tempRoot,$extractDir | Out-Null

try {
  Write-Host "Telechargement de $($repo.owner)/$($repo.name) [$branch]..."
  Invoke-WebRequest -Uri $archiveUrl -OutFile $zipPath -UseBasicParsing
  Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
  $sourceDir = Get-ChildItem $extractDir -Directory | Select-Object -First 1
  if (-not $sourceDir) { throw 'Archive GitHub invalide.' }

  # Ne jamais ecraser la configuration locale ni le dossier .git eventuel.
  Get-ChildItem $sourceDir.FullName -Force | Where-Object { $_.Name -notin @('data','.git') } | ForEach-Object {
    $dest = Join-Path $Root $_.Name
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    Copy-Item $_.FullName $dest -Recurse -Force
  }

  Write-Host ''
  Write-Host 'Mise a jour terminee.' -ForegroundColor Green
  Write-Host 'Relance GlucyZen.cmd pour utiliser la nouvelle version.'
} finally {
  Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
