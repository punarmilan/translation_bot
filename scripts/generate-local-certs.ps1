param(
  [string]$LanIp = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $root "certs"
$keyPath = Join-Path $certDir "translation-bot.key"
$crtPath = Join-Path $certDir "translation-bot.crt"
$confPath = Join-Path $certDir "translation-bot-openssl.cnf"

New-Item -ItemType Directory -Force -Path $certDir | Out-Null

$opensslCommand = Get-Command openssl -ErrorAction SilentlyContinue
$openssl = if ($opensslCommand) {
  $opensslCommand.Source
} else {
  @(
    "C:\Program Files\Git\usr\bin\openssl.exe",
    "C:\Program Files\Git\mingw64\bin\openssl.exe",
    "C:\Program Files\OpenSSL-Win64\bin\openssl.exe"
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

if (!$openssl) {
  throw "OpenSSL was not found. Install Git for Windows or OpenSSL, then run this script again."
}

@"
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
x509_extensions = v3_req

[dn]
CN = translation-bot.local

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = translation-bot.local
IP.1 = 127.0.0.1
IP.2 = $LanIp
"@ | Set-Content -Path $confPath -Encoding ascii

& $openssl req `
  -x509 `
  -nodes `
  -days 365 `
  -newkey rsa:2048 `
  -keyout $keyPath `
  -out $crtPath `
  -config $confPath

Write-Host "Created:"
Write-Host "  $keyPath"
Write-Host "  $crtPath"
Write-Host ""
Write-Host "Use your LAN IP when opening from another device:"
Write-Host "  https://$LanIp`:5173"
