# Documentación Técnica: `crm-collab`

Bienvenido a la documentación oficial del microservicio de colaboración y gestión de proyectos de **CIMA CRM** (`crm-collab`). Este servicio actúa como la **capa central de coordinación de trabajo operativo**, tableros kanban, mensajería de proyectos, contratos, otrosíes y metadatos de entregables.

---

## Índice de Documentación

| Documento | Audiencia Principal | Descripción |
| :--- | :--- | :--- |
| [**ARCHITECTURE.md**](./ARCHITECTURE.md) | Arquitectos / Backend | Diseño modular por subdominios, Event Bus (Redis Streams/Memory), Workers y ciclo de vida. |
| [**DOMAIN.md**](./DOMAIN.md) | Negocio / Backend | Conceptos CIMA: Campañas vs Productos, tableros Kanban, contratos, otrosíes y chat. |
| [**API.md**](./API.md) | Frontend / Integraciones | Catálogo de los 63 endpoints públicos, KrakenD Gateway, RBAC contextual y Service JWKS. |
| [**DATABASE.md**](./DATABASE.md) | DBA / Backend | Esquema PostgreSQL `schema_collab` (23 tablas), Drizzle ORM y Expand & Contract. |
| [**SECURITY.md**](./SECURITY.md) | Seguridad / DevOps | Matriz de permisos contextuales por proyecto, Service JWT (RS256) y aislamiento de canales. |
| [**INTEGRATIONS.md**](./INTEGRATIONS.md) | Plataforma / DevOps | Consumo de `stream:auth.identity`, DLQ, comandos hacia `crm-media`, outbox y observabilidad. |
| [**TESTING.md**](./TESTING.md) | QA / Desarrolladores | Pirámide de pruebas: Vitest unitario (160 tests, cobertura $\ge 85\%$), OpenAPI check y Hurl E2E. |
| [**DECISIONS/**](./DECISIONS/) | Todo el equipo | Architecture Decision Records (ADRs) que justifican las decisiones técnicas estructurales. |

---

## Guía Rápida de Navegación para Agentes de IA

Si eres un **agente autónomo**, consulta directamente el archivo correspondiente a tu objetivo:

- **Modificar o agregar rutas y endpoints**: Consulta [`API.md`](./API.md) y [`ARCHITECTURE.md`](./ARCHITECTURE.md).
- **Alterar el modelo de datos o tablas de base de datos**: Consulta [`DATABASE.md`](./DATABASE.md).
- **Comprender reglas de negocio, roles o estados de tareas**: Consulta [`DOMAIN.md`](./DOMAIN.md).
- **Trabajar con archivos, pre-firmas o eventos de identidad**: Consulta [`INTEGRATIONS.md`](./INTEGRATIONS.md).
- **Ajustar permisos por proyecto o firmas de servicio**: Consulta [`SECURITY.md`](./SECURITY.md) y los [ADRs](./DECISIONS/).
- **Ejecutar o ampliar la suite de pruebas**: Consulta [`TESTING.md`](./TESTING.md).

---

## Reglas Inviolables del Repositorio

1. **Gestor de Paquetes**: Únicamente `pnpm`. Prohibido usar `npm` o generar archivos `package-lock.json`.
2. **Cero Secretos**: Nunca almacenar claves privadas RSA ni secretos en el repositorio.
3. **Desacoplamiento de Binarios**: `crm-collab` **no almacena archivos físicos ni credenciales OCI**. La custodia física y el escaneo antivirus pertenecen a `crm-media`.
4. **Desacoplamiento de Identidad**: `crm-collab` **no autentica usuarios ni emite JWTs de usuario**. Consume identidades desde `crm-auth`.
