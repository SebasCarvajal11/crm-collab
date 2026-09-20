# Base de Datos y Persistencia: `crm-collab`

Este documento detalla el esquema en PostgreSQL (`schema_collab`), el catálogo de tablas, los índices de optimización y el procedimiento de migraciones continuas sin downtime.

---

## 1. Esquema Dedicado: `schema_collab`

Toda la persistencia de colaboración reside dentro del esquema aislado `schema_collab` en la base de datos `crm_database`.

### Catálogo de Tablas Principales

| Categoría | Tablas | Propósito |
| :--- | :--- | :--- |
| **Proyectos** | `projects`, `project_members` | Datos maestros del proyecto y membresías con rol local (`admin`, `worker`, `client`). |
| **Tablero Kanban** | `project_task_columns`, `project_tasks`, `project_subtasks`, `project_task_assignees`, `project_task_comments` | Columnas, tareas, orden, subtareas, asignaciones múltiples y discusiones de tareas. |
| **Mensajería** | `project_chat_messages`, `project_chat_mentions`, `project_chat_message_reads` | Mensajes internos/externos, menciones directas y marcas temporales de lectura. |
| **Notificaciones**| `project_mention_notifications`, `project_activity_notifications` | Alertas dirigidas a la campana del usuario en la barra lateral. |
| **Entregables** | `project_files`, `media_access_cache` | Metadatos de archivos, aprobaciones de cliente y caché de tokens de pre-firma. |
| **Contratos** | `project_contracts`, `project_contract_amendments` | Contratos principales y otrosíes firmados digitalmente. |
| **Brief y Cambios**| `project_briefs`, `project_brief_change_log`, `project_change_requests` | Alcance formal, historial de modificaciones y solicitudes menores/formales. |
| **Identidad / Read**| `user_identity_snapshots` | **Réplica local desnormalizada** de usuarios sincronizada desde `crm-auth`. |
| **Infraestructura**| `collab_outbox`, `audit_logs`, `schema_version` | Eventos pendientes de publicar a Redis, logs de auditoría y control de versiones. |

---

## 2. Réplica Local de Identidad (`user_identity_snapshots`)

Para permitir búsquedas inmediatas de miembros, autocompletado en menciones y validación de nombres sin consultar a `crm-auth`:
- La tabla `schema_collab.user_identity_snapshots` almacena una copia desnormalizada de `subject`, `email`, `role`, `firstName`, `lastName`.
- Se alimenta exclusivamente de los eventos emitidos en `stream:auth.identity`.
- Los datos son de solo lectura para el microservicio de colaboración.

---

## 3. Protocolo de Migración Sin Downtime (Expand & Contract)

Para garantizar compatibilidad con los despliegues Blue/Green de producción:

1. **Expand**: Toda nueva columna debe ser `NULLABLE` o incluir un valor `DEFAULT`.
2. **Backfill**: Migraciones de datos o transformaciones se ejecutan mediante scripts en segundo plano.
3. **Contract**: Se retiran columnas o restricciones deprecadas únicamente cuando la versión anterior del servicio ha sido completamente decomisionada del slot secundario.

---

## 4. Scripts y Comandos Útiles

| Comando | Descripción |
| :--- | :--- |
| `pnpm db:push` | Sincroniza las definiciones de Drizzle ORM hacia `schema_collab`. |
| `pnpm db:bootstrap` | Ejecuta la inicialización idempotente del esquema y permisos. |
| `pnpm db:seed` | Carga proyectos, tareas y miembros de prueba en desarrollo. |
| `pnpm db:studio` | Inicia la interfaz web interactiva Drizzle Studio en local. |
