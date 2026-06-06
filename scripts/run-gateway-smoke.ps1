$ErrorActionPreference = "Stop"

function Resolve-RepoPath([string]$EnvVarName, [string]$SiblingName) {
  $configured = [Environment]::GetEnvironmentVariable($EnvVarName, "Process")
  if (-not $configured) { $configured = [Environment]::GetEnvironmentVariable($EnvVarName, "User") }
  if (-not $configured) { $configured = [Environment]::GetEnvironmentVariable($EnvVarName, "Machine") }

  $workspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  $candidates = @()
  if ($configured) { $candidates += $configured }
  $candidates += (Join-Path $workspaceRoot $SiblingName)

  foreach ($candidate in $candidates) {
    if (-not $candidate) { continue }
    if (-not (Test-Path $candidate)) { continue }
    $resolved = (Resolve-Path $candidate).Path
    if (Test-Path (Join-Path $resolved "package.json")) {
      return $resolved
    }
  }

  return $null
}

function Test-HttpEndpoint([string]$Url) {
  try {
    $res = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
    return ($res.StatusCode -ge 200 -and $res.StatusCode -lt 300)
  } catch {
    return $false
  }
}

function Wait-HttpEndpoint([string]$Url, [int]$Attempts = 30, [int]$DelaySeconds = 2) {
  for ($i = 0; $i -lt $Attempts; $i++) {
    if (Test-HttpEndpoint $Url) {
      return $true
    }
    Start-Sleep -Seconds $DelaySeconds
  }

  return $false
}

function Ensure-LocalGatewayStack([string]$BaseUrl) {
  $workspaceRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  $infraRepo = Resolve-RepoPath -EnvVarName "CIMA_INFRA_PATH" -SiblingName "crm-infra"
  $gatewayHealthy = Test-HttpEndpoint "$BaseUrl/health"

  if ($gatewayHealthy) {
    return
  }

  if (-not $infraRepo) {
    throw "El stack local no esta saludable y no se encontro crm-infra. Configure CIMA_INFRA_PATH o cree el repo hermano crm-infra."
  }

  $startScript = Join-Path $infraRepo "start-local.ps1"
  if (-not (Test-Path $startScript)) {
    throw "El stack local no esta saludable y no existe $startScript."
  }

  Write-Host "Stack local incompleto. Ejecutando bootstrap de crm-infra..." -ForegroundColor Yellow
  Push-Location $infraRepo
  try {
    powershell -NoProfile -ExecutionPolicy Bypass -File $startScript
    if ($LASTEXITCODE -ne 0) {
      throw "crm-infra/start-local.ps1 fallo con codigo $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  $requiredEndpoints = @("$BaseUrl/health")

  foreach ($endpoint in $requiredEndpoints) {
    if (-not (Wait-HttpEndpoint $endpoint 30 2)) {
      throw "El endpoint requerido no quedo saludable tras el bootstrap: $endpoint"
    }
  }
}

function Invoke-InRepo([string]$RepoPath, [scriptblock]$Action) {
  if (-not $RepoPath) { return }

  Push-Location $RepoPath
  try {
    & $Action
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with code $LASTEXITCODE in $RepoPath"
    }
  } finally {
    Pop-Location
  }
}

$stamp = Get-Date -Format "yyyyMMddHHmmss"
$loginIp = "198.51.100.$(Get-Random -Minimum 10 -Maximum 240)"
$baseUrl = if ($env:COLLAB_GATEWAY_BASE_URL) { $env:COLLAB_GATEWAY_BASE_URL } else { "http://localhost:28080" }
$workerEmail = "ana.martinez@cima.dev"
$clientEmail = "contacto@restauranteelbuensabor.com"
$workerPassword = "Demo123!"
$clientPassword = "Demo123!"
$authRepo = Resolve-RepoPath -EnvVarName "CIMA_AUTH_PATH" -SiblingName "crm-auth"

Ensure-LocalGatewayStack $baseUrl

if ($authRepo) {
  Invoke-InRepo $authRepo { pnpm db:seed }
}

hurl --test `
  --variable base_url=$baseUrl `
  --variable LOGIN_IP=$loginIp `
  --variable TEST_SUFFIX=$stamp `
  --variable WORKER_EMAIL=$workerEmail `
  --variable WORKER_PASSWORD=$workerPassword `
  --variable CLIENT_EMAIL=$clientEmail `
  --variable CLIENT_PASSWORD=$clientPassword `
  tests/01_gateway_rbac_collab.hurl

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
