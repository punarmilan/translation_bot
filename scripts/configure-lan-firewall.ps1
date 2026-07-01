$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
$isAdministrator = $principal.IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)

if (!$isAdministrator) {
  throw "Run PowerShell as Administrator, then execute this script again."
}

$rules = @(
  @{
    Name = "TranslationBot-Frontend"
    DisplayName = "Translation Bot Frontend (5173)"
    Port = 5173
  },
  @{
    Name = "TranslationBot-Backend"
    DisplayName = "Translation Bot Backend (8000)"
    Port = 8000
  }
)

foreach ($rule in $rules) {
  $existing = Get-NetFirewallRule -Name $rule.Name -ErrorAction SilentlyContinue
  if ($existing) {
    Set-NetFirewallRule `
      -Name $rule.Name `
      -Enabled True `
      -Direction Inbound `
      -Action Allow `
      -Profile Private,Public

    $existing |
      Get-NetFirewallPortFilter |
      Set-NetFirewallPortFilter -Protocol TCP -LocalPort $rule.Port
  } else {
    New-NetFirewallRule `
      -Name $rule.Name `
      -DisplayName $rule.DisplayName `
      -Direction Inbound `
      -Action Allow `
      -Protocol TCP `
      -LocalPort $rule.Port `
      -Profile Private,Public | Out-Null
  }
}

Write-Host "LAN firewall access enabled for TCP ports 5173 and 8000."
Get-NetFirewallRule -Name "TranslationBot-*" |
  Select-Object DisplayName, Enabled, Direction, Action, Profile
