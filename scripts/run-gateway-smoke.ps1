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
$baseUrl = if ($env:COLLAB_GATEWAY_BASE_URL) { $env:COLLAB_GATEWAY_BASE_URL } else { "http://localhost:18080" }
$workerEmail = "ana.martinez@cima.dev"
$clientEmail = "contacto@restauranteelbuensabor.com"
$workerPassword = "Demo123!"
$clientPassword = "Demo123!"
$authRepo = Resolve-RepoPath -EnvVarName "CIMA_AUTH_PATH" -SiblingName "crm-auth"

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
