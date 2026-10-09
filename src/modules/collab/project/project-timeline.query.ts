import { sql } from "drizzle-orm";
import type { ProjectTimelineItemRow } from "../collab.types";

export function buildTimelineCountSql(projectId: string, isClientView: boolean) {
  return sql<{ total: string }>`
    SELECT COUNT(*)::int as "total"
    FROM (
      SELECT f.id FROM schema_collab.project_files f
      WHERE f.project_id = ${projectId}
        AND (${isClientView} = false OR f.is_client_visible = true)
      UNION ALL
      SELECT t.id FROM schema_collab.project_tasks t
      INNER JOIN schema_collab.project_task_columns c ON c.id = t.column_id
      WHERE t.project_id = ${projectId}
        AND t.completed_at IS NOT NULL
        AND c.key IN ('done', 'completed')
        AND (${isClientView} = false OR t.is_client_visible = true)
      UNION ALL
      SELECT cr.id FROM schema_collab.project_change_requests cr
      LEFT JOIN schema_collab.project_tasks t ON t.id = cr.task_id
      WHERE cr.project_id = ${projectId}
        AND cr.status IN ('accepted', 'approved', 'rejected')
        AND cr.resolved_at IS NOT NULL
        AND (${isClientView} = false OR COALESCE(t.is_client_visible, true) = true)
    ) AS unified_timeline
  `;
}

export function buildTimelineRowsSql(
  projectId: string,
  isClientView: boolean,
  limit: number,
  offset: number
) {
  return sql<ProjectTimelineItemRow>`
    SELECT
      f.id AS "id",
      'file'::text AS "kind",
      'Archivo'::text AS "label",
      COALESCE(f.title, f.file_name) AS "title",
      f.created_at AS "occurredAt",
      f.id AS "fileId",
      f.file_name AS "fileName",
      f.mime_type AS "mimeType",
      f.task_id AS "taskId",
      NULL::uuid AS "changeRequestId",
      f.created_by_sub AS "createdBySub",
      f.created_by_email AS "createdByEmail",
      f.is_client_visible AS "isClientVisible",
      NULL::uuid AS "requestedBySub",
      NULL::uuid AS "resolvedBySub",
      NULL::text AS "resolutionComment",
      f.is_purged AS "isPurged",
      f.purged_at AS "purgedAt",
      f.purged_reason AS "purgedReason"
    FROM schema_collab.project_files f
    WHERE f.project_id = ${projectId}
      AND (${isClientView} = false OR f.is_client_visible = true)

    UNION ALL

    SELECT
      t.id AS "id",
      'task_completed'::text AS "kind",
      'Tarea finalizada'::text AS "label",
      t.title AS "title",
      t.completed_at AS "occurredAt",
      NULL::uuid AS "fileId",
      NULL::varchar AS "fileName",
      NULL::varchar AS "mimeType",
      t.id AS "taskId",
      NULL::uuid AS "changeRequestId",
      t.assignee_sub AS "createdBySub",
      NULL::varchar AS "createdByEmail",
      t.is_client_visible AS "isClientVisible",
      NULL::uuid AS "requestedBySub",
      NULL::uuid AS "resolvedBySub",
      NULL::text AS "resolutionComment",
      false AS "isPurged",
      NULL::timestamp AS "purgedAt",
      NULL::varchar AS "purgedReason"
    FROM schema_collab.project_tasks t
    INNER JOIN schema_collab.project_task_columns c ON c.id = t.column_id
    WHERE t.project_id = ${projectId}
      AND t.completed_at IS NOT NULL
      AND c.key IN ('done', 'completed')
      AND (${isClientView} = false OR t.is_client_visible = true)

    UNION ALL

    SELECT
      cr.id AS "id",
      CASE
        WHEN cr.status = 'rejected' THEN 'change_rejected'::text
        ELSE 'change_accepted'::text
      END AS "kind",
      CASE
        WHEN cr.status = 'rejected' THEN 'Cambio rechazado'::text
        ELSE 'Cambio aceptado'::text
      END AS "label",
      cr.title AS "title",
      cr.resolved_at AS "occurredAt",
      NULL::uuid AS "fileId",
      NULL::varchar AS "fileName",
      NULL::varchar AS "mimeType",
      cr.task_id AS "taskId",
      cr.id AS "changeRequestId",
      cr.resolved_by_sub AS "createdBySub",
      NULL::varchar AS "createdByEmail",
      COALESCE(t.is_client_visible, true) AS "isClientVisible",
      cr.requested_by_sub AS "requestedBySub",
      cr.resolved_by_sub AS "resolvedBySub",
      cr.resolution_comment AS "resolutionComment",
      false AS "isPurged",
      NULL::timestamp AS "purgedAt",
      NULL::varchar AS "purgedReason"
    FROM schema_collab.project_change_requests cr
    LEFT JOIN schema_collab.project_tasks t ON t.id = cr.task_id
    WHERE cr.project_id = ${projectId}
      AND cr.status IN ('accepted', 'approved', 'rejected')
      AND cr.resolved_at IS NOT NULL
      AND (${isClientView} = false OR COALESCE(t.is_client_visible, true) = true)

    ORDER BY "occurredAt" DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}
