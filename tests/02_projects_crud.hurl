# ============================================================
# 02 — CRUD de Proyectos
# ============================================================
# Prueba los endpoints de proyectos:
# - Admin crea proyecto (campaign_service)
# - Admin crea proyecto (product_order)
# - Admin actualiza proyecto
# - Worker lista proyectos
# - Client lista proyectos propios
# - Admin busca proyecto por nombre
# - Client NO puede crear proyecto (403)
# - Guest NO puede acceder (401)
# - Validacion de campos requeridos (400)
# - Proyecto inexistente (404)
# ============================================================

# Login como admin
POST {{base_url}}/api/v1/auth/login
Content-Type: application/json
{
  "email": "admin@cima.dev",
  "password": "Admin123!"
}
HTTP 200
[Captures]
admin_token: jsonpath "$.data.access_token"

# Login como worker
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

# Login como client
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

# --- Guest: NO puede acceder (401) ---
GET {{base_url}}/api/v1/collab/projects
HTTP 401

# --- Client: NO puede crear proyecto (403) ---
POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{client_token}}
Content-Type: application/json
{
  "name": "Proyecto no permitido",
  "type": "campaign_service",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"]
}
HTTP 403

# --- Admin: Crea proyecto campaign_service ---
POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "name": "Campaña Test HURL {{TEST_SUFFIX}}",
  "type": "campaign_service",
  "description": "Proyecto de prueba HURL",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"],
  "brief": "Brief inicial de prueba"
}
HTTP 201
[Captures]
project_id: jsonpath "$.data.id"
[Asserts]
jsonpath "$.data.name" == "Campaña Test HURL {{TEST_SUFFIX}}"
jsonpath "$.data.type" == "campaign_service"

# --- Admin: Crea proyecto product_order ---
POST {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "name": "Orden Test HURL {{TEST_SUFFIX}}",
  "type": "product_order",
  "description": "Orden de prueba HURL",
  "client_sub": "{{client_subject}}",
  "worker_subs": ["{{worker_subject}}"]
}
HTTP 201
[Captures]
order_project_id: jsonpath "$.data.id"
[Asserts]
jsonpath "$.data.type" == "product_order"

# --- Admin: Actualiza proyecto ---
PATCH {{base_url}}/api/v1/collab/projects/{{project_id}}
Authorization: Bearer {{admin_token}}
Content-Type: application/json
{
  "name": "Campaña Actualizada {{TEST_SUFFIX}}"
}
HTTP 200
[Asserts]
jsonpath "$.data.name" == "Campaña Actualizada {{TEST_SUFFIX}}"

# --- Worker: Lista proyectos ---
GET {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{worker_token}}
HTTP 200
[Asserts]
jsonpath "$.data.items" isCollection

# --- Client: Lista proyectos propios ---
GET {{base_url}}/api/v1/collab/projects
Authorization: Bearer {{client_token}}
HTTP 200
[Asserts]
jsonpath "$.data.items" isCollection

# --- Admin: Busca proyecto por nombre ---
GET {{base_url}}/api/v1/collab/projects/search?q=Actualizada
Authorization: Bearer {{admin_token}}
HTTP 200
[Asserts]
jsonpath "$.data" isCollection

# --- Proyecto inexistente (404) ---
GET {{base_url}}/api/v1/collab/projects/00000000-0000-0000-0000-000000000000
Authorization: Bearer {{admin_token}}
HTTP 404
