# ============================================================
# 05 — Mensajes de Chat
# ============================================================
# Prueba los endpoints de chat:
# - Admin envia mensaje interno (equipo)
# - Admin envia mensaje externo (cliente)
# - Worker envia mensaje interno
# - Client envia mensaje externo
# - Client NO puede enviar mensaje interno (403)
# - Lista mensajes internos con paginacion
# - Lista mensajes externos con paginacion
# - Marca mensajes como leidos
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

# Crear proyecto para pruebas de chat
POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "name": "Proyecto Chat {{TEST_SUFFIX}}",
  "type": "campaign_service",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"]
}
HTTP 201
[Captures]
chat_project_id: jsonpath "$.data.id"

# --- Admin: Envia mensaje interno (equipo) ---
POST {{base_url}}/api/v1/collab/projects/{{chat_project_id}}/chat/internal
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "content": "Mensaje interno de admin {{TEST_SUFFIX}}"
}
HTTP 201
[Captures]
internal_msg_id: jsonpath "$.data.id"
[Asserts]
jsonpath "$.data.content" == "Mensaje interno de admin {{TEST_SUFFIX}}"

# --- Admin: Envia mensaje externo (cliente) ---
POST {{base_url}}/api/v1/collab/projects/{{chat_project_id}}/chat/external
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "content": "Mensaje externo de admin {{TEST_SUFFIX}}"
}
HTTP 201
[Captures]
external_msg_id: jsonpath "$.data.id"
[Asserts]
jsonpath "$.data.content" == "Mensaje externo de admin {{TEST_SUFFIX}}"

# --- Worker: Envia mensaje interno ---
POST {{base_url}}/api/v1/collab/projects/{{chat_project_id}}/chat/internal
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "content": "Mensaje interno de worker {{TEST_SUFFIX}}"
}
HTTP 201

# --- Client: Envia mensaje externo ---
POST {{base_url}}/api/v1/collab/projects/{{chat_project_id}}/chat/external
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "content": "Mensaje externo de client {{TEST_SUFFIX}}"
}
HTTP 201

# --- Client: NO puede enviar mensaje interno (403) ---
POST {{base_url}}/api/v1/collab/projects/{{chat_project_id}}/chat/internal
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "content": "No permitido"
}
HTTP 403

# --- Lista mensajes internos con paginacion ---
GET {{base_url}}/api/v1/collab/projects/{{chat_project_id}}/chat/internal?page=1&limit=10
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.data.items" isCollection

# --- Lista mensajes externos con paginacion ---
GET {{base_url}}/api/v1/collab/projects/{{chat_project_id}}/chat/external?page=1&limit=10
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.data.items" isCollection

# --- Marca mensajes internos como leidos ---
POST {{base_url}}/api/v1/collab/projects/{{chat_project_id}}/chat/internal/read
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "last_message_id": "{{internal_msg_id}}"
}
HTTP 200

# --- Marca mensajes externos como leidos ---
POST {{base_url}}/api/v1/collab/projects/{{chat_project_id}}/chat/external/read
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "last_message_id": "{{external_msg_id}}"
}
HTTP 200
