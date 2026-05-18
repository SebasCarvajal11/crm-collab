$ErrorActionPreference = "Stop"

$stamp = Get-Date -Format "yyyyMMddHHmmss"
$loginIp = "198.51.100.$(Get-Random -Minimum 10 -Maximum 240)"
$workerEmail = "ana.martinez@cima.dev"
$clientEmail = "contacto@restauranteelbuensabor.com"
$workerPassword = "Demo123!"
$clientPassword = "Demo123!"

hurl --test `
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
