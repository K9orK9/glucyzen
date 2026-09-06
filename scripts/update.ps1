$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$DataDir = Join-Path $Root 'data'
$RepoPath = Join-Path $DataDir 'repo.json'
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

Write-Host ''
Write-Host '=== Mise a jour GlucyZen ===' -ForegroundColor Cyan
Write-Host 'La configuration Nightscout locale sera preservee.' -ForegroundColor DarkGray

$repo = $null
if (Test-Path $RepoPath) {
  try { $repo = Get-Content $RepoPath -Raw | ConvertFrom-Json } catch {}
}

if (-not $repo -or -not $repo.owner -or -not $repo.name) {
  Write-Host ''
  Write-Host 'Premiere mise a jour : indique le depot GitHub une seule fois.' -ForegroundColor Yellow
  $raw = Read-Host 'Depot GitHub (format owner/repo ou URL https://github.com/owner/repo)'
  $raw = $raw.Trim().TrimEnd('/')
  if ($raw -match '^https://github\.com/([^/]+)/([^/]+?)(?:\.git)?$') {
    $owner = $Matches[1]; $name = $Matches[2]
  } elseif ($raw -match '^([^/]+)/([^/]+)$') {
    $owner = $Matches[1]; $name = $Matches[2]
  } else {
    throw 'Format de depot GitHub invalide.'
  }
  $repo = [pscustomobject]@{ owner=$owner; name=$name; branch='main' }
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

  Write-Host 'Mise a jour terminee.' -ForegroundColor Green
  Write-Host 'Relance GlucyZen.cmd pour utiliser la nouvelle version.'
} finally {
  Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
