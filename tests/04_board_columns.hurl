# ============================================================
# 04 — Columnas del Tablero
# ============================================================
# Prueba los endpoints de columnas:
# - Lista columnas del proyecto
# - Admin crea columna personalizada
# - Admin actualiza posicion de columna
# - Admin actualiza visibilidad para cliente
# - Worker NO puede crear columna (403)
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

# Crear proyecto para pruebas de columnas
POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "name": "Proyecto Columnas {{TEST_SUFFIX}}",
  "type": "campaign_service",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"]
}
HTTP 201
[Captures]
col_project_id: jsonpath "$.data.id"

# --- Lista columnas del proyecto ---
GET {{base_url}}/api/v1/collab/projects/{{col_project_id}}/columns
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.data" isCollection

# --- Admin: Crea columna personalizada ---
POST {{base_url}}/api/v1/collab/projects/{{col_project_id}}/columns
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "title": "En Espera",
  "key": "on_hold",
  "position": 4,
  "client_visible": false
}
HTTP 201
[Captures]
custom_column_id: jsonpath "$.data.id"
[Asserts]
jsonpath "$.data.title" == "En Espera"
jsonpath "$.data.key" == "on_hold"

# --- Admin: Actualiza posicion de columna ---
PATCH {{base_url}}/api/v1/collab/columns/{{custom_column_id}}
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "position": 5
}
HTTP 200
[Asserts]
jsonpath "$.data.position" == 5

# --- Admin: Actualiza visibilidad para cliente ---
PATCH {{base_url}}/api/v1/collab/columns/{{custom_column_id}}
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "client_visible": true
}
HTTP 200
[Asserts]
jsonpath "$.data.client_visible" == true

# --- Worker: NO puede crear columna (403) ---
POST {{base_url}}/api/v1/collab/projects/{{col_project_id}}/columns
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "title": "No permitida",
  "key": "blocked",
  "position": 6
}
HTTP 403

# --- Client: NO puede crear columna (403) ---
POST {{base_url}}/api/v1/collab/projects/{{col_project_id}}/columns
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "title": "No permitida",
  "key": "blocked",
  "position": 6
}
HTTP 403
