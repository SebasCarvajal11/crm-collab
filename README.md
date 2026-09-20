# CRM Collab Service

> Servicio de gestión de proyectos, tableros de tareas y colaboración para CIMA CRM.

[![Status](https://img.shields.io/badge/status-active-success.svg)]()
[![Platform](https://img.shields.io/badge/platform-CIMA%20CRM-blue.svg)]()
[![Node](https://img.shields.io/badge/node-%3E%3D22.0.0-green.svg)]()
[![License](https://img.shields.io/badge/license-MIT-blue.svg)]()

---

## Propósito

`crm-collab` coordina el ciclo de vida de proyectos (Campañas y Productos recurrentes), tableros Kanban, tareas, subtareas, chat en tiempo real con canales segregados, generación de contratos y otrosíes, y metadatos de archivos adjuntos. Consume eventos de identidad de `crm-auth` vía Redis Streams y delega el almacenamiento binario de objetos en `crm-media` mediante comandos asíncronos firmados con Service JWT (RS256).

---

## Documentación Detallada (`docs/`)

Para consultar las especificaciones técnicas completas y guías de arquitectura, visita la suite documental:

- [**Guía de Arquitectura (`docs/ARCHITECTURE.md`)**](./docs/ARCHITECTURE.md): Diseño modular por subdominios, EventBus desacoplado y worker de outbox.
- [**Modelo de Dominio (`docs/DOMAIN.md`)**](./docs/DOMAIN.md): Proyectos Campaña vs Producto, estados Kanban, aislamiento de chat y contratos.
- [**Contratos de API (`docs/API.md`)**](./docs/API.md): Catálogo completo de 63 endpoints, KrakenD Gateway y Service JWKS.
- [**Base de Datos y Persistencia (`docs/DATABASE.md`)**](./docs/DATABASE.md): Esquema PostgreSQL `schema_collab` (23 tablas), Drizzle ORM y réplica de lectura.
- [**Seguridad y Control de Acceso (`docs/SECURITY.md`)**](./docs/SECURITY.md): RBAC contextual por proyecto, Service JWT (RS256) y validación de canales.
- [**Integraciones y Plataforma (`docs/INTEGRATIONS.md`)**](./docs/INTEGRATIONS.md): Eventos en Redis Streams, DLQ de identidad, clientes con Circuit Breaker.
- [**Estrategia de Pruebas (`docs/TESTING.md`)**](./docs/TESTING.md): Pruebas unitarias Vitest, pruebas de contrato y validación de manifest KrakenD.
- [**Decisiones Arquitectónicas (`docs/DECISIONS/`)**](./docs/DECISIONS/): Registros formales de decisiones (ADRs).

---

## Inicio Rápido Local

### 1. Configuración de Entorno
```bash
cp .env.example .env
# Configurar variables locales o ejecutar pnpm setup:env desde crm-infra
```

### 2. Instalación y Puesta en Marcha
```bash
pnpm install
pnpm db:push                  # aplicar migraciones Drizzle en schema_collab
pnpm dev                      # servidor con hot-reload en http://localhost:3001
```

### 3. Workers de Background (Proceso Independiente)
```bash
pnpm worker:collab-outbox     # despachador de eventos outbox y purga de cachés
```

### 4. Herramientas de Operación y DLQ
```bash
pnpm dlq:auth:list            # inspeccionar mensajes en cola de error (DLQ)
pnpm dlq:auth:replay          # reintentar evento de identidad específico
pnpm db:seed                  # sembrar datos iniciales de prueba
```

---

## Pruebas y Validación de Calidad

```bash
pnpm test:unit                # pruebas unitarias aisladas (Vitest)
pnpm test:unit:coverage       # cobertura con reporte en coverage/unit/index.html
pnpm test:contract            # validación de contratos OpenAPI
pnpm gateway:validate         # comprueba paridad entre OpenAPI y Gateway Manifest
pnpm lint                     # análisis estático con ESLint (cero advertencias)
pnpm typecheck                # verificación estricta de tipos TypeScript
```

---

## Despliegue en Producción

El despliegue está automatizado mediante GitHub Actions y orquestado por el script canónico de slots Blue/Green:

```bash
# Desde crm-infra/
./deploy/remote/deploy-component.sh collab
```
