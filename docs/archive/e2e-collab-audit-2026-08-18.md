# Auditoría E2E de colaboración — 2026-08-18

## Entorno y alcance

La ejecución se hizo contra un stack Docker efímero, con PostgreSQL, Redis,
`crm-auth`, `crm-collab`, `crm-media` y KrakenD. Se recorrieron las doce suites
Hurl de colaboración y se verificaron las respuestas a través del gateway.

Resultado final tras las correcciones: las doce suites pasaron de forma completa
(138 solicitudes). La validación incluye la subida directa de un binario de
prueba, su promoción tras escaneo antivirus y el ciclo de acceso/eliminación.

- `01_gateway_rbac_collab.hurl` (11 solicitudes)
- `02_projects_crud.hurl` (12 solicitudes)
- `03_tasks_crud.hurl` (13 solicitudes)
- `04_board_columns.hurl` (10 solicitudes)
- `05_chat_messages.hurl` (13 solicitudes)
- `06_chat_mentions.hurl` (11 solicitudes)
- `07_notifications.hurl` (13 solicitudes)
- `08_change_requests.hurl` (11 solicitudes)
- `09_files_operations.hurl` (13 solicitudes)
- `10_brief_operations.hurl` (9 solicitudes)
- `11_members_management.hurl` (11 solicitudes)
- `12_timeline.hurl` (11 solicitudes)

## Defectos de producto corregidos

### E2E-COLLAB-001 — La réplica de identidad no se inicializa al arrancar

- **Prioridad:** P0
- **Componente:** `crm-auth` / worker `identity-outbox`
- **Resultado observado:** `schema_collab.user_identity_snapshots` permanece
  vacía aunque `schema_auth.users` contiene los 25 usuarios sembrados. Al crear
  un proyecto, colaboración devuelve `400 VALIDATION_ERROR: Uno o más miembros
  no existen o aún no están disponibles`.
- **Evidencia:** el worker registra `Redis no disponible; omitiendo listener de
  replay requests` pese a tener `REDIS_URL=redis://redis:6379` y Redis saludable.
- **Impacto:** no se pueden crear proyectos ni añadir miembros tras un despliegue
  limpio, hasta que la réplica se rellene manualmente.
- **Causa probable:**
  `src/workers/identity-outbox.worker.ts` obtiene la conexión Redis y empieza el
  listener sin inicializarla con `initRedis(env.REDIS_URL)`.
- **Corrección aplicada:** el worker ahora exige `REDIS_URL` e inicializa su
  conexión Redis antes de arrancar. En un despliegue limpio procesó y publicó
  los 25 snapshots de identidad sin intervención manual.

### E2E-COLLAB-002 — El worker del outbox de colaboración nunca publica eventos

- **Prioridad:** P0
- **Componente:** `crm-collab` / worker `collab-outbox`
- **Resultado observado:** después de los flujos E2E había 71 eventos con estado
  `pending` en `schema_collab.collab_outbox`; ninguno se publicó.
- **Evidencia:** el worker registra cada cinco segundos
  `[runCollabOutbox] Redis connection not available`, aunque su contenedor tiene
  `REDIS_URL=redis://redis:6379` y Redis está sano.
- **Impacto:** eventos de proyecto, tareas, chat y solicitudes quedan sin
  distribución asíncrona. Las notificaciones que dependan del consumidor del
  stream no tienen garantía de entrega.
- **Causa probable:** el entrypoint del worker tampoco inicializa la conexión
  Redis antes de ejecutar `runCollabOutbox`.
- **Corrección aplicada:** el worker inicializa Redis al arrancar. Tras las
  pruebas, los 116 eventos de `collab_outbox` quedaron en estado `published`.

### E2E-COLLAB-003 — Actualizar un proyecto agota el timeout del gateway

- **Prioridad:** P1
- **Componente:** actualización de proyecto / gateway
- **Resultado observado:** `PATCH /api/v1/collab/projects/:projectId` no responde
  dentro de 30 segundos. KrakenD devuelve `500 context deadline exceeded`.
- **Evidencia:** reproducido en `02_projects_crud.hurl`, después de crear un
  proyecto válido. El gateway registró exactamente `30.000s` para el PATCH.
- **Impacto:** el usuario no puede editar datos de un proyecto de forma fiable;
  la respuesta puede ser un error aunque la transacción termine después.
- **Causa raíz y corrección aplicada:** el proxy `collabEvents` descartaba la
  transacción recibida. El evento se despachaba antes del commit y el manejador
  de notificaciones esperaba un bloqueo creado por la propia transacción. El
  proxy ahora propaga la transacción al outbox; el PATCH respondió en 11 ms.

### E2E-COLLAB-004 — El gateway no exponía la consulta individual de proyecto

- **Prioridad:** P1
- **Resultado observado:** `GET /api/v1/collab/projects/:projectId` provocaba
  un pánico del router de KrakenD en vez de devolver 404.
- **Corrección aplicada:** se implementó el endpoint con comprobación de
  membresía y se registró de forma consistente en OpenAPI y el manifest. Un
  identificador inexistente devuelve ahora 404.

## Desalineaciones E2E corregidas

Estas suites llegan a endpoints válidos, pero sus aserciones o payloads usan un
contrato anterior. Deben actualizarse contra OpenAPI antes de poder contarlas
como cobertura real.

| Suite | Desalineación observada |
| --- | --- |
| `09_files_operations.hurl` | Actualizado al contrato vigente y ampliado para realizar la subida real antes de registrar metadatos. |
| `10_brief_operations.hurl` | Envía `content`; `BriefPatchSchema` exige `body`. |
| `11_members_management.hurl` | Actualizado a `data.userSub` y a la regla de seguridad que impide elevar un worker a admin local. |
| `12_timeline.hurl` | Espera `data.items`; los endpoints de timeline devuelven directamente el arreglo en `data`. |

El brief permite ahora la edición a administradores y trabajadores que son
miembros del proyecto; los clientes permanecen sólo con lectura.

## Mejora de infraestructura de pruebas aplicada

`scripts/run-contract-test.mjs` ahora descubre todos los archivos `.hurl` de
`tests/` y continúa después de un fallo para informar todas las suites afectadas,
en vez de ejecutar sólo tres pruebas y detenerse en el primer error.
