$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$DataDir = Join-Path $Root 'data'
$ConfigPath = Join-Path $DataDir 'config.json'
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

Write-Host ''
Write-Host '=== Configuration GlucyZen ===' -ForegroundColor Cyan
Write-Host 'Cette operation est necessaire une seule fois.'
Write-Host 'Le token Nightscout sera chiffre avec Windows DPAPI et lie a votre compte Windows.' -ForegroundColor DarkGray
Write-Host ''

$defaultUrl = ''
if (Test-Path $ConfigPath) {
  try { $defaultUrl = (Get-Content $ConfigPath -Raw | ConvertFrom-Json).nightscoutUrl } catch {}
}

if ($defaultUrl) {
  $url = Read-Host "URL Nightscout [$defaultUrl]"
  if ([string]::IsNullOrWhiteSpace($url)) { $url = $defaultUrl }
} else {
  $url = Read-Host 'URL Nightscout (https://...)'
}
$url = $url.Trim().TrimEnd('/')
if ($url -notmatch '^https://') { throw 'L URL Nightscout doit commencer par https://.' }

$secureToken = Read-Host 'Token Nightscout READABLE (saisie masquee)' -AsSecureString
if ($secureToken.Length -eq 0) { throw 'Le token Nightscout ne peut pas etre vide.' }
$encryptedToken = ConvertFrom-SecureString -SecureString $secureToken

$config = [ordered]@{
  schemaVersion = 1
  nightscoutUrl = $url
  tokenDpapi = $encryptedToken
  configuredAt = (Get-Date).ToString('o')
}
$config | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding UTF8

Write-Host ''
Write-Host 'Configuration enregistree.' -ForegroundColor Green
Write-Host "Fichier local : $ConfigPath"
Write-Host 'Le token n est pas stocke en clair.' -ForegroundColor DarkGray
Write-Host ''
