# ============================================================
# mod-collab - Smoke RBAC via KrakenD usando usuarios seed
# Variables inyectadas por el runner:
#   LOGIN_IP
#   WORKER_EMAIL
#   WORKER_PASSWORD
#   CLIENT_EMAIL
#   CLIENT_PASSWORD
#   TEST_SUFFIX
# ============================================================

POST {{base_url}}/api/v1/auth/login
X-Forwarded-For: {{LOGIN_IP}}
X-Real-IP: {{LOGIN_IP}}
Content-Type: application/json
{
  "email": "admin@cima.dev",
  "password": "Admin123!"
}
HTTP 200
[Captures]
admin_token: jsonpath "$.data.access_token"

POST {{base_url}}/api/v1/auth/login
X-Forwarded-For: {{LOGIN_IP}}
X-Real-IP: {{LOGIN_IP}}
Content-Type: application/json
{
  "email": "{{WORKER_EMAIL}}",
  "password": "{{WORKER_PASSWORD}}"
}
HTTP 200
[Captures]
worker_token: jsonpath "$.data.access_token"
worker_subject: jsonpath "$.data.user.id"

POST {{base_url}}/api/v1/auth/login
X-Forwarded-For: {{LOGIN_IP}}
X-Real-IP: {{LOGIN_IP}}
Content-Type: application/json
{
  "email": "{{CLIENT_EMAIL}}",
  "password": "{{CLIENT_PASSWORD}}"
}
HTTP 200
[Captures]
client_token: jsonpath "$.data.access_token"
client_subject: jsonpath "$.data.user.id"

GET {{base_url}}/api/v1/collab/projects
HTTP 401

POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "name": "Proyecto no permitido {{TEST_SUFFIX}}",
  "description": "Debe fallar",
  "client_name": "Cliente seed",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"],
  "type": "campaign_service",
  "brief": "Brief de prueba"
}
HTTP 403

POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "name": "Proyecto RBAC {{TEST_SUFFIX}}",
  "description": "Prueba de permisos vigente",
  "client_name": "Cliente seed",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"],
  "type": "campaign_service",
  "brief": "Brief inicial de prueba"
}
HTTP 201
[Captures]
project_id: jsonpath "$.data.id"

GET {{base_url}}/api/v1/collab/projects/{{project_id}}/workspace
Authorization: Bearer {{worker_token}}
HTTP 200
[Captures]
column_id: jsonpath "$.data.board.columns[0].id"

POST {{base_url}}/api/v1/collab/projects/{{project_id}}/tasks
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "column_id": "{{column_id}}",
  "title": "Tarea visible cliente {{TEST_SUFFIX}}",
  "description": "Debe poder verla y comentar",
  "priority": "medium",
  "assignees": [
    {
      "user_sub": "{{worker_subject}}",
      "user_email": "{{WORKER_EMAIL}}"
    }
  ],
  "client_visible": true,
  "position": 0
}
HTTP 201
[Captures]
task_id: jsonpath "$.data.id"

GET {{base_url}}/api/v1/collab/projects/{{project_id}}/tasks
Authorization: Bearer {{client_token}}
HTTP 200
[Asserts]
jsonpath "$.data.items[0].id" == "{{task_id}}"

POST {{base_url}}/api/v1/collab/projects/{{project_id}}/tasks/{{task_id}}/comments
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "content": "Comentario del cliente {{TEST_SUFFIX}}"
}
HTTP 201

PATCH {{base_url}}/api/v1/collab/tasks/{{task_id}}
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "title": "Edicion no permitida"
}
HTTP 403
