# AGENTS.md — mod-collab

> Microservicio de Colaboración Kanban para CRM CIMA. Lee esto ANTES de generar código.

## Stack

| Capa | Tecnología |
|---|---|
| Runtime | Node.js + ESM |
| Framework | Hono (`@hono/node-server`) |
| Lenguaje | TypeScript (`strict: true`, `module: "ESNext"`, `moduleResolution: "bundler"`) |
| Base de datos | PostgreSQL, schema `schema_collab` |
| ORM | Drizzle ORM |
| Validación | Zod + `@hono/zod-validator` |
| Gateway | KrakenD (JWT validado en gateway, claims propagados como headers) |
| Almacenamiento | Oracle Cloud Object Storage (S3-compatible via `@aws-sdk/client-s3`) |

## Responsabilidad

- Proyectos (CRUD, workspace, miembros)
- Tablero Kanban (columnas, tareas, drag & drop)
- Chat interno (admin/worker) y externo (con cliente)
- Gestión de archivos (upload, aprobación, versionado)
- Briefs del proyecto
- Change requests (minor/formal)
- Auditoría de acciones

**NO es responsable de:** autenticación, credenciales, JWT, invitaciones, email. Eso es `mod-auth`.

## Arquitectura

```
routes → controller → service → repository → Drizzle → PostgreSQL
```

- **Routes:** 30 endpoints, validación Zod en edge
- **Controller:** Mapeo HTTP, composición de handlers
- **Service:** Lógica de negocio + RBAC (928 líneas, un solo archivo)
- **Repository:** Queries Drizzle, composición via spread de 2 sub-repositories

### RBAC

**Roles globales** (del JWT via gateway): `admin | worker | client`

**Helper functions en el service:**
- `canManageProject(globalRole, memberRole?)` — admin global o admin member
- `canMoveTasks(globalRole, memberRole?)` — admin global o admin/worker member
- `canInternalChat(globalRole, memberRole?)` — admin global o admin/worker member

**Reglas clave:**
- Client solo ve tareas con `isClientVisible = true`
- Client no puede crear proyectos ni subir a chat interno
- Admin puede gestionar miembros, columnas, y aprobar archivos

## Estructura de archivos

```
src/
├── server.ts                       # Bootstrap + graceful shutdown
├── app.ts                          # Hono app, CORS, routes
├── config/
│   └── env.ts                      # Zod env schema
├── db/
│   ├── connection.ts               # Pool + drizzle instance
│   ├── schema.ts                   # 11 tablas + 10 enums en schema_collab
│   └── seed.ts                     # 12 proyectos de ejemplo
├── modules/collab/
│   ├── collab.routes.ts            # 31 endpoints
│   ├── collab.controller.ts        # Request/response mapping
│   ├── collab.service.ts           # Business logic + RBAC
│   ├── collab.repository.ts        # Composición (spread de 2 repos)
│   ├── collab.schemas.ts           # 17 Zod schemas
│   ├── collab.types.ts             # Drizzle inferred types
│   ├── validated-json.ts           # Typed body/query helpers
│   ├── repository/
│   │   ├── projects.repository.ts  # 40+ Drizzle query functions
│   │   └── audit.repository.ts     # Audit log insert
│   └── events/
│       ├── event-emitter.ts        # Custom EventEmitter
│       ├── event.types.ts          # 21 event types + 9 payload interfaces
│       └── index.ts                # Setup + re-exports
└── shared/
    ├── storage/
    │   └── oci-storage.ts          # OCI Object Storage wrapper (S3Client)
    └── middlewares/
        ├── auth.middleware.ts       # Gateway header trust + JWT fallback
        └── error-handler.middleware.ts  # AppError hierarchy + onError
```

## Base de datos (11 tablas)

Todas en `pgSchema("schema_collab")`. 10 enums personalizados.

| Tabla | Propósito |
|---|---|
| `projects` | Proyectos con status, progreso, tipo |
| `project_members` | Miembros con rol (admin/worker/client) |
| `project_task_columns` | Columnas del Kanban (config por tipo de proyecto) |
| `project_tasks` | Tareas con prioridad, assignee, checklist |
| `project_task_assignees` | Múltiples asignados por tarea (M2M) |
| `project_task_comments` | Comentarios en tareas |
| `project_chat_messages` | Chat interno/externo/system |
| `project_files` | Archivos con versionado y aprobación |
| `project_briefs` | Brief del proyecto (1:1 con project) |
| `project_change_requests` | Change requests minor/formal |
| `project_brief_change_log` | Log de cambios al brief |
| `audit_logs` | Auditoría de acciones |

### Columnas por defecto

**Campaign Service (6):** Pendiente → Haciendo → Revisión Interna → Aprobación Cliente → Bloqueado → Hecho

**Product Order (7):** Pendiente → Arte Aprobado → En Producción → Control de Calidad → Enviado → Completado → Esperando Material

## Variables de entorno

| Variable | Requerida | Default | Descripción |
|---|---|---|---|
| `DATABASE_URL` | Sí | — | PostgreSQL connection string |
| `PORT` | No | `3001` | Puerto HTTP |
| `TRUST_GATEWAY_JWT_HEADERS` | No | `true` | Confía en headers X-User-* del gateway |
| `GATEWAY_TRUST_SECRET` | Si trust=true | — | Secreto compartido con KrakenD |
| `JWT_PUBLIC_KEY` | Si trust=false | — | RS256 pública para fallback |
| `NODE_ENV` | No | `development` | `development` / `production` / `test` |
| `OCI_NAMESPACE` | Sí | — | Namespace del tenancy Oracle Cloud |
| `OCI_REGION` | Sí | — | Región OCI (ej: `sa-saopaulo-1`) |
| `OCI_ACCESS_KEY` | Sí | — | Customer Secret Key ID |
| `OCI_SECRET_KEY` | Sí | — | Customer Secret Key |
| `OCI_BUCKET` | Sí | — | Nombre del bucket Object Storage |

## Reglas absolutas

### HACER SIEMPRE
- Validar payloads en el edge con `zValidator("json", Schema)`
- Usar Repository Pattern — queries Drizzle solo en `repository/*.ts`
- Responder `{ data: {...} }` en éxito, `{ error: "..." }` en error
- Usar `AppError` subclasses (del shared/middlewares/error-handler)
- Setear `updatedAt: new Date()` explícitamente en updates
- Importar `relations` de `"drizzle-orm"`, NO de `"drizzle-orm/pg-core"`
- Crear tablas solo en `pgSchema("schema_collab")`

### NUNCA HACER
- Usar `any` — usar `z.infer<>` o `InferSelectModel`/`InferInsertModel`
- Poner queries Drizzle en controllers o services
- Lanzar `new Error(...)` — siempre `AppError` subclasses
- Filtrar stack traces al cliente
- Duplicar verificación de JWT (el gateway ya lo hace)

### Clases de error disponibles
```typescript
BadRequestError(400) | UnauthorizedError(401) | ForbiddenError(403)
NotFoundError(404) | ConflictError(409) | TooManyRequestsError(429)
```

## Sistema de eventos

EventEmitter custom en `events/`. 21 tipos de evento:

| Categoría | Eventos |
|---|---|
| Proyecto | `project.created`, `project.updated`, `project.completed`, `project.member.added` |
| Tarea | `task.created`, `task.updated`, `task.moved`, `task.assigned` |
| Chat | `chat.message.internal`, `chat.message.external`, `chat.mention` |
| Change Requests | `change_request.minor.*`, `change_request.formal.*` |
| Archivos | `file.uploaded`, `file.approved`, `file.deleted` |
| Brief | `brief.updated` |

## Scripts

| Comando | Propósito |
|---|---|
| `npm run dev` | Servidor con hot-reload |
| `npm start` | Producción |
| `npm run db:push` | Push schema a DB |
| `npm run db:seed` | 12 proyectos de ejemplo |
| `npm run test:smoke:gateway` | Smoke test via Hurl |

## Gateway Integration

KrakenD valida JWT y propaga claims como headers `X-User-Sub`, `X-User-Id`, `X-User-Role`, `X-User-Email`. El módulo confía en estos headers solo si `X-Gateway-Trust` coincide con `GATEWAY_TRUST_SECRET`. Fallback opcional: verificación RS256 directa con `JWT_PUBLIC_KEY`.

**URLs del gateway (topología oculta):** El frontend NO usa `/collab/projects`. Usa `/projects`. El gateway mapea internamente.

## Almacenamiento de archivos

Los archivos se almacenan en **Oracle Cloud Object Storage** (S3-compatible). PostgreSQL solo guarda metadata (nombre, path, mime, tamaño). El `storagePath` sigue el patrón:

```
projects/{projectId}/tasks/{taskId}/{filename}
```

**Endpoints:**
- `POST /projects/:projectId/tasks/:taskId/files` — Upload (multipart, max 25 MB)
- `GET /files/:fileId/download` — Download (stream desde OCI)
- `DELETE /files/:fileId` — Elimina de OCI + DB (solo creador o admin)

**Flujo:** Controller recibe multipart → pasa Buffer al service → service sube a OCI con `PutObjectCommand` → guarda metadata en DB.
