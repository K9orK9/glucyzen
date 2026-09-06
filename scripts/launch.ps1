$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$DataDir = Join-Path $Root 'data'
$ConfigPath = Join-Path $DataDir 'config.json'
$ConfigureScript = Join-Path $PSScriptRoot 'configure.ps1'
$HealthUrl = 'http://localhost:8787/api/health'
$AppUrl = 'http://localhost:8787'

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path','Machine')
  $user = [Environment]::GetEnvironmentVariable('Path','User')
  $env:Path = "$machine;$user"
}

function Ensure-Node {
  if (Get-Command node -ErrorAction SilentlyContinue) { return }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw 'Node.js est absent et winget n est pas disponible. Installe Node.js LTS puis relance GlucyZen.'
  }
  Write-Host 'Node.js absent : installation automatique de Node.js LTS...' -ForegroundColor Yellow
  winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements --silent
  Refresh-Path
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js vient d etre installe. Ferme puis relance GlucyZen.cmd.'
  }
}

function Read-Config {
  if (-not (Test-Path $ConfigPath)) {
    & $ConfigureScript
  }
  if (-not (Test-Path $ConfigPath)) { throw 'Configuration GlucyZen introuvable.' }
  $cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
  if (-not $cfg.nightscoutUrl -or -not $cfg.tokenDpapi) { throw 'Configuration incomplete. Lance Configurer.cmd.' }
  return $cfg
}

function Reveal-Token([string]$encrypted) {
  $secure = ConvertTo-SecureString $encrypted
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

Write-Host ''
Write-Host '=== GlucyZen ===' -ForegroundColor Cyan
Ensure-Node

# Si une instance GlucyZen repond deja, ouvrir simplement le dashboard.
try {
  $existing = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 1
  if ($existing.ok) {
    Write-Host "GlucyZen est deja lance (v$($existing.version))." -ForegroundColor Green
    Start-Process $AppUrl
    exit 0
  }
} catch {}

$cfg = Read-Config
$token = Reveal-Token $cfg.tokenDpapi
$env:NIGHTSCOUT_URL = $cfg.nightscoutUrl
$env:NIGHTSCOUT_TOKEN = $token
$env:PORT = '8787'

Write-Host 'Demarrage en LIVE read-only...' -ForegroundColor Green
$nodeProcess = Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory $Root -PassThru -WindowStyle Minimized

$ready = $false
for ($i=0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 350
  try {
    $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 1
    if ($health.ok) { $ready = $true; break }
  } catch {}
  if ($nodeProcess.HasExited) { break }
}

# Effacer la copie PowerShell du token des que le processus enfant l a heritee.
$token = $null
$env:NIGHTSCOUT_TOKEN = $null
[GC]::Collect()

if (-not $ready) {
  throw 'Le serveur GlucyZen n a pas demarre correctement. Verifie qu aucun autre programme n utilise le port 8787.'
}

Write-Host "GlucyZen v$($health.version) est pret." -ForegroundColor Green
Start-Process $AppUrl
