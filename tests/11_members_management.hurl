# ============================================================
# 11 — Gestion de Miembros
# ============================================================
# Prueba los endpoints de miembros:
# - Admin lista miembros del proyecto
# - Admin agrega worker al proyecto
# - Admin agrega client al proyecto
# - Actualizacion de rol de miembro
# - Worker NO puede agregar miembros (403)
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
  "name": "Proyecto Miembros {{TEST_SUFFIX}}",
  "type": "campaign_service",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"]
}
HTTP 201
[Captures]
member_project_id: jsonpath "$.data.id"

# --- Admin: Lista miembros del proyecto ---
GET {{base_url}}/api/v1/collab/projects/{{member_project_id}}/members
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.data" isCollection

# --- Admin: Agrega worker al proyecto (upsert) ---
PUT {{base_url}}/api/v1/collab/projects/{{member_project_id}}/members
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "user_sub": "{{worker_subject}}",
  "role": "worker"
}
HTTP 200
[Asserts]
jsonpath "$.data.user_sub" == "{{worker_subject}}"
jsonpath "$.data.role" == "worker"

# --- Admin: Agrega client al proyecto (upsert) ---
PUT {{base_url}}/api/v1/collab/projects/{{member_project_id}}/members
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "user_sub": "{{client_subject}}",
  "role": "client"
}
HTTP 200
[Asserts]
jsonpath "$.data.user_sub" == "{{client_subject}}"
jsonpath "$.data.role" == "client"

# --- Admin: Actualiza rol de miembro ---
PUT {{base_url}}/api/v1/collab/projects/{{member_project_id}}/members
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "user_sub": "{{worker_subject}}",
  "role": "admin"
}
HTTP 200
[Asserts]
jsonpath "$.data.role" == "admin"

# Restaurar rol original
PUT {{base_url}}/api/v1/collab/projects/{{member_project_id}}/members
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "user_sub": "{{worker_subject}}",
  "role": "worker"
}
HTTP 200

# --- Worker: NO puede agregar miembros (403) ---
PUT {{base_url}}/api/v1/collab/projects/{{member_project_id}}/members
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "user_sub": "{{client_subject}}",
  "role": "client"
}
HTTP 403

# --- Verificar miembros finales ---
GET {{base_url}}/api/v1/collab/projects/{{member_project_id}}/members
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.data" isCollection
