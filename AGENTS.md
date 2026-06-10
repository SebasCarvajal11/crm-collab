# AGENTS

## Purpose

`crm-collab` is the collaboration and project-management service for CIMA CRM. It owns projects, memberships, tasks, workspace interactions, chat, notifications, change requests, briefs, and project-file metadata. It should remain the single coordination layer for collaboration rules without absorbing identity or binary-storage ownership.

## System Boundaries

- Owns project creation, membership assignment, boards, tasks, comments, chat, notifications, change requests, briefs, and collaboration-side audit data.
- Owns metadata and authorization context for project files.
- Depends on `crm-auth` for identity truth and `crm-media` for binary storage and file access execution.
- Depends on **Redis** for distributed event propagation (Redis Streams) and shared rate-limiting.
- Must not duplicate auth logic, JWT issuance, or OCI binary-storage ownership that belongs elsewhere.

## Fronteras con otros servicios

- **Upstream**: `crm-auth` (para validar la firma de tokens JWT mediante su JWKS y para consumir eventos de identidad).
- **Downstream**: `crm-media` (a través de comandos de manipulación de archivos y solicitud de pre-firmas) y `crm-frontend` (vistas de colaboración).
- **Pares**: `crm-auth` (sincroniza snapshots de identidad), `crm-media` (interactúa enviando comandos a `stream:collab.media-commands` y recibiendo respuestas en `stream:media.asset-responses`).
- **Recursos Compartidos**: PostgreSQL (`schema_collab` schema) y Redis (para subscripción a `stream:auth.identity`, publicación de `stream:collab.events` y comandos en `stream:collab.media-commands`).
- **Fuera de mi responsabilidad**: Autenticación de usuarios, emisión de JWT, almacenamiento binario de archivos físicos en OCI Object Storage (responsabilidad de `crm-media`), escaneo de virus/malware.

## Architecture Rules

- Preserve separation between transport, application logic, repositories, events, and infrastructure adapters.
- Keep controllers and route handlers thin. Business rules belong in services; persistence belongs in repositories.
- **Never reintroduce god objects.** If a service or repository exceeds 250 lines, split it into feature-specific sub-modules under the collab domain.
- Cross-service calls to auth or media must stay behind explicit shared clients and must not leak into unrelated layers.
- Collaboration rules, visibility rules, and RBAC decisions must remain explicit and testable.
- Avoid hidden coupling to seed data, local-only ports, or one-off workflows unless they are clearly isolated in test or script code.

## Event Architecture

- The event system is backed by **Redis Streams** (`RedisStreamsEventBus`) when `REDIS_URL` is present.
- If Redis is unavailable, it falls back transparently to an in-memory bus (`InMemoryEventBus`) for local development.
- All feature services emit domain events via the centralized `events/index.ts` barrel.
- Handlers register on the bus instance returned by `getEventBus()`. Events are dispatched locally for low latency and also published to the stream for cross-node propagation.

## Code Organization

### Module structure
- `src/modules/collab`: root barrel (`index.ts`) that mounts all feature sub-routers under `/collab`.
  - `shared/`: cross-cutting helpers inside the module (db types, RBAC guards, upload helpers, mappers, project-access assertions).
  - `events/`: event bus contract (`event-bus.port.ts`), Redis Streams implementation, in-memory fallback, event types, and factory barrel.
  - `application/`: lightweight domain orchestration (e.g. `project-summary-sync.ts`).
  - `repository/`: `audit.repository.ts` (used transversally by all feature services).
  - `project/`: project CRUD, workspace/board queries, timeline.
  - `member/`: project membership management.
  - `board/`: task columns, tasks, subtasks, task assignees, task comments, task files.
  - `chat/`: internal/external project chat, message reads.
  - `notification/`: mention notifications.
  - `change-request/`: minor and formal change requests.
  - `file/`: project-level file metadata, approvals, pre-signed upload flow.
  - `brief/`: project brief and change log.
- `src/shared`: infrastructure adapters, middleware, cross-service clients, and Redis utilities.
- `src/db`: schema, seed, and audit-partition support owned by this service.
- `src/workers` and `src/jobs`: background cleanup workflows.
- `openapi/`: published API contract for the service.
- `tests/`: gateway-oriented contract and RBAC smoke coverage.

## Security and Operational Rules

- Never commit real OCI configs, private keys, or secret material.
- Keep gateway trust handling aligned with the rest of the platform and do not silently weaken token verification assumptions.
- Project-file metadata and orphan cleanup flows must remain consistent with `crm-media` ownership of binary objects.
- Cross-service failure modes should fail clearly and avoid silent partial success when collaboration state would become inconsistent.

## Development Rules

- Use `pnpm` only. Never add `npm` commands, lockfiles, or documentation.
- Keep documentation minimal: only `README.md` and this file.
- Preserve the gateway smoke test when changing external behavior, and extend it when RBAC or collaboration contracts change.
- If future modules integrate with collaboration, document the boundary here instead of adding scattered operational notes.

## Workers and Background Processes

`crm-collab` manages one background worker process:

1. **Collab Outbox Worker** (`pnpm worker:collab-outbox`): Polling publisher that processes collaboration outbox events.
   - *Dependencies*: PostgreSQL (`schema_collab` schema, `collab_outbox` table), Redis (publishes to `stream:collab.events`).

### Healthcheck and Graceful Shutdown
- **Healthcheck**: The worker writes its status and dependencies health report to `/tmp/worker-healthy` every 15 seconds. Checked inside Docker using `docker-healthcheck.sh`.
- **Graceful Shutdown (Draining)**: The worker handles `SIGINT` and `SIGTERM` signals. It stops the tick timer, releases the database and Redis clients, and then exits.

## Configuration and Environment Variables

- **Contract Source of Truth**: The sole source of truth for the service configuration contract is [.env.example](file:///D:/BACKUP CELULAR OLIMPO/crm-collab/.env.example). No production secrets or specific environment parameters should be committed.
- **Fail-Fast Validation**: All environment variables are parsed and validated at startup using `src/config/env.ts`. The process will exit immediately with code 1 if any required environment variable is missing or malformed.
- **Deployment Injection**: Production variables are injected dynamically from a secure orchestrator into `.env` or the container environment at deployment time.


## Testing Levels and Isolation

- **Nivel 1: Pruebas Unitarias** (`pnpm test:unit`): Pruebas unitarias que validan la lógica interna del dominio de colaboración sin requerir bases de datos, Redis ni dependencias de red. Se ejecutan de forma aislada en el pipeline del repositorio.
- **Nivel 2: Pruebas de Contrato Local**: Pruebas de integración locales que requieren únicamente la base de datos (esquema `schema_collab`) y Redis local, sin levantar `crm-auth` ni otros microservicios.
- **Nivel 3: Pruebas de Integración Cruzada**: Pruebas Hurl (e.g. `01_gateway_rbac_collab.hurl`) que validan la interoperabilidad y enrutamiento con el API Gateway y requieren que `crm-auth` y `crm-collab` estén ejecutándose simultáneamente. Son orquestadas a nivel de plataforma por `crm-infra` en la suite global de pruebas de contrato.


## Database Schema Migration Procedure (Expand & Contract)

To ensure zero-downtime deployments where old and new versions of a service run concurrently (such as during Blue/Green deployments), database migrations must never contain breaking changes:

1. **Non-Breaking Changes Only**: Every migration must be backward-compatible. Do not rename columns, remove columns, or add non-nullable columns without default values.
2. **Adding a Column (Expand)**:
   - Add the column as nullable or with a default value.
   - Deploy the new service version to write to both the old and new columns, or migrate data in the background.
3. **Changing a Column/Type**:
   - Create a new column with the target type.
   - Update the code to read/write to both columns.
   - Run a background script to backfill data from the old column to the new column.
   - Update the code to read from the new column only.
4. **Removing/Renaming a Column (Contract)**:
   - Mark the column as deprecated in the schema code (e.g., comments).
   - Deploy code that does not reference the old column name.
   - Once the old code is completely retired, run a cleanup migration to drop/rename the column.

## Observabilidad

- **Health**: `GET /api/v1/health` — estado de DB y Redis. Devuelve `{ status, version, uptimeSec, dependencies }`.
- **Métricas**: `GET /api/v1/metrics` — Prometheus text/plain (prom-client). Incluye:
  - `http_requests_total`, `http_request_duration_seconds`, `http_errors_5xx_total`
  - `worker_outbox_depth{worker="collab-outbox"}` — pendientes en `collab_outbox` DB
  - Métricas de Node.js por defecto (heap, event loop lag, GC)
- **Logs**: pino → Loki via promtail (label `service=crm-collab`)
- **Dashboard**: Grafana http://localhost:13000 → "CIMA CRM — Overview"

## Patrones retirados

| Patrón | Retirado | Motivo |
|--------|----------|--------|
| `GATEWAY_TRUST_SECRET` / `gatewayTrustMiddleware` | 2026-05-15 | Eliminado; validación JWKS directa |
| `MEDIA_COMMAND_SECRET` (HMAC) | 2026-06-01 | Reemplazado por JWT de servicio firmado con clave RSA por par |
| `crm-bff` como downstream | 2026-06-01 | `crm-bff` fue eliminado del stack |
