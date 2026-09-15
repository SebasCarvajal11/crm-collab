# Contratos adicionales del módulo: brief, solicitudes de cambio, notificaciones y timeline.

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
  "name": "Soporte collab {{TEST_SUFFIX}}",
  "type": "product_order",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"],
  "brief": "Brief inicial {{TEST_SUFFIX}}"
}
HTTP 201
[Captures]
project_id: jsonpath "$.data.id"

# El worker mantiene el brief; el cliente es deliberadamente solo lectura.
PATCH {{base_url}}/api/v1/collab/projects/{{project_id}}/brief
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "body": "Brief editado por worker {{TEST_SUFFIX}}"
}
HTTP 200
[Asserts]
jsonpath "$.data.content" == "Brief editado por worker {{TEST_SUFFIX}}"

GET {{base_url}}/api/v1/collab/projects/{{project_id}}/brief
Authorization: Bearer {{client_token}}
HTTP 200
[Asserts]
jsonpath "$.data.content" == "Brief editado por worker {{TEST_SUFFIX}}"

PATCH {{base_url}}/api/v1/collab/projects/{{project_id}}/brief
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "body": "Edicion prohibida"
}
HTTP 403

# Solo el cliente abre ajustes menores y el worker puede resolverlos.
POST {{base_url}}/api/v1/collab/projects/{{project_id}}/change-requests/minor
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "description": "Intento no permitido"
}
HTTP 403

POST {{base_url}}/api/v1/collab/projects/{{project_id}}/change-requests/minor
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "title": "Ajuste menor {{TEST_SUFFIX}}",
  "description": "Solicitar ajuste menor verificable"
}
HTTP 201
[Captures]
minor_request_id: jsonpath "$.data.id"

PATCH {{base_url}}/api/v1/collab/projects/{{project_id}}/change-requests/{{minor_request_id}}
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "status": "resolved"
}
HTTP 200
[Asserts]
jsonpath "$.data.status" == "resolved"

# Una solicitud formal requiere la resolución de un administrador global.
POST {{base_url}}/api/v1/collab/projects/{{project_id}}/change-requests/formal
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "title": "Cambio formal {{TEST_SUFFIX}}",
  "description": "Ampliar alcance del pedido",
  "justification": "Aprobacion requerida"
}
HTTP 201
[Captures]
formal_request_id: jsonpath "$.data.id"

PATCH {{base_url}}/api/v1/collab/projects/{{project_id}}/change-requests/{{formal_request_id}}
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "status": "approved"
}
HTTP 403

PATCH {{base_url}}/api/v1/collab/projects/{{project_id}}/change-requests/{{formal_request_id}}
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "status": "approved"
}
HTTP 200
[Asserts]
jsonpath "$.data.status" == "approved"

GET {{base_url}}/api/v1/collab/projects/{{project_id}}/change-log/formal?page=1&limit=10
Authorization: Bearer {{client_token}}
HTTP 200
[Asserts]
jsonpath "$.data.items" count >= 2

GET {{base_url}}/api/v1/collab/projects/{{project_id}}/timeline?page=1&limit=10
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.data" isCollection
