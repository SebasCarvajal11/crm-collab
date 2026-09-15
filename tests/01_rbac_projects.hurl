# RBAC transversal: autenticación, aislamiento por membresía y permisos de proyecto.
# Variables requeridas por el runner: base_url, LOGIN_IP, TEST_SUFFIX,
# WORKER_EMAIL, WORKER_PASSWORD, CLIENT_EMAIL y CLIENT_PASSWORD.

POST {{base_url}}/api/v1/auth/login
X-Forwarded-For: {{LOGIN_IP}}
X-Real-IP: {{LOGIN_IP}}
Content-Type: application/json
{
  "email": "{{ADMIN_EMAIL}}",
  "password": "{{ADMIN_PASSWORD}}"
}
HTTP 200
[Captures]
admin_token: jsonpath "$.data.access_token" redact
admin_refresh_cookie: header "Set-Cookie" redact
admin_subject: jsonpath "$.data.user.id"

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
worker_token: jsonpath "$.data.access_token" redact
worker_subject: jsonpath "$.data.user.id"
worker_refresh_cookie: header "Set-Cookie" redact

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
client_token: jsonpath "$.data.access_token" redact
client_subject: jsonpath "$.data.user.id"
client_refresh_cookie: header "Set-Cookie" redact

# El gateway debe rechazar la ausencia de identidad antes de alcanzar collab.
GET {{base_url}}/api/v1/collab/projects
HTTP 401

# Un cliente autenticado no puede crear ni administrar proyectos.
POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "name": "Proyecto prohibido {{TEST_SUFFIX}}",
  "type": "campaign_service",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"]
}
HTTP 403

POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "name": "RBAC {{TEST_SUFFIX}}",
  "description": "Proyecto aislado para verificar autorizacion",
  "client_name": "Cliente de contrato",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"],
  "type": "campaign_service",
  "brief": "Brief RBAC"
}
HTTP 201
[Captures]
project_id: jsonpath "$.data.id"
[Asserts]
jsonpath "$.data.adminResponsibleSub" == "{{admin_subject}}"
jsonpath "$.data.type" == "campaign_service"

# Los tres roles asignados pueden consultar el proyecto, pero solo el admin lo modifica.
GET {{base_url}}/api/v1/collab/projects/{{project_id}}
Authorization: Bearer {{worker_token}}
HTTP 200

GET {{base_url}}/api/v1/collab/projects/{{project_id}}
Authorization: Bearer {{client_token}}
HTTP 200

PATCH {{base_url}}/api/v1/collab/projects/{{project_id}}
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "name": "Edicion prohibida {{TEST_SUFFIX}}"
}
HTTP 403

PATCH {{base_url}}/api/v1/collab/projects/{{project_id}}
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "name": "Edicion prohibida {{TEST_SUFFIX}}"
}
HTTP 403

PATCH {{base_url}}/api/v1/collab/projects/{{project_id}}
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "name": "RBAC actualizado {{TEST_SUFFIX}}",
  "progress_percent": 25
}
HTTP 200
[Asserts]
jsonpath "$.data.name" == "RBAC actualizado {{TEST_SUFFIX}}"
jsonpath "$.data.progressPercent" == 25

# La membresía local no puede escalar los privilegios globales de un worker.
PUT {{base_url}}/api/v1/collab/projects/{{project_id}}/members
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "user_sub": "{{worker_subject}}",
  "role": "admin"
}
HTTP 400

PUT {{base_url}}/api/v1/collab/projects/{{project_id}}/members
Authorization: Bearer {{worker_token}}
Content-Type: application/json
{
  "user_sub": "{{client_subject}}",
  "role": "client"
}
HTTP 403

GET {{base_url}}/api/v1/collab/projects/{{project_id}}/members
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.data" count == 3
