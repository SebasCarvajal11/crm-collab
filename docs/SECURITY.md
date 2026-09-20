# Seguridad y Autorización: `crm-collab`

Este documento describe el modelo de control de acceso basado en roles contextuales (RBAC), la seguridad entre microservicios y la integridad de las firmas digitales en `crm-collab`.

---

## 1. Validación de Identidad y Modelo RBAC Contextual

`crm-collab` no gestiona credenciales de usuario; valida la firma de los JWT entrantes utilizando el JWKS público de `crm-auth`.

El control de acceso opera en dos niveles complementarios:

1. **Rol Global de Plataforma (`auth.role`)**:
   - `admin`: Acceso de gestión y supervisión a todos los proyectos.
   - `worker`: Capacidad para crear proyectos y colaborar en los asignados.
   - `client`: Restringido exclusivamente a proyectos donde ha sido asignado como contraparte.
2. **Membresía Contextual de Proyecto (`project_members`)**:
   - El acceso a un proyecto específico está condicionado a la existencia de un registro en `schema_collab.project_members`.
   - Se valida mediante el middleware [`assertProjectAccess`](file:///d:/BACKUP%20CELULAR%20OLIMPO/crm-collab/src/modules/collab/shared/project-access.ts).

---

## 2. Aislamiento Estricto de Canales y Visibilidad de Cliente

Para proteger la confidencialidad operativa del equipo creativo:

- **Canal Interno (`/chat/internal`)**: Protegido por el guard `assertInternalChatAccess`. Si un usuario con rol `client` intenta consultar o emitir en este canal, la petición es rechazada de inmediato con `403 Forbidden`.
- **Visibilidad en Tablero Kanban**: Las columnas marcadas con `is_client_visible = false` y sus tareas asociadas son filtradas a nivel de consulta cuando la petición proviene de un cliente.
- **Solicitudes de Cambio**: Las solicitudes formales con impacto de tarifa o tiempo exigen revisión administrativa previa antes de impactar el tablero operativo.

---

## 3. Autenticación de Servicio a Servicio (Service JWT con `crm-media`)

Para orquestar la subida, escaneo y activación de archivos en OCI Object Storage sin compartir secretos simétricos:

```text
[ crm-collab ] ──(Firma comando con SERVICE_JWT_PRIVATE_KEY)──> [ Redis Stream ]
                                                                       │
                                                                       ▼
[ crm-media ] <──(Descarga Service JWKS y verifica firma RS256)── [ Procesa ]
```

- **Algoritmo**: Asimétrico `RS256`.
- **Clave Privada (`SERVICE_JWT_PRIVATE_KEY`)**: Custodiada exclusivamente en `crm-collab`.
- **Punto de Verificación (`/api/v1/.well-known/service-jwks.json`)**: Expuesto públicamente para que `crm-media` valide la autenticidad de los comandos recibidos.
- **Reemplazo Legacy**: Este mecanismo sustituyó completamente al antiguo secreto compartido HMAC (`MEDIA_COMMAND_SECRET`).

---

## 4. Integridad de Firma Digital en Contratos y Otrosíes

El proceso de firma de contratos y otrosíes captura una evidencia digital inmutable:

1. **Datos del Firmante**: Nombre completo, tipo y documento de identificación, correo electrónico verificado.
2. **Evidencia Biométrica/Gráfica**: Trazo capturado como Data URL PNG (`signature_data_url`).
3. **Consentimiento Explícito**: Validación estricta del flag `accept_terms: true`.
4. **Congelamiento de Contenido**: El contrato genera un snapshot inmutable de las cláusulas y tarifas al momento de la solicitud de firma; ninguna edición posterior es permitida sobre el contrato firmado (cualquier ajuste requiere un Otrosí).
