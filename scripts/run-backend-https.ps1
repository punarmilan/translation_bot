param(
  [string]$WhisperModel = "base"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root "backend"
$cert = Join-Path $root "certs\translation-bot.crt"
$key = Join-Path $root "certs\translation-bot.key"

if (!(Test-Path $cert) -or !(Test-Path $key)) {
  throw "Missing local certificates. Run: .\scripts\generate-local-certs.ps1 -LanIp YOUR_LAN_IP"
}

Set-Location $backend
$env:PIPER_EXECUTABLE = Join-Path $backend "piper\piper\piper.exe"
$env:WHISPER_MODEL = $WhisperModel
$env:HF_HUB_DISABLE_XET = "1"

.\.venv\Scripts\uvicorn.exe app.main:app `
  --reload `
  --host 0.0.0.0 `
  --port 8000 `
  --ssl-keyfile $key `
  --ssl-certfile $cert
