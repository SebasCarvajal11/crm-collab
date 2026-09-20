// Valores no secretos y aislados: permiten importar módulos que validan la
// configuración sin conectar a infraestructura durante las pruebas unitarias.
function testPem(keyType: "PRIVATE" | "PUBLIC") {
  return `-----BEGIN ${keyType} KEY-----\ntest\n-----END ${keyType} KEY-----`;
}

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.DB_SCHEMA ??= "schema_collab";
process.env.SERVICE_JWT_PRIVATE_KEY ??= testPem("PRIVATE");
process.env.SERVICE_JWT_PUBLIC_KEY ??= testPem("PUBLIC");
process.env.JWT_PUBLIC_KEY ??= testPem("PUBLIC");
