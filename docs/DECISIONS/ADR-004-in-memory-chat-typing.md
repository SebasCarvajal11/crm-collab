# ADR-004: Indicadores de Tipeo Efímeros en Memoria para Canales de Chat

- **Estado**: Aceptado
- **Fecha**: 2026-07-02
- **Autores**: Equipo de Plataforma y Backend CIMA

---

## Contexto y Planteamiento del Problema

En los canales de chat de proyectos (`team` y `client`), los usuarios emiten eventos de tipeo ("escribiendo...") a intervalos de 2 a 3 segundos mientras redactan un mensaje.

Si estos eventos se persistieran en PostgreSQL:
1. Generarían miles de escrituras innecesarias por minuto (IOPS excesivos y saturación de WAL).
2. Producirían fragmentación rápida de tablas (*table bloat*) por la alta tasa de `UPDATE` o `INSERT` y posterior borrado.
3. El estado de tipeo carece de valor histórico; es información 100% efímera que caduca tras unos pocos segundos de inactividad.

---

## Alternativas Evaluadas

### Opción 1: Persistencia en Tabla Temporal PostgreSQL
- **Descripción**: Crear una tabla `chat_typing_status` en `schema_collab` con un job de purga periódica.
- **Desventajas**: Sobrecarga innecesaria de transacciones en la base de datos principal y generación de bloqueos recurrentes.

### Opción 2: Publicación a Redis con Claves TTL
- **Descripción**: Almacenar claves `typing:project:channel:user` con expiración automática de 4 segundos en Redis.
- **Desventajas**: Añade viajes de red de ida y vuelta (*round-trips*) innecesarios para operaciones de visualización en polling local.

### Opción 3 (Elegida): Almacén en Memoria con TTL Deslizante (`chatTypingStore`)
- **Descripción**: Mantener un almacén ligero en la memoria del proceso Node.js (`ChatTypingStore`), que expira automáticamente a los 4.5 segundos a menos que se renueve.

---

## Decisión

Adoptar la **Opción 3**:
1. Se implementa `ChatTypingStore` en `src/modules/collab/chat/chat-typing.store.ts`.
2. Los eventos entrantes `POST /api/v1/projects/:id/chat/channels/:channel/typing` registran el `userId` en memoria con una marca temporal de vencimiento de 4.500 ms.
3. El endpoint de lectura `GET /api/v1/projects/:id/chat/channels/:channel/typing` filtra en memoria los usuarios cuyo TTL siga vigente y descarta los caducados en tiempo $O(1)$.
4. Para la arquitectura de una sola instancia de despliegue en producción o con afinidad de sesión en WebSocket/Polling, esta aproximación reduce a cero el impacto en base de datos.

---

## Consecuencias

### Positivas
- **Cero Impacto en Base de Datos**: Ninguna consulta o escritura SQL generada por indicadores de tipeo.
- **Rendimiento Máximo**: Operaciones de lectura y actualización en memoria que toman < 0.1 ms.
- **Simplicidad de Código**: Ausencia de esquemas o migraciones para datos puramente transitorios.

### Negativas
- **Ámbito Local al Proceso**: En un escenario con múltiples réplicas detrás de un balanceador sin balanceo por WebSocket/afinididad, el estado de tipeo se comparte si se migra a Pub/Sub de Redis en el futuro.
