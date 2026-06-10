# ============================================================
# 08 — Solicitudes de Cambio
# ============================================================
# Prueba los endpoints de change requests:
# - Client crea solicitud menor
# - Client crea solicitud formal
# - Admin resuelve solicitud menor
# - Admin aprueba solicitud formal
# - Worker NO puede crear solicitud (403)
# - Lista historial de cambios formales
# ============================================================

# Login
POST {{base_url}}/api/v1/auth/login
Content-Type: application/json
{
  "email": "admin@cima.dev",
  "password": "Admin123!"
}
HTTP 200
[Captures]
admin_token: jsonpath "$.data.access_token"

POST {{base_url}}/api/v1/auth/login
Content-Type: application/json
{
  "email": "ana.martinez@cima.dev",
  "password": "Demo123!"
}
HTTP 200
[Captures]
worker_token: jsonpath "$.data.access_token"
worker_subject: jsonpath "$.data.user.id"

POST {{base_url}}/api/v1/auth/login
Content-Type: application/json
{
  "email": "contacto@restauranteelbuensabor.com",
  "password": "Demo123!"
}
HTTP 200
[Captures]
client_token: jsonpath "$.data.access_token"
client_subject: jsonpath "$.data.user.id"

# Crear proyecto
POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "name": "Proyecto Cambios {{TEST_SUFFIX}}",
  "type": "campaign_service",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"],
  "brief": "Brief original"
}
HTTP 201
[Captures]
cr_project_id: jsonpath "$.data.id"

# --- Client: Crea solicitud menor ---
POST {{base_url}}/api/v1/collab/projects/{{cr_project_id}}/change-requests/minor
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "description": "Cambio menor de prueba {{TEST_SUFFIX}}"
}
HTTP 201
[Captures]
minor_cr_id: jsonpath "$.data.id"
[Asserts]
jsonpath "$.data.type" == "minor"

# --- Client: Crea solicitud formal ---
POST {{base_url}}/api/v1/collab/projects/{{cr_project_id}}/change-requests/formal
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "description": "Cambio formal de prueba {{TEST_SUFFIX}}"
}
HTTP 201
[Captures]
formal_cr_id: jsonpath "$.data.id"
[Asserts]
jsonpath "$.data.type" == "formal"

# --- Worker: NO puede crear solicitud (403) ---
POST {{base_url}}/api/v1/collab/projects/{{cr_project_id}}/change-requests/minor
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "description": "No permitido"
}
HTTP 403

# --- Admin: Resuelve solicitud menor ---
PATCH {{base_url}}/api/v1/collab/projects/{{cr_project_id}}/change-requests/{{minor_cr_id}}
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "status": "resolved",
  "resolution": "Cambio aplicado"
}
HTTP 200
[Asserts]
jsonpath "$.data.status" == "resolved"

# --- Admin: Aprueba solicitud formal ---
PATCH {{base_url}}/api/v1/collab/projects/{{cr_project_id}}/change-requests/{{formal_cr_id}}
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "status": "approved",
  "resolution": "Aprobado por admin"
}
HTTP 200
[Asserts]
jsonpath "$.data.status" == "approved"

# --- Lista historial de cambios formales ---
GET {{base_url}}/api/v1/collab/projects/{{cr_project_id}}/change-log/formal
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.data" isCollection

# --- Solicitud inexistente (404) ---
PATCH {{base_url}}/api/v1/collab/projects/{{cr_project_id}}/change-requests/00000000-0000-0000-0000-000000000000
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "status": "resolved"
}
HTTP 404
