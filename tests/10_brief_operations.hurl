# ============================================================
# 10 — Operaciones de Brief
# ============================================================
# Prueba los endpoints de brief:
# - Admin obtiene brief del proyecto
# - Admin actualiza brief
# - Worker actualiza brief
# - Client lee brief
# - Client NO puede editar brief (403)
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

# Crear proyecto con brief
POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "name": "Proyecto Brief {{TEST_SUFFIX}}",
  "type": "campaign_service",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"],
  "brief": "Brief inicial de prueba"
}
HTTP 201
[Captures]
brief_project_id: jsonpath "$.data.id"

# --- Admin: Obtiene brief del proyecto ---
GET {{base_url}}/api/v1/collab/projects/{{brief_project_id}}/brief
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.data.content" exists

# --- Admin: Actualiza brief ---
PATCH {{base_url}}/api/v1/collab/projects/{{brief_project_id}}/brief
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "content": "Brief actualizado por admin {{TEST_SUFFIX}}"
}
HTTP 200
[Asserts]
jsonpath "$.data.content" == "Brief actualizado por admin {{TEST_SUFFIX}}"

# --- Worker: Actualiza brief ---
PATCH {{base_url}}/api/v1/collab/projects/{{brief_project_id}}/brief
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "content": "Brief actualizado por worker {{TEST_SUFFIX}}"
}
HTTP 200
[Asserts]
jsonpath "$.data.content" == "Brief actualizado por worker {{TEST_SUFFIX}}"

# --- Client: Lee brief ---
GET {{base_url}}/api/v1/collab/projects/{{brief_project_id}}/brief
Authorization: Bearer {{client_token}}
HTTP 200
[Asserts]
jsonpath "$.data.content" exists

# --- Client: NO puede editar brief (403) ---
PATCH {{base_url}}/api/v1/collab/projects/{{brief_project_id}}/brief
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "content": "No permitido"
}
HTTP 403
