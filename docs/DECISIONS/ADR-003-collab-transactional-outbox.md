# ADR-003: Publicación Confiable con Patrón Transactional Outbox

- **Estado**: Aceptado
- **Fecha**: 2026-06-25
- **Autores**: Equipo de Arquitectura CIMA

---

## Contexto y Planteamiento del Problema

Cuando ocurre una acción de negocio relevante en `crm-collab` (creación de proyecto, cambio de columna de tarea, nuevo mensaje en chat), la base de datos relacional debe actualizarse y, al mismo tiempo, notificarse a otros componentes a través de Redis Streams (`stream:collab.events`).

Publicar directamente en Redis dentro del controlador HTTP después de hacer `COMMIT` en la base de datos presenta el problema del *Dual Write*:
- Si el servidor falla o la red hacia Redis se interrumpe tras el `COMMIT`, el evento se pierde permanentemente.
- Si se publica en Redis antes del `COMMIT` y la base de datos rechaza la transacción (por restricción o bloqueo), se emite un evento fantasma inexistente.

---

## Alternativas Evaluadas

### Opción 1: Transacciones Distribuidas (Two-Phase Commit / 2PC)
- **Descripción**: Coordinar una transacción distribuida entre PostgreSQL y Redis.
- **Desventajas**: Altamente ineficiente, compleja de mantener y no soportada nativamente de forma robusta por Redis Streams.

### Opción 2: Publicación Best-Effort en el Servidor Web
- **Descripción**: Publicar en Redis Streams en un bloque `try/catch` tras confirmar la transacción en PostgreSQL.
- **Desventajas**: Pérdida de eventos en caídas de red o reinicios de pods durante despliegues (*Zero At-Least-Once Guarantee*).

### Opción 3 (Elegida): Patrón Transactional Outbox con Worker Asíncrono
- **Descripción**: Escribir los eventos pendientes dentro de la misma transacción relacional en la tabla `schema_collab.collab_outbox`. Un proceso worker desacoplado lee los eventos periódicamente y los despacha a Redis Streams.

---

## Decisión

Adoptar la **Opción 3**:
1. El servidor HTTP ejecuta las mutaciones de negocio y la inserción en `schema_collab.collab_outbox` en una única transacción atómica ACID en PostgreSQL.
2. Se ejecuta un worker dedicado en un proceso independiente: `worker:collab-outbox` (`src/workers/collab-outbox.worker.ts`).
3. El worker consulta eventos con estado `PENDING` utilizando concurrencia segura:
   ```sql
   SELECT * FROM schema_collab.collab_outbox
   WHERE status = 'PENDING'
   ORDER BY created_at ASC
   LIMIT 50
   FOR UPDATE SKIP LOCKED;
   ```
4. Despacha el lote a `stream:collab.events` en Redis Streams y actualiza el estado a `PUBLISHED`.
5. Si falla la publicación, incrementa el contador de reintentos y marca como `FAILED` tras superar el límite establecido.

---

## Consecuencias

### Positivas
- **Garantía At-Least-Once**: Cero pérdida de eventos ante cortes de red o caídas del servicio web.
- **Desacoplamiento**: El hilo HTTP principal responde al cliente de inmediato sin esperar la latencia de Redis.
- **Observabilidad**: La profundidad de la tabla `collab_outbox` se monitorea en tiempo real mediante `collab_outbox_depth_gauge`.

### Negativas
- **Consistencia Eventual**: Los eventos se reciben con un retraso leve dependiente del intervalo del worker (`COLLAB_OUTBOX_INTERVAL_MS`).
- **Idempotencia Requerida**: Los consumidores deben manejar eventos duplicados en caso de reintentos del worker.
