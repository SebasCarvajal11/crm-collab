# AGENTS

## Purpose

`cima-contracts` owns versioned integration contracts shared between CIMA CRM services. It must remain small, explicit, and safe to publish independently.

## Fronteras con otros servicios

- **Upstream**: Ninguno (es una biblioteca compartida independiente).
- **Downstream**: Todos los microservicios de la plataforma (`crm-auth`, `crm-collab`, `crm-media`, `crm-frontend`) que consumen sus tipos o esquemas Zod.
- **Pares**: N/A.
- **Recursos Compartidos**: Ninguno.
- **Fuera de mi responsabilidad**: No implementa lógica de negocio, persistencia de datos, enrutamiento ni validación en tiempo de ejecución de las peticiones. Su único propósito es servir de catálogo estático y tipado.

## Event Versioning & Coexistence Strategy

To support independent microservice deployments, CIMA CRM employs a multi-version event coexistence strategy:

1. **Metadata Requirement**:
   - Every published event MUST include `version` (the schema version) and `contractVersion` (the version of the `@sebascarvajal11/cima-contracts` library it complies with).
2. **Explicit Consumer Declaration**:
   - Consumers MUST explicitly declare which versions of each event type they support.
   - Consumers can process multiple versions of the same event by providing explicit parsing/handler pathways.
3. **Deprecation & Retirement Policy**:
   - When a new event version is published (e.g. `vN`), the previous version (`vN-1`) is immediately marked as **deprecated** in the catalog (`EVENT_VERSION_CATALOG`).
   - Deprecated versions remain **supported** for a period of **6 months**, allowing all consumer teams to update their code.
   - After 6 months, the deprecated version is marked as **retired** and can be removed from both the contract package and consumer codebases.
4. **Metrics Tracking**:
   - Consumers MUST track event consumption metrics (processed message count by type and version) using logs and/or Redis hash keys (e.g., `metrics:events:processed`) to verify when deprecated versions can safely be retired.
5. **Compatibility Matrix & Breaking Changes**:
   - **Breaking Change Resolution**: A breaking change in a contract requires a major version bump of at least one of the two ends (typically the producer service and/or the contracts library). This must be accompanied by the temporal coexistence of both versions (e.g., dual publishing or backward-compatible parsing) to ensure no downtime or sync coordination is required during deployment.

## Architecture Rules

- Keep contracts backwards compatible within the same major version.
- Additive fields are allowed in minor versions when consumers can ignore unknown fields.
- Breaking schema changes require a major version bump and a migration note.
- Runtime validation schemas and TypeScript types must be exported from the same source file.

## Development Rules

- Use `pnpm` only. Never add `npm` commands, lockfiles, or documentation.
- Validate with `pnpm test` and `pnpm build` before publishing.
- Keep publication metadata in `package.json`; do not distribute manual `.tgz` artifacts to service repos.

## Feature Flag Lifecycle Policy

To enable safe progressive rollouts, services can utilize feature flags defined in `@sebascarvajal11/cima-contracts`. All feature flags MUST comply with the following rules:
1. **Temporal Nature**: Feature flags are temporary. No flag should remain active for more than **3 months** unless explicitly designed as a permanent operational switch (which must be documented).
2. **Ownership**: Every feature flag must declare an `owner` (team or developer name) in its metadata block.
3. **Retirement Plan**: The owner of the flag is responsible for creating a retirement task in the backlog to clean up the flag and its conditional code paths from the codebase once the feature is 100% rolled out.
4. **Periodic Review**: The engineering team will review all active feature flags on a monthly basis to identify candidates for cleanup.

## Retry and Circuit Breaker Policies

To ensure platform resilience under transient network/external failures:

1. **Exponential Backoff & Jitter**:
   - Outbound/network calls (HTTP requests to peer services, SMTP requests, Oracle Object Storage operations) MUST use the shared `withRetry` utility.
   - Default retry config: 3 max attempts, starting delay of 150ms, exponential backoff (multiplier 2), and randomized jitter to prevent thundering herd issues.
2. **Circuit Breakers**:
   - The edge layer (KrakenD API Gateway) unifies circuit breaking for all backends.
   - If a backend service fails consecutively (default 3 errors within 60s), KrakenD trips the circuit for 10s, failing fast on requests to protect the downstream service.
3. **Graceful Degradation**:
   - Critical workflows must degrade gracefully. For example, if a token verification or storage fetch fails, services should throw standard HTTP responses mapping to `DEPENDENCY_FAILED` (HTTP 503) rather than hanging or leaving processes in zombie states.


## Personal Data & Compliance Policy (PII)

To ensure compliance with data privacy regulations (e.g., GDPR), the platform adopts a distributed user deletion and anonymization policy:

1. **Decoupled Deletion**: User deletion is a distributed responsibility. The deletion of a user is initiated in the identity service (`crm-auth`), which marks the user as deleted and publishes a `user.deleted` event to the stream.
2. **Local Responsibility**: Each microservice that persists user data (or snapshots/projections thereof) is responsible for listening to `user.deleted` and performing its own local PII cleanup (either deleting records or anonymizing PII fields). The event is the signal to start, not the action itself.
3. **Scrubbing/Anonymization CLI**: Every service must expose a `pii:clean` CLI script/command (e.g., `pnpm pii:clean <userSub>`) that anonymizes or deletes the user's PII locally. This command is executed automatically on event reception and can also be triggered manually by administrators.


## "Expand and Contract" Event Migration Procedure

When evolving shared event schemas, services must follow the **Expand and Contract** pattern to allow gradual, zero-downtime upgrades:

1. **Step 1: Expand the Producer**
   - The producing service is updated to publish the event with the new optional fields, or to publish a new version of the event alongside the old version (dual-publishing).
   - In `cima-contracts`, the new fields must be declared as optional, or a new version of the event schema must be defined.
2. **Step 2: Upgrade Consumers**
   - All consuming services are updated to handle the new format (reading the new fields or parsing the new event version).
   - Consumers continue to gracefully handle the old format.
3. **Step 3: Migrate Producer to Default**
   - Once all consumers are confirmed to support the new schema/version, the producing service can be updated to make the new fields mandatory or make the new event version the default.
4. **Step 4: Contract (Cleanup)**
   - Deprecated fields are removed from the contract in `cima-contracts`, and code paths handling old versions are cleaned up from the consumers.


## Legacy Patterns Retirement & Deprecation Policy

To maintain a clean and decoupled architecture, the platform enforces a strict policy for retiring legacy patterns and configurations:

- **Policy Statement**: No deprecated pattern, file, or configuration remains in the codebase beyond its agreed retirement date.
- **Retired Patterns**:
  - **HTTP-based Identity Hydration (Retired: 2026-05-01)**: The REST endpoint `/bootstrap-identities` in `crm-auth` and HTTP-based hydration scripts are completely removed. Restoring identity snapshots must be done via the event replay-request stream (`stream:auth.identity-replay-requests`).
  - **Static Gateway BFF Configuration (Retired: 2026-05-15)**: The legacy `bff.json` configuration in the gateway is completely retired and removed. All composition logic is handled dynamically by the frontend composition layer.
  - **Legacy Endpoints Config (Retired: 2026-06-01)**: The unvalidated `endpoints.json` files are completely replaced by validated `gateway.manifest.json` manifests.
