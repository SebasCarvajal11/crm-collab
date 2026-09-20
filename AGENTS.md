# Guía de Agentes: `crm-collab`

Este archivo es el **enrutador principal para Agentes de Inteligencia Artificial**. La documentación técnica y de negocio completa y detallada está estructurada en la carpeta [`docs/`](./docs/README.md).

---

## Misión del Servicio

`crm-collab` es el **coordinador único de proyectos, tareas, tableros Kanban, chat y colaboración** en CIMA CRM. Gestiona el ciclo de vida de los proyectos (Campañas y Productos), pertenencia a proyectos, asignaciones, comentarios, briefs y contratos/otrosíes, sin absorber la identidad (propiedad de `crm-auth`) ni el almacenamiento binario de archivos (propiedad de `crm-media`).

---

## Enrutamiento Documental para Agentes

Antes de proponer o ejecutar cambios, consulta el documento especializado correspondiente a tu objetivo:

| Si tu tarea involucra... | Consulta este documento |
| :--- | :--- |
| Comprender la arquitectura modular, controllers, subdominios y workers | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| Entender tipos de proyecto (Campaña/Producto), Kanban, Chat y Contratos | [`docs/DOMAIN.md`](./docs/DOMAIN.md) |
| Crear, modificar o auditar endpoints y contratos OpenAPI (63 rutas) | [`docs/API.md`](./docs/API.md) |
| Modificar tablas, modelos Drizzle (23 tablas en `schema_collab`) o migraciones | [`docs/DATABASE.md`](./docs/DATABASE.md) |
| Ajustar control de acceso contextual (RBAC), aislamiento de chat o Service JWT | [`docs/SECURITY.md`](./docs/SECURITY.md) |
| Conectar con Redis Streams (`auth.identity`, `collab.events`, media) o KrakenD | [`docs/INTEGRATIONS.md`](./docs/INTEGRATIONS.md) |
| Ejecutar pruebas unitarias Vitest, pruebas de contrato o smoke tests | [`docs/TESTING.md`](./docs/TESTING.md) |
| Entender decisiones estructurales (Réplica identidad, DLQ, Outbox, Typing) | [`docs/DECISIONS/`](./docs/DECISIONS/) |

---

## Reglas Inviolables para Agentes de IA

1. **Gestor Único**: Utiliza **exclusivamente `pnpm`**. Jamás uses `npm` ni generes archivos `package-lock.json`.
2. **Cero Secretos y Cero Legacy**: Nunca reintroduzcas secretos simétricos obsoletos (`MEDIA_COMMAND_SECRET`). La comunicación inter-servicios se autentica exclusivamente con Service JWT asimétrico (RS256).
3. **No Bloquear el Hilo HTTP**: Operaciones pesadas de sincronización de medios o difusión de eventos deben gestionarse a través del outbox transaccional (`schema_collab.collab_outbox`).
4. **Migraciones Seguras**: Todo cambio en base de datos debe ser retrocompatible (Expand & Contract) para admitir despliegues Blue/Green sin interrupción del servicio.
5. **Aislamiento de Pruebas**: No mutar cuentas permanentes ni datos de demostración en las pruebas automatizadas.
