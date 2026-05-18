# AGENTS

## Purpose

`crm-collab` is the collaboration and project-management service for CIMA CRM. It owns projects, memberships, tasks, workspace interactions, chat, notifications, and project-file metadata. It should remain the single coordination layer for collaboration rules without absorbing identity or binary-storage ownership.

## System Boundaries

- Owns project creation, membership assignment, boards, tasks, comments, chat, and collaboration-side audit data.
- Owns metadata and authorization context for project files.
- Depends on `crm-auth` for identity truth and `crm-media` for binary storage and file access execution.
- Must not duplicate auth logic, JWT issuance, or OCI binary-storage ownership that belongs elsewhere.

## Architecture Rules

- Preserve separation between transport, application logic, repositories, events, and infrastructure adapters.
- Keep controllers and route handlers thin. Business rules belong in services; persistence belongs in repositories.
- Cross-service calls to auth or media must stay behind explicit shared clients and must not leak into unrelated layers.
- Collaboration rules, visibility rules, and RBAC decisions must remain explicit and testable.
- Avoid hidden coupling to seed data, local-only ports, or one-off workflows unless they are clearly isolated in test or script code.

## Code Organization

- `src/modules/collab`: collaboration routes, controllers, services, repositories, events, and collaboration models.
- `src/shared`: infrastructure adapters, middleware, and cross-service clients.
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
