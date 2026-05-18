import "dotenv/config";
import { Pool } from "pg";
import { env } from "../../config/env";
import { ensureAuditLogPartitions } from "./ensure-audit-log-partitions";

const pool = new Pool({ connectionString: env.DATABASE_URL });

try {
  await ensureAuditLogPartitions(pool);
  console.log("[audit_logs] particiones verificadas (mes actual + 2 siguientes, UTC)");
} finally {
  await pool.end();
}
