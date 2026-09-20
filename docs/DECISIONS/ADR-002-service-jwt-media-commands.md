# ADR-002: Comandos de Medios Máquina a Máquina mediante Service JWT Asimétrico (RS256)

- **Estado**: Aceptado
- **Fecha**: 2026-06-10
- **Autores**: Equipo de Plataforma y Seguridad CIMA

---

## Contexto y Planteamiento del Problema

`crm-collab` permite adjuntar archivos a proyectos, contratos y mensajes de chat. La gestión física del almacenamiento de archivos, antivirus y URLs prefirmadas en S3 está delegada al microservicio `crm-media`.

Anteriormente, los microservicios utilizaban un secreto simétrico compartido (`MEDIA_COMMAND_SECRET`) para autorizar comandos entre servicios sobre Redis. Esto generaba riesgos:
1. Vulnerabilidad si el secreto se filtraba en cualquier repositorio o archivo `.env`.
2. Imposibilidad de identificar de forma inequívoca al emisor legítimo.
3. Falta de mecanismo para rotar credenciales sin detener múltiples servicios coordinadamente.

---

## Alternativas Evaluadas

### Opción 1: Mantener Secreto Simétrico Compartido (`MEDIA_COMMAND_SECRET`)
- **Descripción**: Compartir una cadena fija entre `crm-collab` y `crm-media` en sus archivos de entorno.
- **Desventajas**: Viola las directrices de seguridad de cero confianza (*Zero Trust*); rotación compleja que exige reinicio sincronizado.

### Opción 2: Llamada HTTP Síncrona a través de KrakenD
- **Descripción**: Realizar llamadas HTTP POST hacia KrakenD para que este reenvíe la petición a `crm-media`.
- **Desventajas**: Añade sobrecarga de latencia, congestión en el gateway y acoplamiento temporal síncrono para operaciones que pueden ser asíncronas.

### Opción 3 (Elegida): Mensajería Asíncrona con Service JWT Firmado con RS256
- **Descripción**: `crm-collab` firma comandos asíncronos en Redis Streams usando su propia clave privada RSA y expone un endpoint JWKS público (`GET /api/v1/.well-known/service-jwks.json`). `crm-media` verifica la firma de forma autónoma.

---

## Decisión

Adoptar la **Opción 3**:
1. `crm-collab` genera y custodia su par de claves RSA dedicado (`SERVICE_JWT_PRIVATE_KEY` / `SERVICE_JWT_PUBLIC_KEY`).
2. Cada solicitud de subida, consulta de metadatos o eliminación hacia `crm-media` se envía al stream `stream:collab.media-commands` conteniendo un Service JWT con claims estándar (`sub: crm-collab`, `aud: crm-media`, `exp`, `jti`).
3. Se expone la clave pública en `GET /api/v1/.well-known/service-jwks.json`.
4. `crm-media` descarga y cachea el JWKS, validando la autenticidad del comando sin secretos simétricos compartidos.
5. Se eliminan definitivamente las variables legacy `MEDIA_COMMAND_SECRET` de la base de código y entornos.

---

## Consecuencias

### Positivas
- **Seguridad Cero Confianza**: Solo `crm-collab` puede firmar comandos legítimos con su clave privada.
- **Auditoría e Integridad**: Cada comando emitido es inmutable y trazable.
- **Rotación Independiente**: La clave puede rotarse actualizando el JWKS sin requerir cambios de código en `crm-media`.

### Negativas
- **Sobrecarga Criptográfica**: Firmar tokens añade ~1 ms de CPU por comando (mitigado con reutilización de sesiones y claves cacheadas).
