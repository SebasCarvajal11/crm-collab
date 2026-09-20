# Contratos de API: `crm-collab`

Este documento detalla la interfaz pública, los convenios HTTP, los 63 endpoints expuestos y la configuración de claves de servicio en `crm-collab`.

---

## 1. Convenciones y Puertos

| Entorno | Host / URL Base | Descripción |
| :--- | :--- | :--- |
| **API Gateway (Estándar)**| `http://localhost:28080` | KrakenD enruta `/api/v1/collab/*` hacia `crm-collab:3001`. |
| **Directo (Desarrollo)** | `http://localhost:3001` | Puerto directo del microservicio. |

- **Especificación OpenAPI**: [`openapi/openapi.yaml`](file:///d:/BACKUP%20CELULAR%20OLIMPO/crm-collab/openapi/openapi.yaml)
- **Autenticación**: Encabezado `Authorization: Bearer <access_token>` emitido por `crm-auth`.
- **Clave Pública de Servicio (Service JWKS)**: `GET /api/v1/.well-known/service-jwks.json`.
- **Formato de Error**: `{ "error": "Descripción del fallo" }` (HTTP 400, 401, 403, 404, 500).

---

## 2. Catálogo de Endpoints por Subdominio

### Sistema y Documentación
- `GET /api/v1/health`: Estado de salud, base de datos y conexión Redis.
- `GET /api/v1/.well-known/service-jwks.json`: Publicación de clave pública RS256 para `crm-media`.
- `GET /api/v1/docs/collab/openapi.yaml`: Especificación OpenAPI 3.0.3 del servicio.

### Proyectos y Miembros
- `GET /api/v1/collab/projects`: Listado paginado de proyectos accesibles por el usuario.
- `GET /api/v1/collab/projects/search`: Búsqueda de proyectos por texto.
- `POST /api/v1/collab/projects`: Creación de un nuevo proyecto (`admin` o `worker`).
- `GET /api/v1/collab/projects/{projectId}`: Detalle completo de un proyecto.
- `PATCH /api/v1/collab/projects/{projectId}`: Actualización de título, tipo o estado.
- `DELETE /api/v1/collab/projects/{projectId}`: Eliminación de proyecto (`admin`).
- `GET /api/v1/collab/projects/{projectId}/members`: Miembros asignados.
- `POST /api/v1/collab/projects/{projectId}/members`: Asignar nuevo miembro.
- `DELETE /api/v1/collab/projects/{projectId}/members/{userSub}`: Retirar miembro.

### Tablero Kanban, Tareas y Subtareas
- `GET /api/v1/collab/projects/{projectId}/board`: Estructura completa de columnas y tareas.
- `POST /api/v1/collab/projects/{projectId}/columns`: Crear nueva columna.
- `PATCH /api/v1/collab/projects/{projectId}/columns/{columnId}`: Renombrar o reordenar columna.
- `POST /api/v1/collab/projects/{projectId}/tasks`: Crear tarea en una columna.
- `PATCH /api/v1/collab/projects/{projectId}/tasks/{taskId}`: Modificar tarea (mover de columna, prioridad).
- `DELETE /api/v1/collab/projects/{projectId}/tasks/{taskId}`: Eliminar tarea.
- `POST /api/v1/collab/projects/{projectId}/tasks/{taskId}/subtasks`: Crear subtarea.
- `PATCH /api/v1/collab/projects/{projectId}/tasks/{taskId}/subtasks/{subtaskId}`: Alternar completado.
- `POST /api/v1/collab/projects/{projectId}/tasks/{taskId}/comments`: Agregar comentario a una tarea.

### Chat Interno y Externo
- `GET /api/v1/collab/projects/{projectId}/chat/{channel}`: Historial de mensajes (`internal` o `external`).
- `POST /api/v1/collab/projects/{projectId}/chat/{channel}`: Enviar mensaje de texto o adjunto.
- `POST /api/v1/collab/projects/{projectId}/chat/{channel}/read`: Marcar mensajes del canal como leídos.
- `POST /api/v1/collab/projects/{projectId}/chat/{channel}/typing`: Emitir evento de tipeo en vivo.

### Contratos y Otrosíes (Adiciones Contractuales)
- `GET /api/v1/collab/projects/{projectId}/contract`: Consultar contrato principal.
- `PUT /api/v1/collab/projects/{projectId}/contract`: Guardar o actualizar borrador de contrato.
- `POST /api/v1/collab/projects/{projectId}/contract/request-signature`: Solicitar firma al cliente.
- `POST /api/v1/collab/projects/{projectId}/contract/sign`: Firmar digitalmente el contrato como cliente.
- `GET /api/v1/collab/projects/{projectId}/contract/amendments`: Listar otrosíes del proyecto.
- `POST /api/v1/collab/projects/{projectId}/contract/amendments`: Crear borrador de otrosí.
- `POST /api/v1/collab/projects/{projectId}/contract/amendments/request`: Solicitar otrosí como cliente.
- `POST /api/v1/collab/projects/{projectId}/contract/amendments/{id}/request-signature`: Solicitar firma.
- `POST /api/v1/collab/projects/{projectId}/contract/amendments/{id}/sign`: Firmar digitalmente otrosí.

### Archivos y Entregables (Coordinación con `crm-media`)
- `GET /api/v1/collab/projects/{projectId}/files`: Listar entregables del proyecto.
- `POST /api/v1/collab/projects/{projectId}/files/upload-url`: Solicitar URL pre-firmada de subida.
- `POST /api/v1/collab/projects/{projectId}/files/metadata`: Confirmar metadatos tras subida exitosa.
- `POST /api/v1/collab/projects/{projectId}/files/{fileId}/approve`: Aprobación formal por parte del cliente.
