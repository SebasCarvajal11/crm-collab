# AGENTS

## Purpose

`crm-collab` is the collaboration and project-management service for CIMA CRM. It owns projects, memberships, tasks, workspace interactions, chat, notifications, change requests, briefs, and project-file metadata. It should remain the single coordination layer for collaboration rules without absorbing identity or binary-storage ownership.

## System Boundaries

- Owns project creation, membership assignment, boards, tasks, comments, chat, notifications, change requests, briefs, and collaboration-side audit data.
- Owns metadata and authorization context for project files.
- Depends on `crm-auth` for identity truth and `crm-media` for binary storage and file access execution.
- Depends on **Redis** for distributed event propagation (Redis Streams) and shared rate-limiting.
- Must not duplicate auth logic, JWT issuance, or OCI binary-storage ownership that belongs elsewhere.

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
