# CRM Collab

`crm-collab` is the collaboration and project-management service for CIMA CRM.

## Scope

- project lifecycle and membership
- workspace views, task boards, and task operations
- project chat and collaboration events
- project-file metadata and cross-service access coordination
- auth-aware role and permission enforcement for collaboration flows

## Local Development

```bash
pnpm install
pnpm db:push
pnpm dev
```

Useful commands:

- `pnpm db:seed`
- `pnpm db:ensure-audit-partitions`
- `pnpm build`
- `pnpm test:smoke:gateway`
- `pnpm worker:orphan-oci`
- `pnpm cleanup:orphan-oci`

Health check: `http://localhost:3001/health`

OpenAPI: `http://localhost:3001/openapi.yaml`

## Environment

Start from [`./.env.example`](./.env.example).

Required runtime areas:

- database connectivity
- `MOD_AUTH_URL`
- `MOD_MEDIA_URL`
- gateway trust settings shared with the platform
- OCI config and bucket settings for project-file flows
- cleanup intervals for orphan OCI objects

`pnpm db:seed` assumes `crm-auth` has already populated `schema_auth.users`.

## Contract and Verification

- OpenAPI source: [`./openapi/openapi.yaml`](./openapi/openapi.yaml)
- Gateway smoke test: `tests/01_gateway_rbac_collab.hurl`

For realistic validation, point the isolated gateway at this repo plus `crm-auth` and `crm-media`, then run the smoke command against that gateway.
