# ============================================================
# 07 — Notificaciones
# ============================================================
# Prueba los endpoints de notificaciones:
# - Lista notificaciones no leidas
# - Cuenta notificaciones no leidas
# - Marca notificacion como leida
# - Notificacion inexistente (404)
# - Sin notificaciones (array vacio)
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

# Crear proyecto y generar mencion para tener notificacion
POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "name": "Proyecto Notif {{TEST_SUFFIX}}",
  "type": "campaign_service",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"]
}
HTTP 201
[Captures]
notif_project_id: jsonpath "$.data.id"

# Enviar mensaje con mencion para generar notificacion
POST {{base_url}}/api/v1/collab/projects/{{notif_project_id}}/chat/internal
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "content": "Notificacion test @ana.martinez {{TEST_SUFFIX}}",
  "mentions": [
    {
      "user_sub": "{{worker_subject}}",
      "user_email": "ana.martinez@cima.dev"
    }
  ]
}
HTTP 201

# --- Worker: Lista notificaciones no leidas ---
GET {{base_url}}/api/v1/collab/notifications/chat-mentions/unread
Authorization: Bearer {{worker_token}}
HTTP 200
[Asserts]
jsonpath "$.data" isCollection

# --- Worker: Cuenta notificaciones no leidas ---
GET {{base_url}}/api/v1/collab/notifications/chat-mentions/unread/count
Authorization: Bearer {{worker_token}}
HTTP 200
[Captures]
unread_count: jsonpath "$.data.count"
[Asserts]
jsonpath "$.data.count" isString

# --- Worker: Marca notificacion como leida ---
# Obtener primera notificacion
GET {{base_url}}/api/v1/collab/notifications/chat-mentions/unread
Authorization: Bearer {{worker_token}}
HTTP 200
[Captures]
notification_id: jsonpath "$.data[0].id"

PATCH {{base_url}}/api/v1/collab/notifications/chat-mentions/{{notification_id}}/read
Authorization: Bearer {{worker_token}}
HTTP 200

# --- Verificar que la cuenta disminuyo ---
GET {{base_url}}/api/v1/collab/notifications/chat-mentions/unread/count
Authorization: Bearer {{worker_token}}
HTTP 200
[Asserts]
jsonpath "$.data.count" isString

# --- Notificacion inexistente (404) ---
PATCH {{base_url}}/api/v1/collab/notifications/chat-mentions/00000000-0000-0000-0000-000000000000/read
Authorization: Bearer {{worker_token}}
HTTP 404

# --- Admin: Sin notificaciones pendientes ---
GET {{base_url}}/api/v1/collab/notifications/chat-mentions/unread
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.data" isCollection
