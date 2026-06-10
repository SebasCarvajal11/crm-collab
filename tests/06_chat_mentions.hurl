# ============================================================
# 06 — Menciones en Chat
# ============================================================
# Prueba el sistema de menciones:
# - Admin menciona a worker
# - Worker menciona a client
# - Client menciona a worker
# - Client NO puede mencionar a otro client (403)
# - Mencion de usuario inexistente (ignorada)
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

# Crear proyecto para pruebas de menciones
POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "name": "Proyecto Menciones {{TEST_SUFFIX}}",
  "type": "campaign_service",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"]
}
HTTP 201
[Captures]
mention_project_id: jsonpath "$.data.id"

# --- Admin: Menciona a worker en chat interno ---
POST {{base_url}}/api/v1/collab/projects/{{mention_project_id}}/chat/internal
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "content": "Revisar esto @ana.martinez {{TEST_SUFFIX}}",
  "mentions": [
    {
      "user_sub": "{{worker_subject}}",
      "user_email": "ana.martinez@cima.dev"
    }
  ]
}
HTTP 201
[Asserts]
jsonpath "$.data.content" contains "@ana.martinez"

# --- Worker: Menciona a client en chat externo ---
POST {{base_url}}/api/v1/collab/projects/{{mention_project_id}}/chat/external
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "content": "Pregunta para @contacto {{TEST_SUFFIX}}",
  "mentions": [
    {
      "user_sub": "{{client_subject}}",
      "user_email": "contacto@restauranteelbuensabor.com"
    }
  ]
}
HTTP 201

# --- Client: Menciona a worker en chat externo ---
POST {{base_url}}/api/v1/collab/projects/{{mention_project_id}}/chat/external
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "content": "Necesito ayuda @ana.martinez {{TEST_SUFFIX}}",
  "mentions": [
    {
      "user_sub": "{{worker_subject}}",
      "user_email": "ana.martinez@cima.dev"
    }
  ]
}
HTTP 201

# --- Client: NO puede mencionar en chat interno (403) ---
POST {{base_url}}/api/v1/collab/projects/{{mention_project_id}}/chat/internal
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "content": "No permitido @ana.martinez",
  "mentions": [
    {
      "user_sub": "{{worker_subject}}",
      "user_email": "ana.martinez@cima.dev"
    }
  ]
}
HTTP 403

# --- Verificar notificaciones de menciones ---
GET {{base_url}}/api/v1/collab/notifications/chat-mentions/unread
Authorization: Bearer {{worker_token}}
HTTP 200
[Asserts]
jsonpath "$.data" isCollection

GET {{base_url}}/api/v1/collab/notifications/chat-mentions/unread/count
Authorization: Bearer {{worker_token}}
HTTP 200
[Asserts]
jsonpath "$.data.count" isString
