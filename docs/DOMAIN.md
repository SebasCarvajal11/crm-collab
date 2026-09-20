# Modelo de Dominio: `crm-collab`

Este documento detalla los conceptos de negocio, entidades e invariantes de gestión colaborativa que rigen la operación de **CIMA CRM**.

---

## 1. Tipos de Proyecto y Flujos de Trabajo

CIMA gestiona dos tipologías de proyectos con dinámicas operativas diferenciadas:

| Tipo de Proyecto (`project_type`) | Naturaleza | Columnas Kanban Habituales |
| :--- | :--- | :--- |
| **`campaign_service`** | Servicios creativos, diseño gráfico, producción audiovisual y marketing digital. | `pending`, `doing`, `internal_review`, `client_approval`, `done` |
| **`product_order`** | Fabricación y entrega de productos físicos (merchandising, camisetas, packaging). | `pending`, `art_approved`, `in_production`, `blocked`, `done` |

---

## 2. Tablero Kanban y Tareas

- **Columnas (`project_task_columns`)**: Definen las etapas del flujo de valor. Cada columna cuenta con un indicador `is_client_visible`: las columnas de revisión interna no son visibles para el cliente.
- **Tareas (`project_tasks`)**: Unidad básica de trabajo. Soportan:
  - Prioridades: `low`, `medium`, `high`, `urgent`.
  - Bloqueos: Pueden estar bloqueadas por otra tarea (`blocked_by_task_id`).
  - Progreso por Subtareas (`project_subtasks`): Porcentaje calculado automáticamente según ítems completados.
  - Asignaciones Múltiples (`project_task_assignees`): Permite vincular a uno o más colaboradores (`worker`).

---

## 3. Canales de Chat y Comunicación

Cada proyecto dispone de dos canales de chat independientes:

1. **Canal Interno (`internal`)**:
   - Acceso exclusivo para el equipo de CIMA (`admin` y `worker`).
   - Discusiones de costos internos, estrategia y dudas técnicas.
2. **Canal Externo (`external`)**:
   - Espacio colaborativo compartido con el cliente (`admin`, `worker` y `client`).
   - Envío de avances, retroalimentación y consultas formales.

### Características de Mensajería
- **Menciones**: Notificaciones dirigidas (`@usuario`) registradas en `project_chat_mentions`.
- **Confirmaciones de Lectura**: Rastro temporal por usuario en `project_chat_message_reads`.
- **Indicadores de Tipeo**: Notificación efímera en vivo sin persistencia en base de datos.

---

## 4. Contratos y Otrosíes (Adiciones Contractuales)

Para formalizar la relación jurídica y económica de cada proyecto:

```text
[ Creación de Proyecto ]
           │
           ▼
[ Contrato Principal ] ──(Borrador)──> [ Solicitud Firma ] ──> [ Firma Digital del Cliente ]
                                                                             │ (Vigente)
                                                                             ▼
                                                              [ Otrosíes / Adiciones ]
                                                              ├── Económica (Tarifa)
                                                              ├── Servicios (Alcance)
                                                              └── Prórroga (Plazo)
```

- **Contrato Principal (`project_contracts`)**: Fija el alcance, tarifa mensual, duración en meses y firmas digitales.
- **Otrosíes (`project_contract_amendments`)**: Permiten adiciones formales de alcance o valor sin romper el contrato original. Pueden ser redactados por el equipo o solicitados formalmente por el cliente.
- **Sellado Digital**: La firma del cliente captura el trazo PNG en base64, nombre del firmante, aceptación explícita de términos y marca temporal de auditoría.

---

## 5. Solicitudes de Cambio (`project_change_requests`)

- **Cambio Menor (`minor`)**: Ajustes operativos o correcciones de detalle dentro del alcance original (ej. corrección tipográfica o ajuste de color).
- **Cambio Formal (`formal`)**: Modificaciones de alcance que impactan tiempo o costo. Requieren aprobación y derivan en una actualización del brief o en un Otrosí contractual.
