# Estrategia de Pruebas: `crm-collab`

Este documento describe los niveles de prueba, las herramientas utilizadas y el protocolo de verificación de calidad y regresión para `crm-collab`.

---

## 1. Niveles de Pruebas y Aislamiento

```text
       ▲
      / \     Nivel 3: Smoke Tests y Gateway (`test:smoke:gateway`, `gateway:validate`)
     /   \
    /─────\   Nivel 2: Pruebas de Contrato OpenAPI e Integración (`test:contract`)
   /       \
  /─────────\ Nivel 1: Pruebas Unitarias Aisladas (Vitest, lógica pura, guards, stores)
```

### Nivel 1: Pruebas Unitarias (`pnpm test:unit`)
- **Herramienta**: Vitest.
- **Alcance**: 
  - Lógica de agregados de dominio (`project-aggregate.spec.ts`).
  - Servicios de negocio aislados con repositorios simulados (Board, Chat, Change Request, Contract Templates).
  - Almacén en memoria de estados de tipeo (`chat-typing.store.spec.ts`).
  - Guards de control de acceso y autorizaciones contextuales (`guards.spec.ts`, `project-access.spec.ts`).
  - Manejo de eventos y deserialización de esquemas versionados (`auth-event-handler.spec.ts`).
  - Clientes de comunicación con reintentos y Circuit Breaker (`media-command-client.spec.ts`).
- **Ejecución**: Se ejecutan de manera instantánea en memoria sin requerir contenedores Docker ni bases de datos activas.

### Nivel 2: Pruebas de Contrato e Integración (`pnpm test:contract`)
- **Alcance**: Valida la fidelidad entre las respuestas reales generadas por los controladores y los esquemas declarados en la especificación OpenAPI.
- **Verificación**: Garantiza que no existan discrepancias de tipos ni campos faltantes en los DTOs de proyectos, tareas, mensajes o contratos.

### Nivel 3: Validación de Gateway y Smoke Tests
- **Validación del Manifiesto**: `pnpm gateway:validate` comprueba que todos los endpoints expuestos en `openapi/openapi.yaml` tengan una ruta correspondiente y un contrato de headers idéntico en `gateway/gateway.manifest.json`.
- **Smoke Tests a través del Gateway**: `pnpm test:smoke:gateway` envía peticiones HTTP simuladas contra KrakenD local (puerto 28080) validando la cadena completa de autorización, inyección de encabezados de usuario y enrutamiento hacia el microservicio.

---

## 2. Aislamiento y Manejo de Datos

1. **Snapshots de Identidad**: Las pruebas unitarias no se conectan a `crm-auth`. Se alimentan de fixtures estáticos que simulan el contenido de la tabla `user_identity_snapshots`.
2. **Idempotencia en Consumo**: Las pruebas de `auth-event-handler` validan que eventos duplicados o reprocesados no generen inconsistencias ni corrompan el estado local.
3. **In-Memory Event Bus**: Para pruebas locales donde no se dispone de Redis, se emplea `InMemoryEventBus` para interceptar y verificar la publicación de eventos sin I/O de red.

---

## 3. Catálogo de Comandos de Validación

| Comando | Propósito | Requisitos de Entorno |
| :--- | :--- | :--- |
| `pnpm test:unit` | Ejecuta la suite completa de pruebas unitarias. | Ninguno (autocontenido) |
| `pnpm test:unit:coverage` | Genera reporte de cobertura de código con V8. | Ninguno |
| `pnpm test:contract` | Verifica consistencia de contratos de API. | Ninguno |
| `pnpm openapi:check` | Comprueba validez de sintaxis en `openapi.yaml`. | Ninguno |
| `pnpm gateway:validate` | Verifica paridad entre OpenAPI y Gateway Manifest. | Ninguno |
| `pnpm test:smoke:gateway` | Ejecuta smoke tests a través de KrakenD. | Stack Docker activo |
| `pnpm lint` | Analiza código estático con ESLint sin advertencias. | Ninguno |
| `pnpm typecheck` | Comprueba consistencia del sistema de tipos TypeScript. | Ninguno |
| `pnpm dlq:auth:list` | Inspecciona mensajes en la cola de fallos (DLQ). | Redis activo |
| `pnpm pii:clean` | Ejecuta tarea de anonimización de datos sensibles. | Postgres activo |
