# ============================================================
# 09 — Operaciones de Archivos
# ============================================================
# Prueba los endpoints de archivos:
# - Worker solicita URL de subida
# - Worker registra metadatos de archivo
# - Worker aprueba archivo
# - Client descarga archivo
# - Admin elimina archivo
# - Client NO puede eliminar archivo (403)
# - Archivo inexistente (404)
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
  "name": "Proyecto Archivos {{TEST_SUFFIX}}",
  "type": "campaign_service",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"]
}
HTTP 201
[Captures]
file_project_id: jsonpath "$.data.id"

# Obtener workspace para tener column_id y task
GET {{base_url}}/api/v1/collab/projects/{{file_project_id}}/workspace
Authorization: Bearer {{worker_token}}
HTTP 200
[Captures]
file_column_id: jsonpath "$.data.board.columns[0].id"

# Crear tarea para adjuntar archivos
POST {{base_url}}/api/v1/collab/projects/{{file_project_id}}/tasks
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "column_id": "{{file_column_id}}",
  "title": "Tarea con archivos {{TEST_SUFFIX}}",
  "priority": "medium",
  "position": 0
}
HTTP 201
[Captures]
file_task_id: jsonpath "$.data.id"

# --- Worker: Solicita URL de subida ---
POST {{base_url}}/api/v1/collab/projects/{{file_project_id}}/files/upload-url
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "fileName": "documento_prueba.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 50000
}
HTTP 200
[Captures]
upload_url: jsonpath "$.data.uploadUrl"
file_object_key: jsonpath "$.data.objectKey"
[Asserts]
jsonpath "$.data.uploadUrl" exists
jsonpath "$.data.objectKey" exists

# --- Worker: Solicita URL de subida para tarea ---
POST {{base_url}}/api/v1/collab/projects/{{file_project_id}}/tasks/{{file_task_id}}/files/upload-url
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "fileName": "tarea_archivo.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 25000
}
HTTP 200
[Captures]
task_upload_url: jsonpath "$.data.uploadUrl"
task_file_object_key: jsonpath "$.data.objectKey"

# --- Worker: Registra metadatos de archivo ---
POST {{base_url}}/api/v1/collab/projects/{{file_project_id}}/files
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "object_key": "{{file_object_key}}",
  "file_name": "documento_prueba.pdf",
  "mime_type": "application/pdf",
  "size_bytes": 50000,
  "origin": "conversation"
}
HTTP 201
[Captures]
file_id: jsonpath "$.data.id"

# --- Worker: Aprueba archivo ---
PATCH {{base_url}}/api/v1/collab/files/{{file_id}}/approve
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "approved": true
}
HTTP 200

# --- Client: Obtiene URL de acceso ---
GET {{base_url}}/api/v1/collab/files/{{file_id}}/access
Authorization: Bearer {{client_token}}
HTTP 200
[Asserts]
jsonpath "$.data.url" exists

# --- Client: Descarga archivo ---
GET {{base_url}}/api/v1/collab/files/{{file_id}}/download
Authorization: Bearer {{client_token}}
HTTP 200

# --- Client: NO puede eliminar archivo (403) ---
DELETE {{base_url}}/api/v1/collab/files/{{file_id}}
Authorization: Bearer {{client_token}}
HTTP 403

# --- Admin: Elimina archivo ---
DELETE {{base_url}}/api/v1/collab/files/{{file_id}}
Authorization: Bearer {{admin_token}}
HTTP 200

# --- Archivo inexistente (404) ---
GET {{base_url}}/api/v1/collab/files/00000000-0000-0000-0000-000000000000/access
Authorization: Bearer {{admin_token}}
HTTP 404
