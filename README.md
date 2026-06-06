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
- `pnpm dlq:auth:list`
- `pnpm dlq:auth:replay -- --id <dlq-entry-id>`

Health check: `http://localhost:3001/health`

OpenAPI: `http://localhost:3001/openapi.yaml`

## Environment

Start from [`./.env.example`](./.env.example).

Required runtime areas:

- database connectivity
- Redis auth identity events (`AUTH_EVENTS_STREAM_KEY`, `AUTH_EVENTS_CONSUMER_GROUP`)
- Redis auth identity DLQ (`AUTH_EVENTS_MAX_RETRIES`, `AUTH_EVENTS_PENDING_IDLE_MS`, `COLLAB_EVENTS_DLQ_STREAM_KEY`)
- Redis media command streams (`MEDIA_COMMANDS_STREAM_KEY`, `MEDIA_RESPONSES_STREAM_KEY`, `MEDIA_RESPONSES_CONSUMER_GROUP`)
- gateway trust settings shared with the platform
- document upload URL TTL requested from `crm-media` (`DOC_PAR_TTL_SECONDS`)

Project-file binaries are owned by `crm-media`; `crm-collab` stores collaboration metadata and coordinates media operations through Redis command streams. It must not require OCI or antivirus configuration at runtime.

`pnpm db:seed` assumes `schema_collab.user_identity_snapshots` has been hydrated by Redis auth events or by the explicit bootstrap command `pnpm hydrate:identity-snapshots`.

## Auth Events DLQ

Identity events from `crm-auth` are consumed through Redis Streams. If an event cannot be processed after `AUTH_EVENTS_MAX_RETRIES`, or if the payload is malformed, `crm-collab` writes it to `COLLAB_EVENTS_DLQ_STREAM_KEY` with the original stream id, payload, raw fields, delivery count, consumer id, timestamp, and error metadata. The original message is acknowledged only after the DLQ write succeeds.

Operational commands:

```bash
pnpm dlq:auth:list -- --limit 25
pnpm dlq:auth:replay -- --id <dlq-entry-id>
pnpm dlq:auth:replay -- --id <dlq-entry-id> --keep
```

`dlq:auth:replay` republishes the stored payload to the original auth event stream and removes the DLQ entry after a successful replay. Use `--keep` when you need to preserve the DLQ record for audit while testing a replay. Redis must run with persistence enabled in shared environments; otherwise DLQ entries are lost on Redis restart.

## Contract and Verification

- OpenAPI source: [`./openapi/openapi.yaml`](./openapi/openapi.yaml)
- Gateway smoke test: `tests/01_gateway_rbac_collab.hurl`

For realistic validation, point the isolated gateway at this repo plus `crm-auth` and `crm-media`, then run the smoke command against that gateway.
