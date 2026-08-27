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

# --- Worker: Solicita URL de subida ---
POST {{base_url}}/api/v1/collab/projects/{{file_project_id}}/files/upload-url
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "fileName": "documento_prueba.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 24
}
HTTP 200
[Captures]
upload_url: jsonpath "$.data.uploadUrl"
file_object_key: jsonpath "$.data.objectKey"
[Asserts]
jsonpath "$.data.uploadUrl" exists
jsonpath "$.data.objectKey" exists

# --- Worker: carga el binario directamente a almacenamiento privado ---
PUT {{upload_url}}
Content-Type: application/pdf
file,fixtures/collab-e2e.pdf;
HTTP 200

# --- Worker: Registra metadatos de archivo ---
POST {{base_url}}/api/v1/collab/projects/{{file_project_id}}/files
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "storage_path": "{{file_object_key}}",
  "file_name": "documento_prueba.pdf",
  "title": "Documento de prueba",
  "description": "Archivo de prueba de extremo a extremo",
  "mime_type": "application/pdf",
  "size_bytes": 24,
  "folder": "shared_deliverables",
  "is_client_visible": true,
  "origin": "manual_upload"
}
HTTP 201
[Captures]
file_id: jsonpath "$.data.id"

# --- Client: Aprueba archivo visible ---
PATCH {{base_url}}/api/v1/collab/files/{{file_id}}/approve
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "approve": true
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
