param(
  [string]$BaseUrl = "http://localhost:3000",
  [bool]$DryRun = $false,
  [bool]$ContinueOnError = $true,
  [string]$ApiKey = "",
  [string]$LogDir = "logs\\automation"
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $LogDir ("legacy-core-" + $timestamp + ".json")

$uri = ($BaseUrl.TrimEnd('/')) + "/api/master/jobs/legacy-core"
$headers = @{
  "Content-Type" = "application/json"
}

if ($ApiKey -ne "") {
  $headers["x-api-key"] = $ApiKey
}

$body = @{
  dryRun = $DryRun
  continueOnError = $ContinueOnError
} | ConvertTo-Json

try {
  $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $body
  $response | ConvertTo-Json -Depth 10 | Out-File -FilePath $logFile -Encoding utf8

  if ($response.ok -eq $true) {
    Write-Host "Legacy core job completed successfully. Log: $logFile"
    exit 0
  }

  Write-Host "Legacy core job completed with partial failures. Log: $logFile"
  exit 2
}
catch {
  $err = @{
    ok = $false
    timestamp = (Get-Date).ToString("o")
    error = $_.Exception.Message
    uri = $uri
  }
  $err | ConvertTo-Json -Depth 5 | Out-File -FilePath $logFile -Encoding utf8
  Write-Host "Legacy core job failed. Log: $logFile"
  exit 1
}
