# ADR-001: Réplica Asíncrona de Identidad y Gestión de Errores con DLQ

- **Estado**: Aceptado
- **Fecha**: 2026-05-20
- **Autores**: Equipo de Plataforma y Backend CIMA

---

## Contexto y Planteamiento del Problema

`crm-collab` gestiona proyectos, tareas, asignaciones, comentarios y chats donde es imprescindible mostrar el nombre, correo y avatar de los usuarios. Consultar síncronamente por HTTP a `crm-auth` en cada renderizado de tablero o listado de comentarios provocaría:
1. Elevado acoplamiento temporal y fragilidad si `crm-auth` no responde.
2. Latencia inaceptable al cargar vistas con decenas de usuarios asignados.
3. Posibilidad de recibir eventos con esquemas obsoletos o datos corruptos que detengan el flujo del consumidor en Redis Streams.

---

## Alternativas Evaluadas

### Opción 1: Consulta HTTP en Vivo con Caché en Memoria
- **Descripción**: Consultar `crm-auth` por HTTP y guardar el resultado en Redis con TTL corto (5-10 min).
- **Desventajas**: Si `crm-auth` sufre una caída, las peticiones sin caché fallan. Requiere llamadas síncronas periódicas.

### Opción 2: Base de Datos Compartida
- **Descripción**: Permitir que `crm-collab` lea directamente de `schema_auth.users`.
- **Desventajas**: Viola el principio de microservicios, crea acoplamiento a nivel de base de datos y dificulta migraciones independientes.

### Opción 3 (Elegida): Proyección Local Desnormalizada (`user_identity_snapshots`) con DLQ
- **Descripción**: Consumir `stream:auth.identity` en Redis Streams y mantener un read model local en `schema_collab.user_identity_snapshots`. Implementar soporte para versiones de esquema (`v1`, `v2`) y desviar eventos no procesables a una *Dead Letter Queue* (DLQ).

---

## Decisión

Adoptar la **Opción 3**:
1. `crm-collab` se suscribe a `stream:auth.identity` bajo el grupo de consumo `collab-auth-consumer`.
2. Procesa eventos `auth.user.created`, `auth.user.updated` y `auth.user.deleted` persistiendo un snapshot local con nombre, email, avatar y estado activo.
3. Valida esquemas usando contratos tipados (`@sebascarvajal11/cima-contracts`).
4. Si un evento falla por error de formato o supera el umbral de reintentos (`AUTH_EVENTS_MAX_RETRIES`), se transfiere automáticamente a `schema_collab.auth_events_dlq` y se confirma en Redis (`XACK`) para no bloquear la partición.
5. Se provee la herramienta CLI `pnpm dlq:auth:list` y `pnpm dlq:auth:replay` para diagnóstico y recuperación manual.

---

## Consecuencias

### Positivas
- **Autonomía Total**: Los tableros Kanban, chats y proyectos se cargan con consultas SQL directas (`JOIN` local), con latencia < 5 ms.
- **Tolerancia a Caídas**: `crm-collab` opera con normalidad aunque `crm-auth` esté temporalmente inactivo.
- **Resiliencia**: Los mensajes corruptos se aíslan en la DLQ sin paralizar el consumo de eventos válidos.

### Negativas
- **Consistencia Eventual**: Existe un desfase milimétrico entre la actualización del usuario en `crm-auth` y su reflejo en los tableros de colaboración.
