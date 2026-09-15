# Flujo Kanban: proyecto (tablero padre), columnas y tareas/subtareas (hijos).

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
  "name": "Kanban padre {{TEST_SUFFIX}}",
  "type": "campaign_service",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"]
}
HTTP 201
[Captures]
project_id: jsonpath "$.data.id"

# Capturar columnas canónicas del tablero padre: pendiente, aprobación de cliente y hecho.
GET {{base_url}}/api/v1/collab/projects/{{project_id}}/workspace
Authorization: Bearer {{admin_token}}
HTTP 200
[Captures]
pending_column_id: jsonpath "$.data.board.columns[0].id"
client_approval_column_id: jsonpath "$.data.board.columns[3].id"
done_column_id: jsonpath "$.data.board.columns[5].id"
[Asserts]
jsonpath "$.data.board.columns" count == 6
jsonpath "$.data.board.tasks" count == 0

# Hijo interno: no debe filtrarse al tablero del cliente.
POST {{base_url}}/api/v1/collab/projects/{{project_id}}/tasks
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "column_id": "{{pending_column_id}}",
  "title": "Hijo interno {{TEST_SUFFIX}}",
  "priority": "high",
  "client_visible": false,
  "position": 0
}
HTTP 201
[Captures]
internal_task_id: jsonpath "$.data.id"

# Hijo visible, asignado al worker y con subtareas persistidas.
POST {{base_url}}/api/v1/collab/projects/{{project_id}}/tasks
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "column_id": "{{client_approval_column_id}}",
  "title": "Hijo visible {{TEST_SUFFIX}}",
  "description": "Tarjeta visible para el cliente",
  "priority": "medium",
  "assignees": [{ "user_sub": "{{worker_subject}}", "user_email": "{{WORKER_EMAIL}}" }],
  "client_visible": true,
  "position": 1,
  "subtasks": [
    { "title": "Preparar entrega", "position": 0 },
    { "title": "Revisar entrega", "position": 1 }
  ]
}
HTTP 201
[Captures]
visible_task_id: jsonpath "$.data.id"

# La respuesta de creación mantiene el contrato ligero; recuperar el hijo desde
# el tablero verifica que sus subtareas fueron persistidas antes de finalizarlo.
GET {{base_url}}/api/v1/collab/projects/{{project_id}}/tasks?page=1&limit=10
Authorization: Bearer {{worker_token}}
HTTP 200
[Captures]
first_subtask_id: jsonpath "$.data.items[1].subtasks[0].id"
second_subtask_id: jsonpath "$.data.items[1].subtasks[1].id"
[Asserts]
jsonpath "$.data.items[1].id" == "{{visible_task_id}}"
jsonpath "$.data.items[1].subtasks" count == 2

# El worker puede gestionar el hijo asignado y moverlo entre columnas.
PATCH {{base_url}}/api/v1/collab/tasks/{{visible_task_id}}
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "column_id": "{{done_column_id}}",
  "subtasks": [
    { "id": "{{first_subtask_id}}", "title": "Preparar entrega", "is_completed": true, "position": 0 },
    { "id": "{{second_subtask_id}}", "title": "Revisar entrega", "is_completed": true, "position": 1 }
  ]
}
HTTP 200
[Asserts]
jsonpath "$.data.columnId" == "{{done_column_id}}"
jsonpath "$.data.checklistProgress" == 100

# Ningún rol no administrador puede alterar el flujo de columnas.
POST {{base_url}}/api/v1/collab/projects/{{project_id}}/columns
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "key": "on_hold",
  "title": "No permitido",
  "position": 6
}
HTTP 403

POST {{base_url}}/api/v1/collab/projects/{{project_id}}/columns
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "key": "on_hold",
  "title": "No permitido",
  "position": 6
}
HTTP 403

# El tablero padre del administrador contiene ambos hijos. El cliente solo recibe
# columnas y tarjetas explícitamente visibles para él.
GET {{base_url}}/api/v1/collab/projects/{{project_id}}/board
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.data.board.tasks" count == 2

GET {{base_url}}/api/v1/collab/projects/{{project_id}}/board
Authorization: Bearer {{client_token}}
HTTP 200
[Asserts]
jsonpath "$.data.board.columns" count == 2
jsonpath "$.data.board.tasks" count == 1
jsonpath "$.data.board.tasks[0].id" == "{{visible_task_id}}"

# El cliente puede colaborar sobre una tarjeta visible, pero no crear, editar ni mover hijos.
POST {{base_url}}/api/v1/collab/projects/{{project_id}}/tasks/{{visible_task_id}}/comments
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "content": "Comentario del cliente {{TEST_SUFFIX}}"
}
HTTP 201

GET {{base_url}}/api/v1/collab/projects/{{project_id}}/tasks/{{visible_task_id}}/comments
Authorization: Bearer {{client_token}}
HTTP 200
[Asserts]
jsonpath "$.data" count == 1

PATCH {{base_url}}/api/v1/collab/tasks/{{visible_task_id}}
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "column_id": "{{pending_column_id}}"
}
HTTP 403
