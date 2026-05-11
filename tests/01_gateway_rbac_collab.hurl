# ============================================================
# mod-collab — Smoke RBAC via KrakenD
# Ejecutar con variables:
# hurl --test --variable WORKER_EMAIL=... --variable CLIENT_EMAIL=... tests/01_gateway_rbac_collab.hurl
# ============================================================

POST http://localhost:8080/auth/login
Content-Type: application/json
{
  "email": "admin@cima.dev",
  "password": "Admin123!"
}
HTTP 200
[Captures]
admin_token: jsonpath "$.data.access_token"

POST http://localhost:8080/auth/register-worker
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "email": "{{WORKER_EMAIL}}"
}
HTTP 201
[Captures]
worker_temp_password: jsonpath "$.data.temp_password"

POST http://localhost:8080/auth/login
Content-Type: application/json
{
  "email": "{{WORKER_EMAIL}}",
  "password": "{{worker_temp_password}}"
}
HTTP 200
[Captures]
worker_token: jsonpath "$.data.access_token"

POST http://localhost:8080/auth/invite-client
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "email": "{{CLIENT_EMAIL}}"
}
HTTP 201
[Captures]
invite_token: jsonpath "$.data.token"

POST http://localhost:8080/auth/accept-invite
Content-Type: application/json
{
  "token": "{{invite_token}}",
  "password": "Client123!"
}
HTTP 201
[Captures]
client_token: jsonpath "$.data.access_token"
client_subject: jsonpath "$.data.user.id"

GET http://localhost:8080/collab/workspaces
HTTP 401

POST http://localhost:8080/collab/workspaces
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "name": "Workspace RBAC",
  "description": "Prueba de permisos"
}
HTTP 201
[Captures]
workspace_id: jsonpath "$.data.id"

POST http://localhost:8080/collab/workspaces
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "name": "No permitido cliente",
  "description": "Debe fallar"
}
HTTP 403

PUT http://localhost:8080/collab/workspaces/{{workspace_id}}/members
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "user_sub": "{{client_subject}}",
  "role": "client"
}
HTTP 200

POST http://localhost:8080/collab/workspaces/{{workspace_id}}/boards
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "name": "Board cliente",
  "description": "Debe fallar"
}
HTTP 403

POST http://localhost:8080/collab/workspaces/{{workspace_id}}/boards
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "name": "Board RBAC",
  "description": "Board de prueba"
}
HTTP 201
[Captures]
board_id: jsonpath "$.data.id"

POST http://localhost:8080/collab/boards/{{board_id}}/columns
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "title": "To Do",
  "position": 0
}
HTTP 201
[Captures]
column_id: jsonpath "$.data.id"

POST http://localhost:8080/collab/boards/{{board_id}}/tasks
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "column_id": "{{column_id}}",
  "title": "Tarea visible cliente",
  "description": "Debe poder verla y comentar",
  "priority": "medium",
  "status": "todo",
  "client_visible": true,
  "position": 0
}
HTTP 201
[Captures]
task_id: jsonpath "$.data.id"

GET http://localhost:8080/collab/boards/{{board_id}}/tasks
Authorization: Bearer {{client_token}}
HTTP 200
[Asserts]
jsonpath "$.data[0].id" == "{{task_id}}"

POST http://localhost:8080/collab/tasks/{{task_id}}/comments
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "body": "Comentario del cliente"
}
HTTP 201

PATCH http://localhost:8080/collab/tasks/{{task_id}}
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "status": "done"
}
HTTP 403
