# Arquitectura del Sistema: `crm-collab`

Este documento describe la estructura arquitectónica, la descomposición por subdominios, el sistema de eventos y los componentes en segundo plano de `crm-collab`.

---

## 1. Descomposición por Subdominios

Para evitar objetos monolíticos (*God Objects*), el núcleo de negocio dentro de `src/modules/collab` está subdividido en módulos cohesivos y autónomos:

```text
src/modules/collab/
├── project/          # CRUD de proyectos, workspaces y línea de tiempo (timeline)
├── member/           # Asignación y control de miembros del proyecto
├── board/            # Columnas Kanban, tareas, subtareas, responsables y comentarios
├── chat/             # Canales de chat interno y externo, lecturas y typing en memoria
├── contract/         # Contratos principales, otrosíes, solicitudes de firma y sellado digital
├── change-request/   # Solicitudes de cambio formales y menores con flujo de aprobación
├── file/             # Metadatos de archivos, aprobaciones de cliente y pre-firmas
├── brief/            # Brief del proyecto y registro de modificaciones
├── notification/     # Notificaciones de menciones (@usuario) y actividad
├── shared/           # Guards RBAC contextuales, mappers y aserciones de acceso
└── events/           # Event Bus desacoplado (Redis Streams / In-Memory)
```

Cada subdominio implementa el patrón de capas:
`routes.ts` (Hono + Zod) $\rightarrow$ `controller.ts` $\rightarrow$ `service.ts` $\rightarrow$ `repository.ts` (Drizzle ORM).

---

## 2. Arquitectura de Eventos (Event Bus)

`crm-collab` utiliza una abstracción de bus de eventos desacoplada (`EventBusPort`):

```text
[ Feature Service ] ──(Emite evento de dominio)──> [ EventBus ]
                                                          │
                       ┌──────────────────────────────────┴──────────────────────────────────┐
                       ▼                                                                     ▼
             [ RedisStreamsEventBus ]                                              [ InMemoryEventBus ]
            (Producción y Dev Compartido)                                           (Tests y Fallback)
                       │
                       ▼
          Redis Stream: stream:collab.events
```

- **Alta Disponibilidad**: Si `REDIS_URL` está configurado, utiliza `RedisStreamsEventBus`. Si Redis no está disponible en desarrollo local o pruebas unitarias, degrada automáticamente a `InMemoryEventBus`.
- **Despacho Local e Inter-Servicio**: Los manejadores locales suscritos procesan el evento en memoria de inmediato para mínima latencia, mientras que el bus lo publica a Redis Streams para sincronización con otros microservicios.

---

## 3. Background Workers y Procesos en Segundo Plano

| Worker | Comando | Responsabilidad | Dependencias |
| :--- | :--- | :--- | :--- |
| **Collab Outbox Worker** | `pnpm worker:collab-outbox` | Sondea la tabla `schema_collab.collab_outbox` y publica eventos a Redis Stream. | PostgreSQL (`collab_outbox`), Redis |

### Ciclo de Vida y Apagado Controlado (Graceful Shutdown)
- **Monitoreo de Salud**: El worker escribe su estado cada 15 segundos en `/tmp/worker-healthy`, comprobado por Docker mediante [`docker-healthcheck.sh`](file:///d:/BACKUP%20CELULAR%20OLIMPO/crm-collab/docker-healthcheck.sh).
- **Drenaje de Tareas**: Ante señales `SIGINT` y `SIGTERM`, el proceso detiene el timer de sondeo, finaliza los eventos que se encuentren en curso de publicación, desconecta los clientes de base de datos y Redis, y termina sin dejar bloqueos huérfanos.

---

## 4. Patrones Retirados (Anti-patrones Prohibidos)

- **Secreto Compartido Gateway (`GATEWAY_TRUST_SECRET`)**: Retirado el 2026-05-15. La identidad del usuario se valida mediante el JWKS de `crm-auth`.
- **Firma Simétrica HMAC para Comandos (`MEDIA_COMMAND_SECRET`)**: Retirado el 2026-06-01. La comunicación con `crm-media` se autentica exclusivamente mediante tokens JWT de servicio asimétricos (RS256).
- **BFF Dedicado (`crm-bff`)**: Retirado el 2026-06-01. La composición de vistas se realiza en el frontend consumiendo KrakenD.
