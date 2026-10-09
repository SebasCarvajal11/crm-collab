# Integraciones y Plataforma: `crm-collab`

Este documento define la topología de comunicación, los canales de mensajería asíncrona en Redis Streams, la integración con el API Gateway KrakenD y la interacción con `crm-media` y `crm-auth`.

---

## 1. Topología de Integración

```text
               ┌───────────────────────┐
               │    KrakenD Gateway    │
               └───────────┬───────────┘
                           │ (HTTP REST / Headers de Contexto)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                         crm-collab                          │
│  (Gestión de proyectos, tareas, chat, contratos y briefs)   │
└──────────────┬───────────────┬──────────────────────────────┘
               │               │
               │ (Service JWT) │ (Eventos de Dominio Outbox)
               ▼               ▼
      ┌──────────────────┐   ┌──────────────────┐
      │  Redis Streams   │   │  Redis Streams   │
      │ stream:collab... │   │ stream:collab... │
      │  media-commands  │   │      events      │
      └────────┬─────────┘   └────────┬─────────┘
               │                      │
               ▼                      ▼
         [ crm-media ]          [ Consumidores ]
       (Procesa archivos      (Notificaciones /
        y genera URLs)         Analítica externa)

      ┌──────────────────┐
      │  Redis Streams   │
      │ stream:auth.id.. │
      └────────┬─────────┘
               │ (Consume altas/bajas de usuarios)
               ▼
         [ crm-collab ] ──► [ user_identity_snapshots ]
```

---

## 2. Eventos Asíncronos en Redis Streams

`crm-collab` interactúa con Redis Streams como productor y consumidor mediante conexiones desacopladas y reintentos exponenciales.

### A. Consumo de Identidad (`stream:auth.identity`)
- **Grupo de Consumo**: `group:collab.auth-identity` (definido en `STREAM_CONVENTIONS`).
- **Propósito**: Sincronizar nombres, correos, avatares y roles en la tabla local `schema_collab.user_identity_snapshots` para evitar consultas HTTP síncronas hacia `crm-auth`.
- **Tolerancia a Fallos y DLQ**: Si un evento falla tras agotar los reintentos (`AUTH_EVENTS_MAX_RETRIES`), se redirige a `stream:collab.identity-dlq`.
- **Herramienta Operativa CLI**:
  - `pnpm dlq:auth:list`: Inspecciona eventos fallidos en DLQ.
  - `pnpm dlq:auth:replay`: Reintenta el procesamiento de mensajes recuperados.

### B. Comandos hacia Media (`stream:collab.media-commands` y `stream:media.asset-responses`)
- **Propósito**: Solicitar a `crm-media` la generación de URLs firmadas para subida, descarga o purga de archivos adjuntos.
- **Consumer Group de Respuestas**: `group:collab.media-responses`.
- **Autenticación Máquina a Máquina**: Los comandos viajan autenticados mediante un Service JWT firmado con algoritmo `RS256`. `crm-media` valida la firma consultando el JWKS público en `http://crm-collab:3001/api/v1/.well-known/service-jwks.json`.
- **Resiliencia**: Utiliza un cliente con *Circuit Breaker* en memoria para no saturar Redis si el servicio de medios experimenta degradación.

### C. Publicación de Eventos de Dominio (`stream:collab.events`)
- **Propósito**: Notificar a la plataforma sobre eventos clave (creación de proyectos, cambios de estado de tareas, envío de mensajes).
- **Garantía At-Least-Once**: Se implementa mediante el patrón **Transactional Outbox**. El servidor HTTP inserta el evento en la tabla `schema_collab.collab_outbox` en la misma transacción SQL del dominio.
- **Worker Dedicado**: El proceso independiente `worker:collab` lee lotes pendientes con bloqueo transaccional (`FOR UPDATE SKIP LOCKED`), publica en Redis Streams y marca el registro como completado.

---

## 3. Integración con KrakenD API Gateway

- **Manifiesto de Rutas**: [`gateway/gateway.manifest.json`](../gateway/gateway.manifest.json).
- **Propagación de Contexto**: KrakenD valida el Access Token del usuario y envía a `crm-collab` los encabezados de identidad confiable:
  - `X-User-Id`: UUID del usuario autenticado.
  - `X-User-Role`: Rol canónico CIMA (`admin`, `worker`, `client`).
  - `X-Trace-Id` / `X-Correlation-Id`: Identificadores únicos para observabilidad distribuida.
- **Circuit Breaker y Health**: KrakenD audita la disponibilidad en `GET /api/v1/health`. Con la configuración calibrada (`max_errors: 30`, `interval: 30s`, `timeout: 10s`), si el servicio sufre fallos continuos, KrakenD abre el circuito respondiendo con `503 Service Unavailable` sin saturar la red.


---

## 4. Trazabilidad, Métricas y Observabilidad

### A. Health Checks (`GET /api/v1/health`)
Endpoint de diagnóstico que reporta el estado operativo de los componentes críticos:
```json
{
  "status": "ok",
  "service": "crm-collab",
  "version": "1.0.0",
  "dependencies": {
    "database": { "status": "ok", "latencyMs": 2 },
    "redis": { "status": "ok", "latencyMs": 1 },
    "outbox": { "status": "ok", "pendingEvents": 0 }
  }
}
```

### B. Métricas Prometheus (`GET /api/v1/metrics`)
- `collab_outbox_depth_gauge`: Cantidad de eventos acumulados en el outbox transaccional.
- `http_requests_total` y `http_request_duration_seconds`: Rendimiento y distribución de latencias por endpoint y método.
- `media_access_cache_hits_total` / `misses_total`: Eficiencia del caché local de URLs de archivos.

### C. Logging Estructurado
Logs generados con **Pino** en formato JSON estructurado, inyectando `traceId` y `correlationId` automáticamente mediante el almacenamiento de contexto asíncrono (`AsyncLocalStorage`).
