import "dotenv/config";
import { Pool } from "pg";
import { pgConnectionConfig } from "../pg-config";
import {
  assertSafePartitionName,
  sliceForUtcMonth,
  utcMonthStart,
  type MonthSlice,
} from "./audit-partition-utils";

async function relKind(
  client: Pick<Pool, "query">,
  schema: string,
  table: string
): Promise<string | null> {
  const r = await client.query<{ relkind: string }>(
    `SELECT c.relkind
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname = $2`,
    [schema, table]
  );
  return r.rows[0]?.relkind ?? null;
}

async function main() {
  const pool = new Pool(pgConnectionConfig);
  const client = await pool.connect();

  try {
    const kind = await relKind(client, "schema_collab", "audit_logs");
    if (!kind) {
      console.error("No existe schema_collab.audit_logs.");
      process.exitCode = 1;
      return;
    }
    if (kind === "p") {
      console.log("audit_logs ya es tabla particionada (padre). No hay nada que hacer.");
      return;
    }

    await client.query("BEGIN");

    await client.query(
      `ALTER TABLE schema_collab.audit_logs RENAME TO audit_logs_legacy`
    );

    await client.query(`
      CREATE TABLE schema_collab.audit_logs (
        id BIGSERIAL NOT NULL,
        actor_sub UUID,
        actor_email VARCHAR(255),
        actor_role VARCHAR(20),
        action VARCHAR(120) NOT NULL,
        resource_type VARCHAR(80) NOT NULL,
        resource_id VARCHAR(255),
        ip_address VARCHAR(45),
        user_agent VARCHAR(500),
        correlation_id UUID,
        details JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, created_at)
      ) PARTITION BY RANGE (created_at)
    `);

    const now = new Date();
    const slices = [
      sliceForUtcMonth(utcMonthStart(now.getUTCFullYear(), now.getUTCMonth())),
      sliceForUtcMonth(utcMonthStart(now.getUTCFullYear(), now.getUTCMonth() + 1)),
      sliceForUtcMonth(utcMonthStart(now.getUTCFullYear(), now.getUTCMonth() + 2)),
    ];

    for (const s of slices) {
      assertSafePartitionName(s.partitionName);
      await client.query(`
        CREATE TABLE schema_collab.${s.partitionName}
        PARTITION OF schema_collab.audit_logs
        FOR VALUES FROM ('${s.fromInclusive}'::timestamp)
        TO ('${s.toExclusive}'::timestamp)
      `);
    }

    // copy data from legacy if any
    await client.query(`
      INSERT INTO schema_collab.audit_logs (id, actor_sub, actor_email, actor_role, action, resource_type, resource_id, ip_address, user_agent, correlation_id, details, created_at)
      SELECT id, actor_sub, actor_email, actor_role, action, resource_type, resource_id, ip_address, user_agent, correlation_id, details, created_at
      FROM schema_collab.audit_logs_legacy
    `);

    await client.query(`DROP TABLE schema_collab.audit_logs_legacy`);

    await client.query(`
      SELECT setval(
        pg_get_serial_sequence('schema_collab.audit_logs', 'id'),
        COALESCE((SELECT MAX(id) FROM schema_collab.audit_logs), 1),
        true
      )
    `);

    await client.query("COMMIT");
    console.log("Migración audit_logs → particionada por mes en crm-collab completada");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Migración fallida (ROLLBACK aplicado):", err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
