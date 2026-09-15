# Chat interno/externo, menciones, lecturas y las fronteras RBAC de cada canal.

POST {{base_url}}/api/v1/auth/login
X-Forwarded-For: {{LOGIN_IP}}
Content-Type: application/json
{
  "email": "{{ADMIN_EMAIL}}",
  "password": "{{ADMIN_PASSWORD}}"
}
HTTP 200
[Captures]
admin_token: jsonpath "$.data.access_token" redact
admin_refresh_cookie: header "Set-Cookie" redact

POST {{base_url}}/api/v1/auth/login
X-Forwarded-For: {{LOGIN_IP}}
Content-Type: application/json
{
  "email": "{{WORKER_EMAIL}}",
  "password": "{{WORKER_PASSWORD}}"
}
HTTP 200
[Captures]
worker_token: jsonpath "$.data.access_token" redact
worker_subject: jsonpath "$.data.user.id"
worker_refresh_cookie: header "Set-Cookie" redact

POST {{base_url}}/api/v1/auth/login
X-Forwarded-For: {{LOGIN_IP}}
Content-Type: application/json
{
  "email": "{{CLIENT_EMAIL}}",
  "password": "{{CLIENT_PASSWORD}}"
}
HTTP 200
[Captures]
client_token: jsonpath "$.data.access_token" redact
client_subject: jsonpath "$.data.user.id"
client_refresh_cookie: header "Set-Cookie" redact

POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "name": "Chat {{TEST_SUFFIX}}",
  "type": "campaign_service",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"]
}
HTTP 201
[Captures]
project_id: jsonpath "$.data.id"

# El equipo usa el canal interno y puede mencionar a participantes internos.
POST {{base_url}}/api/v1/collab/projects/{{project_id}}/chat/internal
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "body": "Revision interna para el equipo {{TEST_SUFFIX}}",
  "mentions": ["{{worker_subject}}"]
}
HTTP 201
[Captures]
internal_message_id: jsonpath "$.data.id"
[Asserts]
jsonpath "$.data.channel" == "internal"
jsonpath "$.data.content" == "Revision interna para el equipo {{TEST_SUFFIX}}"

POST {{base_url}}/api/v1/collab/projects/{{project_id}}/chat/internal
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "content": "Respuesta interna del worker {{TEST_SUFFIX}}"
}
HTTP 201

GET {{base_url}}/api/v1/collab/projects/{{project_id}}/chat/internal?page=1&limit=10
Authorization: Bearer {{worker_token}}
HTTP 200
[Asserts]
jsonpath "$.data.items" count == 2

# Un cliente no puede leer, escribir ni marcar lecturas del canal interno.
GET {{base_url}}/api/v1/collab/projects/{{project_id}}/chat/internal
Authorization: Bearer {{client_token}}
HTTP 403

POST {{base_url}}/api/v1/collab/projects/{{project_id}}/chat/internal/read
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "last_message_id": "{{internal_message_id}}"
}
HTTP 403

# Todos los miembros pueden usar el canal externo; el cliente solo puede mencionar
# a admin o worker, nunca a otro cliente.
POST {{base_url}}/api/v1/collab/projects/{{project_id}}/chat/external
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "content": "Actualizacion para cliente {{TEST_SUFFIX}}"
}
HTTP 201
[Captures]
external_message_id: jsonpath "$.data.id"

POST {{base_url}}/api/v1/collab/projects/{{project_id}}/chat/external
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "content": "Entrega disponible {{TEST_SUFFIX}}",
  "mentions": ["{{client_subject}}"]
}
HTTP 201

POST {{base_url}}/api/v1/collab/projects/{{project_id}}/chat/external
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "content": "Necesito ayuda {{TEST_SUFFIX}}",
  "mentions": ["{{worker_subject}}"]
}
HTTP 201

POST {{base_url}}/api/v1/collab/projects/{{project_id}}/chat/external
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "content": "Mencion no permitida",
  "mentions": ["{{client_subject}}"]
}
HTTP 400

GET {{base_url}}/api/v1/collab/projects/{{project_id}}/chat/external?page=1&limit=10
Authorization: Bearer {{client_token}}
HTTP 200
[Asserts]
jsonpath "$.data.items" count == 3

POST {{base_url}}/api/v1/collab/projects/{{project_id}}/chat/external/read
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "up_to_message_id": "{{external_message_id}}"
}
HTTP 200
[Asserts]
jsonpath "$.data.marked" isInteger

# El contrato de validación exige al menos un selector de lectura.
POST {{base_url}}/api/v1/collab/projects/{{project_id}}/chat/external/read
Authorization: Bearer {{client_token}}
Content-Type: application/json
{}
HTTP 400

GET {{base_url}}/api/v1/collab/notifications/unread/count
Authorization: Bearer {{worker_token}}
HTTP 200
[Asserts]
jsonpath "$.data.count" isString
