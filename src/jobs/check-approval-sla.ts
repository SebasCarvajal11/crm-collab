import { sql } from "drizzle-orm";
import { db } from "../db/connection";
import { getLogger } from "../shared/logger";
import { collabEvents } from "../modules/collab/events";

const logger = getLogger();

export interface SlaCheckResult {
  blockedCount: number;
  taskIds: string[];
}

/**
 * Busca tareas en columnas de 'client_approval' cuyo tiempo supere el SLA (48 horas)
 * y las transiciona de manera atómica y concurrente a la columna 'blocked' del proyecto.
 */
export async function checkClientApprovalSla(
  timeoutHours = 48,
): Promise<SlaCheckResult> {
  const result = await db.execute<{
    id: string;
    project_id: string;
    title: string;
  }>(sql`
    WITH timed_out_tasks AS (
      SELECT
        t.id AS task_id,
        t.project_id,
        t.title,
        target_col.id AS blocked_column_id
      FROM schema_collab.project_tasks t
      JOIN schema_collab.project_task_columns current_col
        ON current_col.id = t.column_id
      JOIN schema_collab.project_task_columns target_col
        ON target_col.project_id = t.project_id AND target_col.key = 'blocked'
      WHERE current_col.key = 'client_approval'
        AND COALESCE(t.client_approval_requested_at, t.updated_at, t.created_at) <= NOW() - (${timeoutHours} * INTERVAL '1 HOUR')
      LIMIT 100
      FOR UPDATE OF t SKIP LOCKED
    )
    UPDATE schema_collab.project_tasks pt
    SET
      column_id = tot.blocked_column_id,
      block_reason = 'Tiempo de espera de aprobación del cliente expirado (48 horas sin respuesta)',
      block_type = 'client_timeout',
      blocked_at = NOW(),
      blocked_by_sub = NULL,
      is_client_visible = true,
      updated_at = NOW()
    FROM timed_out_tasks tot
    WHERE pt.id = tot.task_id
    RETURNING pt.id, pt.project_id, pt.title;
  `);

  const rows = result.rows ?? [];
  const taskIds: string[] = [];

  for (const row of rows) {
    taskIds.push(row.id);
    logger.warn(
      { taskId: row.id, projectId: row.project_id, title: row.title },
      "[SLA-Check] Tarea bloqueada automáticamente por timeout de aprobación de cliente (48h)",
    );

    try {
      await collabEvents.emit(
        "task.blocked",
        row.project_id,
        "00000000-0000-0000-0000-000000000000",
        {
          taskId: row.id,
          taskTitle: row.title,
          blockReason:
            "Tiempo de espera de aprobación del cliente expirado (48 horas sin respuesta)",
          blockType: "client_timeout",
        },
      );
    } catch (err) {
      logger.error(
        { err, taskId: row.id },
        "[SLA-Check] Error emitiendo evento de tarea bloqueada por SLA",
      );
    }
  }

  return {
    blockedCount: rows.length,
    taskIds,
  };
}
