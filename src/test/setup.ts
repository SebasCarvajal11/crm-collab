// Valores no secretos y aislados: permiten importar módulos que validan la
// configuración sin conectar a infraestructura durante las pruebas unitarias.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.DB_SCHEMA ??= "schema_collab";
process.env.SERVICE_JWT_PRIVATE_KEY ??= "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----";
process.env.SERVICE_JWT_PUBLIC_KEY ??= "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----";
process.env.TRUST_GATEWAY_JWT_HEADERS ??= "true";
