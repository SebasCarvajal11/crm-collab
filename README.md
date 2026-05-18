## CRM Collab

Servicio de colaboracion y gestion de proyectos de CIMA CRM.

## Desarrollo

```bash
pnpm install
pnpm dev
```

Health check: `http://localhost:3001/health`

OpenAPI: `http://localhost:3001/openapi.yaml`

## Dependencias externas

Este repo no vive solo. Para un arranque local coherente necesita:

- `crm-auth` en `MOD_AUTH_URL`
- `crm-media` en `MOD_MEDIA_URL`
- Postgres compartido con `schema_collab`
- configuracion OCI local valida
- `GATEWAY_TRUST_SECRET` igual al de `crm-infra` y `crm-auth`

## Variables de entorno

Parte de `.env.example` y define al menos:

- `DATABASE_URL`
- `PORT`
- `CORS_ORIGIN`
- `MOD_AUTH_URL`
- `MOD_MEDIA_URL`
- `TRUST_GATEWAY_JWT_HEADERS`
- `GATEWAY_TRUST_SECRET`
- `OCI_CONFIG_FILE_PATH`
- `OCI_CONFIG_PROFILE`
- `OCI_REGION`
- `OCI_BUCKET`
- `DOC_PAR_TTL_SECONDS`
- `OCI_PAR_PRUNE_MAX`
- `OCI_ORPHAN_GRACE_MS`
- `OCI_ORPHAN_CLEANUP_INTERVAL_MS`

## Base de datos

```bash
pnpm db:push
pnpm db:seed
pnpm db:studio
pnpm db:ensure-audit-partitions
```

`pnpm db:seed` asume que `crm-auth` ya pobló `schema_auth.users`.

## Workers y mantenimiento

```bash
pnpm worker:orphan-oci
pnpm cleanup:orphan-oci
```

## Pruebas

Build:

```bash
pnpm build
```

Smoke via gateway:

```bash
pnpm test:smoke:gateway
```

Para una validacion real del repo extraido, apunta el gateway a esta instancia y a `crm-auth`, luego ejecuta el Hurl contra ese gateway aislado.
