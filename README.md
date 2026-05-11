# mod-collab - Módulo de Colaboración y Gestión de Proyectos Kanban

## Descripción

Microservicio independiente para la gestión de proyectos de marketing y productos con tableros Kanban personalizados según el tipo de proyecto.

### Características Principales

- **Tablero Padre**: Vista panorámica de todos los proyectos del usuario
- **Tableros Hijo**: Gestión detallada de tareas por proyecto con columnas dinámicas
- **Tipos de Proyecto**:
  - **Campaña/Servicio**: Marketing, diseño, redes sociales
  - **Pedido de Producto**: Productos tangibles (ej. camisetas estampadas)
- **Chat Dual**: Canal interno (equipo) y externo (con cliente)
- **Solicitudes de Cambio**: Sistema de doble vía (ajustes menores y cambios formales)
- **Gestión de Archivos**: Versionado, carpetas organizadas y aprobación
- **Control de Visibilidad**: Vistas diferenciadas por rol (admin, worker, client)
- **Auditoría Completa**: Registro detallado de todas las acciones

## Arquitectura

```
mod-collab (Puerto 3001)
├── PostgreSQL (Base de datos propia: schema_collab)
├── API REST (Hono + TypeScript)
├── Validación (Zod)
└── ORM (Drizzle)
```

## Requisitos

- **Node.js**: >= 18.x
- **PostgreSQL**: >= 14.x
- **npm** o **pnpm**

## Instalación

### 1. Clonar e instalar dependencias

```bash
cd mod-collab
npm install
```

### 2. Configurar variables de entorno

Copiar `.env.example` a `.env` y configurar:

```bash
cp .env.example .env
```

Editar `.env`:

```env
# Servidor
PORT=3001
NODE_ENV=development

# Base de datos (PostgreSQL)
DATABASE_URL=postgresql://user:password@localhost:5432/cima_crm

# CORS
MOD_COLLAB_CORS=true
CORS_ORIGIN=http://localhost:5173

# Gateway Trust (para validar requests del API Gateway)
GATEWAY_TRUST_TOKEN=cima-local-gateway-trust-secret-do-not-use-production-2026
```

### 3. Ejecutar migraciones

```bash
npm run db:push
```

O generar y ejecutar migraciones:

```bash
npm run db:generate
npm run db:migrate
```

### 4. Iniciar el servidor

**Desarrollo (con watch):**
```bash
npm run dev
```

**Producción:**
```bash
npm run build
npm start
```

## Endpoints Principales

Todos los endpoints requieren autenticación JWT (excepto `/health`, `/docs`, `/openapi.yaml`).

### System
- `GET /health` - Health check
- `GET /docs` - Documentación Swagger UI
- `GET /openapi.yaml` - Especificación OpenAPI

### Projects
- `GET /collab/projects` - Listar proyectos
- `POST /collab/projects` - Crear proyecto
- `PATCH /collab/projects/:projectId` - Actualizar proyecto
- `GET /collab/projects/:projectId/workspace` - Obtener workspace completo

### Members
- `GET /collab/projects/:projectId/members` - Listar miembros
- `PUT /collab/projects/:projectId/members` - Agregar/actualizar miembro

### Columns & Tasks
- `GET /collab/projects/:projectId/columns` - Listar columnas
- `POST /collab/projects/:projectId/columns` - Crear columna
- `PATCH /collab/columns/:columnId` - Actualizar columna
- `GET /collab/projects/:projectId/tasks` - Listar tareas
- `POST /collab/projects/:projectId/tasks` - Crear tarea
- `PATCH /collab/tasks/:taskId` - Actualizar tarea (incluye mover entre columnas)

### Chat
- `GET /collab/projects/:projectId/chat/internal` - Chat interno del equipo
- `POST /collab/projects/:projectId/chat/internal` - Enviar mensaje interno
- `GET /collab/projects/:projectId/chat/external` - Chat con cliente
- `POST /collab/projects/:projectId/chat/external` - Enviar mensaje al cliente

### Change Requests
- `POST /collab/projects/:projectId/change-requests/minor` - Solicitud de ajuste menor (cliente)
- `POST /collab/projects/:projectId/change-requests/formal` - Solicitud de cambio formal
- `PATCH /collab/projects/:projectId/change-requests/:changeRequestId` - Resolver solicitud
- `GET /collab/projects/:projectId/change-log/formal` - Historial de cambios formales

### Files
- `GET /collab/projects/:projectId/files` - Listar archivos
- `POST /collab/projects/:projectId/files` - Subir metadata de archivo
- `PATCH /collab/files/:fileId/approve` - Aprobar archivo (admin)

### Brief
- `GET /collab/projects/:projectId/brief` - Obtener brief
- `PATCH /collab/projects/:projectId/brief` - Actualizar brief (admin)

## Integración con API Gateway (KrakenD)

El módulo está diseñado para funcionar detrás de KrakenD. El gateway se encarga de:

1. **Autenticación JWT**: Valida el token y propaga claims como headers:
   - `X-User-Sub`: Subject del usuario
   - `X-User-Id`: ID del usuario
   - `X-User-Role`: Rol global (admin, worker, client)
   - `X-User-Email`: Email del usuario

2. **Trust Header**: Agrega `X-Gateway-Trust` para validar que el request viene del gateway

El módulo valida estos headers en el middleware `authMiddleware`.

### Acceso directo (desarrollo)
```
http://localhost:3001/collab/projects
```

### A través del Gateway (producción)
```
http://localhost:8080/collab/projects
```

## Modelo de Datos

### Entidades Principales

- **projects**: Proyectos (tablero padre)
- **projectMembers**: Miembros de proyectos con roles
- **projectTaskColumns**: Columnas personalizadas por proyecto
- **projectTasks**: Tareas del tablero hijo
- **projectChatMessages**: Mensajes de chat (internal/external)
- **projectFiles**: Archivos con versionado
- **projectBriefs**: Brief del proyecto
- **projectChangeRequests**: Solicitudes de cambio (minor/formal)
- **projectBriefChangeLog**: Historial de cambios formales
- **auditLogs**: Registro de auditoría (particionado por fecha)

### Esquema PostgreSQL

El módulo utiliza el esquema `schema_collab` (no `public`) para evitar conflictos con otros módulos.

```sql
CREATE SCHEMA schema_collab;
```

## Sistema de Roles y Permisos

| Acción | Admin | Worker | Cliente |
|--------|-------|--------|---------|
| Crear/editar flujo de proyecto | ✅ | ❌ | ❌ |
| Crear/editar columnas | ✅ | ❌ | ❌ |
| Mover tareas | ✅ | ✅ | ❌ |
| Ver tablero completo | ✅ | ✅ | ❌ (solo visible) |
| Chat interno | ✅ | ✅ | ❌ |
| Chat externo | ✅ | ✅ | ✅ |
| Solicitar ajuste menor | ❌ | ❌ | ✅ |
| Aceptar ajuste menor | ✅ | ✅ | ❌ |
| Solicitar cambio formal | ✅ | ✅ | ✅ |
| Aprobar cambio formal | ✅ | ❌ | ❌ |
| Aprobar archivos | ✅ | ❌ | ❌ |
| Editar brief | ✅ | ❌ | ❌ |

## Tipos de Proyecto y Flujos

### Campaña/Servicio
Columnas predeterminadas:
1. **Pendiente** (interno)
2. **Haciendo** (interno)
3. **En Revisión Interna** (interno)
4. **En Aprobación Cliente** (visible para cliente)
5. **Bloqueado** (interno)
6. **Hecho** (visible para cliente)

### Pedido de Producto
Columnas predeterminadas:
1. **Pendiente** (interno)
2. **Arte Aprobado** (visible para cliente)
3. **En Producción** (interno)
4. **En Control de Calidad** (interno)
5. **Enviado** (visible para cliente)
6. **Completado** (visible para cliente)
7. **Esperando Material** (interno, tipo "bloqueado")

## Barras de Progreso Inteligentes

El progreso se calcula automáticamente según el tipo de proyecto:

**Campaña/Servicio**: Basado en pesos por columna
- Pendiente: 0%
- Haciendo: 25%
- Revisión Interna: 50%
- Aprobación Cliente: 75%
- Hecho: 100%

**Pedido de Producto**: Basado en hitos fijos
- Arte Aprobado: 30%
- En Producción: 60%
- Control de Calidad: 80%
- Enviado/Completado: 100%

## Solicitudes de Cambio

### Ajuste Menor
- **Quién solicita**: Cliente
- **Quién resuelve**: Worker o Admin
- **Límite**: 300 caracteres
- **Restricción**: Solo 1 ajuste menor abierto por tarea
- **Efecto**: Tarea regresa a "Pendiente" o "Haciendo"

### Cambio Formal
- **Quién solicita**: Cualquier miembro
- **Quién aprueba**: Solo Admin
- **Efecto**: Se registra en el change log, puede crear nuevas tareas
- **Usado para**: Facturación de cambios de alcance

## Auditoría

Todas las operaciones importantes se registran en `auditLogs`:
- Actor (user sub)
- Acción
- Tipo y ID del recurso
- IP y User Agent
- Timestamp
- Detalles en JSON

La tabla está particionada por `createdAt` para escalabilidad.

## Testing

```bash
# Test de integración con Gateway (requiere Hurl)
npm run test:smoke:gateway
```

## Scripts Disponibles

- `npm run dev` - Desarrollo con watch
- `npm run build` - Compilar TypeScript
- `npm start` - Iniciar servidor (producción)
- `npm run db:generate` - Generar migraciones
- `npm run db:migrate` - Ejecutar migraciones
- `npm run db:push` - Push directo del schema (desarrollo)
- `npm run db:studio` - Abrir Drizzle Studio (GUI de BD)

## Estructura del Proyecto

```
mod-collab/
├── src/
│   ├── modules/
│   │   └── collab/
│   │       ├── repository/
│   │       │   ├── audit.repository.ts
│   │       │   ├── boards.repository.ts
│   │       │   ├── projects.repository.ts
│   │       │   ├── tasks.repository.ts
│   │       │   └── workspaces.repository.ts
│   │       ├── collab.controller.ts
│   │       ├── collab.repository.ts
│   │       ├── collab.routes.ts
│   │       ├── collab.schemas.ts
│   │       ├── collab.service.ts
│   │       ├── collab.types.ts
│   │       └── validated-json.ts
│   ├── shared/
│   │   └── middlewares/
│   │       ├── auth.middleware.ts
│   │       └── error-handler.middleware.ts
│   ├── openapi/
│   │   └── openapi.routes.ts
│   ├── db/
│   │   ├── connection.ts
│   │   └── schema.ts
│   ├── config/
│   │   └── env.ts
│   ├── app.ts
│   └── server.ts
├── openapi/
│   └── openapi.yaml
├── drizzle/
│   └── (migrations)
├── tests/
│   └── 01_gateway_rbac_collab.hurl
├── .env.example
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── INFO.md
├── VERIFICATION_REPORT.md
└── README.md
```

## Despliegue

### Docker

```bash
docker build -t mod-collab:latest .
docker run -p 3001:3001 --env-file .env mod-collab:latest
```

### Docker Compose

```bash
docker-compose up -d
```

## Integración con otros Módulos

### Como Caja Negra
El módulo es completamente independiente:
- Tiene su propio esquema de base de datos (`schema_collab`)
- Expone solo APIs REST públicas
- No comparte código con otros módulos
- Autenticación delegada al API Gateway

### Eventos (para desacoplamiento)
El módulo registra eventos en la tabla `auditLogs` que pueden ser consumidos por otros servicios:
- `project_created`
- `project_task_updated`
- `minor_change_requested`
- `formal_change_requested`
- `change_request_resolved`
- `project_file_approved`
- `chat_external_message_created`

**Nota**: Para notificaciones en tiempo real, implementar un sistema de eventos (ej. webhook, message queue) que lea los audit logs o se integre directamente en el servicio.

## Documentación API

Acceder a la documentación interactiva en:

**Desarrollo**: http://localhost:3001/docs

**Producción (via Gateway)**: http://localhost:8080/docs

## Soporte y Contribución

Para reportar problemas o sugerir mejoras, consultar la documentación del proyecto principal CIMA CRM.

## Licencia

Proyecto académico - CIMA CRM 2026
