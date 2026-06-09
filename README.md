# CRM Collab

> Servicio de gestión de proyectos y colaboración para CIMA CRM.

## Propósito

`crm-collab` gestiona el ciclo de vida de proyectos, membresías, tableros de tareas, chat y coordinación de archivos multimedia. Consume eventos de identidad de `crm-auth` via Redis Streams y coordina operaciones de archivos con `crm-media` via comandos asíncronos firmados con JWT de servicio. No almacena binarios ni credenciales OCI.

## Entorno

```bash
cp .env.example .env
# Completar: DATABASE_URL, REDIS_URL, JWKS_URI, SERVICE_JWT_PRIVATE_KEY
```

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| `DATABASE_URL` | Conexión PostgreSQL (`schema_collab`) | ✅ |
| `REDIS_URL` | Redis para streams de eventos y outbox | ✅ |
| `JWKS_URI` | URL del JWKS de `crm-auth` para validar JWTs | ✅ |
| `SERVICE_JWT_PRIVATE_KEY` | Clave RSA privada para firmar comandos a `crm-media` | ✅ |
| `AUTH_EVENTS_STREAM_KEY` | Stream Redis de eventos de identidad | ✅ |
| `SERVICE_VERSION` | Versión semver del servicio | ✅ |

Ver [`.env.example`](./.env.example) para la lista completa.

## Local

```bash
pnpm install
pnpm db:bootstrap             # crear schema_collab y rol en Postgres
pnpm db:push                  # aplicar migraciones Drizzle
pnpm dev                      # servidor con hot-reload en :3001
```

Endpoints útiles:

- Health: `http://localhost:3001/health`
- Métricas: `http://localhost:3001/metrics`
- Service JWKS: `http://localhost:3001/.well-known/service-jwks.json`
- OpenAPI: `http://localhost:3001/openapi.yaml`

Workers (procesos separados):

```bash
pnpm worker:collab-outbox     # publica eventos de collab a Redis Stream
```

Utilidades:

```bash
pnpm dlq:auth:list            # listar entradas en DLQ de auth events
pnpm dlq:auth:replay          # reintentar entrada específica del DLQ
pnpm db:seed                  # datos de prueba (requiere snapshots hidratados)
```

## Auth Events DLQ

Si un evento de identidad falla tras `AUTH_EVENTS_MAX_RETRIES` reintentos, se escribe a la DLQ en Redis con metadata completa (payload, stacktrace, delivery count). El mensaje original solo se ACK después de que la escritura en DLQ tenga éxito.

```bash
pnpm dlq:auth:list -- --limit 25
pnpm dlq:auth:replay -- --id <dlq-entry-id>
```

## Deploy

```bash
# Desde crm-infra/
./deploy/remote/deploy-component.sh collab
```

Ver [crm-infra/ONBOARDING.md](../crm-infra/ONBOARDING.md).

## Tests

```bash
pnpm test:unit      # unitarios Vitest
pnpm test           # smoke Hurl contra gateway local
```

## Contrato público

- OpenAPI: [`openapi/openapi.yaml`](./openapi/openapi.yaml)
- Gateway manifest: [`gateway/gateway.manifest.json`](./gateway/gateway.manifest.json)
- Service JWKS: `/.well-known/service-jwks.json` (para verificación por `crm-media`)
