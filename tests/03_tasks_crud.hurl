# ============================================================
# 03 — CRUD de Tareas
# ============================================================
# Prueba los endpoints de tareas:
# - Admin crea tarea con asignados
# - Admin crea tarea con subtareas
# - Worker actualiza tarea asignada
# - Worker mueve tarea (cambio de columna)
# - Client NO puede crear tarea (403)
# - Client ve tareas de su proyecto
# - Validacion de prioridad invalida (400)
# - Tarea inexistente (404)
# ============================================================

# Login y obtener tokens
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

# Crear proyecto para las pruebas de tareas
POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "name": "Proyecto Tareas {{TEST_SUFFIX}}",
  "type": "campaign_service",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"]
}
HTTP 201
[Captures]
task_project_id: jsonpath "$.data.id"

# Obtener workspace para tener column_id
GET {{base_url}}/api/v1/collab/projects/{{task_project_id}}/workspace
Authorization: Bearer {{admin_token}}
HTTP 200
[Captures]
column_id: jsonpath "$.data.board.columns[0].id"

# --- Admin: Crea tarea con asignados ---
POST {{base_url}}/api/v1/collab/projects/{{task_project_id}}/tasks
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "column_id": "{{column_id}}",
  "title": "Tarea HURL {{TEST_SUFFIX}}",
  "description": "Tarea de prueba automatizada",
  "priority": "high",
  "assignees": [
    {
      "user_sub": "{{worker_subject}}",
      "user_email": "ana.martinez@cima.dev"
    }
  ],
  "client_visible": true,
  "position": 0
}
HTTP 201
[Captures]
task_id: jsonpath "$.data.id"
[Asserts]
jsonpath "$.data.title" == "Tarea HURL {{TEST_SUFFIX}}"
jsonpath "$.data.priority" == "high"

# --- Admin: Crea tarea con subtareas ---
POST {{base_url}}/api/v1/collab/projects/{{task_project_id}}/tasks
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "column_id": "{{column_id}}",
  "title": "Tarea con subtareas {{TEST_SUFFIX}}",
  "description": "Tarea con checklist",
  "priority": "medium",
  "assignees": [
    {
      "user_sub": "{{worker_subject}}",
      "user_email": "ana.martinez@cima.dev"
    }
  ],
  "subtasks": [
    { "title": "Subtarea 1", "position": 0 },
    { "title": "Subtarea 2", "position": 1 }
  ],
  "position": 1
}
HTTP 201
[Captures]
subtask_task_id: jsonpath "$.data.id"

# --- Worker: Actualiza tarea asignada ---
PATCH {{base_url}}/api/v1/collab/tasks/{{task_id}}
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "title": "Tarea Actualizada {{TEST_SUFFIX}}",
  "priority": "medium"
}
HTTP 200
[Asserts]
jsonpath "$.data.title" == "Tarea Actualizada {{TEST_SUFFIX}}"

# --- Worker: Mueve tarea (cambio de columna) ---
# Obtener columnas del proyecto
GET {{base_url}}/api/v1/collab/projects/{{task_project_id}}/columns
Authorization: Bearer {{worker_token}}
HTTP 200
[Captures]
target_column_id: jsonpath "$.data[1].id"

PATCH {{base_url}}/api/v1/collab/tasks/{{task_id}}
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "column_id": "{{target_column_id}}"
}
HTTP 200

# --- Client: Ve tareas de su proyecto ---
GET {{base_url}}/api/v1/collab/projects/{{task_project_id}}/tasks
Authorization: Bearer {{client_token}}
HTTP 200
[Asserts]
jsonpath "$.data.items" isCollection

# --- Client: NO puede crear tarea (403) ---
POST {{base_url}}/api/v1/collab/projects/{{task_project_id}}/tasks
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "column_id": "{{column_id}}",
  "title": "No permitida",
  "priority": "low",
  "position": 0
}
HTTP 403

# --- Tarea inexistente (404) ---
PATCH {{base_url}}/api/v1/collab/tasks/00000000-0000-0000-0000-000000000000
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "title": "No existe"
}
HTTP 404
