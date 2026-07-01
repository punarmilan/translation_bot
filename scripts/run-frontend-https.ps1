$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root "frontend"
$cert = Join-Path $root "certs\translation-bot.crt"
$key = Join-Path $root "certs\translation-bot.key"

if (!(Test-Path $cert) -or !(Test-Path $key)) {
  throw "Missing local certificates. Run: .\scripts\generate-local-certs.ps1 -LanIp YOUR_LAN_IP"
}

Set-Location $frontend
$env:VITE_DEV_HTTPS = "1"
npm run dev:https
