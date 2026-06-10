# @sebascarvajal11/cima-contracts

> Contratos de integración versionados para los microservicios de CIMA CRM.

## Propósito

`cima-contracts` es la librería de contratos compartidos del ecosistema CIMA CRM. Define los schemas Zod (validados en runtime), tipos TypeScript y utilidades de integración que garantizan compatibilidad entre servicios. Es la **única fuente de verdad** para:

- Esquemas de eventos de dominio (auth identity, collab projects, media assets)
- Convenciones de nombres de Redis Streams
- Matriz de compatibilidad de versiones de eventos
- Helper de consumo de streams (`RedisStreamConsumer`)
- Helper de métricas Prometheus (`createServiceMetrics`)
- Respuesta estándar de health check (`buildHealthResponse`)
- Catálogo de errores HTTP estandarizados

## Versionado semver

| Tipo de cambio | Versión | Ejemplo |
|----------------|---------|---------|
| Bugfix sin impacto en payloads | patch | `0.2.0 → 0.2.1` |
| Campo nuevo backward-compatible | minor | `0.2.0 → 0.3.0` |
| Cambio de tipo, campo eliminado | major | `0.2.0 → 1.0.0` |

Los consumidores deben pinear una versión exacta en sus `package.json`.

## Instalación

```bash
# En cada servicio consumidor (requiere autenticación con GitHub Packages)
pnpm add @sebascarvajal11/cima-contracts@0.3.1
```

Configurar `.npmrc` en el servicio consumidor:

```
@sebascarvajal11:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN_CIMA}
```

## Subpaths disponibles

| Subpath | Descripción |
|---------|-------------|
| `@.../cima-contracts` | Re-export de todos los contratos (sin `metrics`) |
| `@.../cima-contracts/health` | `buildHealthResponse`, tipos `HealthResponse` |
| `@.../cima-contracts/event-consumer` | `RedisStreamConsumer`, `NonRetryableStreamError` |
| `@.../cima-contracts/metrics` | `createServiceMetrics`, `httpMetricsMiddleware` |
| `@.../cima-contracts/jwks` | `JwksClient` para validación de JWTs |
| `@.../cima-contracts/stream-conventions` | Nombres canónicos de Redis Streams |
| `@.../cima-contracts/auth-identity-events` | Schemas de eventos de identidad |
| `@.../cima-contracts/collab-project-events` | Schemas de eventos de proyectos |
| `@.../cima-contracts/media-asset-events` | Schemas de comandos y respuestas de media |

## Desarrollo local

```bash
pnpm install
pnpm test         # type-check (tsc --noEmit)
pnpm build        # compilar a dist/
pnpm pack:dry-run # verificar qué se publicaría
```

## Publicación

La publicación es automática al crear un tag `v*` en GitHub. El CI ejecuta `pnpm test && pnpm build && pnpm publish`.

> **No copiar** el `.tgz` generado dentro de los servicios. Usar siempre el registro de GitHub Packages.

## Catálogo de errores

| Categoría | HTTP | Descripción |
|-----------|------|-------------|
| `VALIDATION_ERROR` | 400 | Payload falló validación de schema |
| `UNAUTHORIZED` | 401 | Credenciales ausentes o inválidas |
| `FORBIDDEN` | 403 | Autenticado pero sin permisos |
| `NOT_FOUND` | 404 | Recurso no existe |
| `CONFLICT` | 409 | Conflicto con estado actual |
| `RATE_LIMIT_EXCEEDED` | 429 | Límite de requests excedido |
| `DEPENDENCY_FAILED` | 503 | Dependencia upstream/downstream falló |
| `INTERNAL_SERVER_ERROR` | 500 | Error no manejado |
