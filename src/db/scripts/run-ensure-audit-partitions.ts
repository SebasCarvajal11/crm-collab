import "dotenv/config";
import { Pool } from "pg";
import { pgConnectionConfig } from "../pg-config";
import { ensureAuditLogPartitions } from "./ensure-audit-log-partitions";

const pool = new Pool(pgConnectionConfig);

try {
  await ensureAuditLogPartitions(pool);
  console.log("[audit_logs] particiones verificadas (mes actual + 2 siguientes, UTC)");
} finally {
  await pool.end();
}
