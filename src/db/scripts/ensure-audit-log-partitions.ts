import type { Pool } from "pg";
import {
  assertSafePartitionName,
  sliceForUtcMonth,
  utcMonthStart,
  type MonthSlice,
} from "./audit-partition-utils";

const SCHEMA = "schema_collab";

async function tableKind(pool: Pool, table: string): Promise<string | null> {
  const r = await pool.query<{ relkind: string }>(
    `SELECT c.relkind
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = $1 AND c.relname = $2`,
    [SCHEMA, table],
  );
  return r.rows[0]?.relkind ?? null;
}

async function createPartition(pool: Pool, slice: MonthSlice): Promise<void> {
  assertSafePartitionName(slice.partitionName);
  const sql = `
    CREATE TABLE ${SCHEMA}.${slice.partitionName}
    PARTITION OF ${SCHEMA}.audit_logs
    FOR VALUES FROM ('${slice.fromInclusive}'::timestamp)
    TO ('${slice.toExclusive}'::timestamp)
  `;
  try {
    await pool.query(sql);
  } catch (e: unknown) {
    const code = typeof e === "object" && e && "code" in e ? String((e as { code: string }).code) : "";
    if (code === "42P07") return;
    throw e;
  }
}

/** Mes actual UTC y los dos siguientes (idempotente). Solo si `audit_logs` es tabla padre particionada. */
export async function ensureAuditLogPartitions(pool: Pool): Promise<void> {
  const kind = await tableKind(pool, "audit_logs");
  if (!kind) return;
  if (kind !== "p") {
    console.warn(
      `[audit_logs] ${SCHEMA}.audit_logs no está particionada (relkind ≠ p). Ejecuta la migración de particiones antes.`,
    );
    return;
  }

  const now = new Date();
  const slices: MonthSlice[] = [];
  for (let i = 0; i < 3; i++) {
    const d = utcMonthStart(now.getUTCFullYear(), now.getUTCMonth() + i);
    slices.push(sliceForUtcMonth(d));
  }

  for (const s of slices) {
    await createPartition(pool, s);
  }
}
