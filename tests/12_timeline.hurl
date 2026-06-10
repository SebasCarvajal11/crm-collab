# ============================================================
# 12 — Timeline del Proyecto
# ============================================================
# Prueba los endpoints de timeline:
# - Admin obtiene timeline del proyecto
# - Timeline con paginacion
# - Timeline de archivos
# - Timeline vacio (array vacio)
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

# Crear proyecto para timeline
POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "name": "Proyecto Timeline {{TEST_SUFFIX}}",
  "type": "campaign_service",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"]
}
HTTP 201
[Captures]
timeline_project_id: jsonpath "$.data.id"

# Generar actividad para el timeline
GET {{base_url}}/api/v1/collab/projects/{{timeline_project_id}}/workspace
Authorization: Bearer {{admin_token}}
HTTP 200
[Captures]
timeline_column_id: jsonpath "$.data.board.columns[0].id"

# Crear tarea
POST {{base_url}}/api/v1/collab/projects/{{timeline_project_id}}/tasks
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "column_id": "{{timeline_column_id}}",
  "title": "Tarea Timeline {{TEST_SUFFIX}}",
  "priority": "medium",
  "position": 0
}
HTTP 201

# --- Admin: Obtiene timeline del proyecto ---
GET {{base_url}}/api/v1/collab/projects/{{timeline_project_id}}/timeline
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.data.items" isCollection

# --- Timeline con paginacion ---
GET {{base_url}}/api/v1/collab/projects/{{timeline_project_id}}/timeline?page=1&limit=5
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.data.items" isCollection

# --- Timeline de archivos ---
GET {{base_url}}/api/v1/collab/projects/{{timeline_project_id}}/files/timeline
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.data.items" isCollection

# --- Worker: Accede al timeline ---
GET {{base_url}}/api/v1/collab/projects/{{timeline_project_id}}/timeline
Authorization: Bearer {{worker_token}}
HTTP 200
[Asserts]
jsonpath "$.data.items" isCollection

# --- Client: Accede al timeline ---
GET {{base_url}}/api/v1/collab/projects/{{timeline_project_id}}/timeline
Authorization: Bearer {{client_token}}
HTTP 200
[Asserts]
jsonpath "$.data.items" isCollection
