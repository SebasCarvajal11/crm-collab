import type { DbOrTx } from "../shared/db.types";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { ProjectStatusSnapshot, ProjectTaskSnapshot, TaskColumnKey } from "../domain/project-aggregate";

import {
  projectMembers,
  projects,
} from "../../../db/schema";
import type {
  NewProject,
} from "../collab.types";

type ProjectTimelineItemRow = {
  id: string;
  kind: "file" | "task_completed" | "change_accepted";
  label: "Archivo" | "Tarea finalizada" | "Cambio aceptado";
  title: string;
  occurredAt: Date;
  fileId: string | null;
  fileName: string | null;
  mimeType: string | null;
  taskId: string | null;
  changeRequestId: string | null;
  createdBySub: string | null;
  createdByEmail: string | null;
  isClientVisible: boolean;
};

export const createProjectRepository = (conn: DbOrTx) => ({
  syncProjectStatusAndProgress: async (projectId: string) => {
    await conn.execute(sql`
      WITH task_agg AS (
        SELECT
          COUNT(t.id)::int AS total,
          COUNT(t.id) FILTER (WHERE c.key IN ('done','completed'))::int AS done_count,
          COUNT(t.id) FILTER (WHERE c.key IN ('client_approval','quality_control'))::int AS review_count,
          COUNT(t.id) FILTER (WHERE c.key <> 'pending')::int AS non_pending_count,
          COALESCE(ROUND(AVG(
            CASE c.key
              WHEN 'pending' THEN 0
              WHEN 'doing' THEN 25
              WHEN 'internal_review' THEN 50
              WHEN 'client_approval' THEN 75
              WHEN 'done' THEN 100
              WHEN 'blocked' THEN 10
              WHEN 'waiting_material' THEN 10
              WHEN 'completed' THEN 100
              WHEN 'in_production' THEN 60
              WHEN 'quality_control' THEN 80
              WHEN 'shipped' THEN 100
              WHEN 'art_approved' THEN 30
              ELSE 0
            END
          ))::int, 0) AS progress_avg
        FROM schema_collab.projects p
        LEFT JOIN schema_collab.project_tasks t ON t.project_id = p.id
        LEFT JOIN schema_collab.project_task_columns c ON c.id = t.column_id
        WHERE p.id = ${projectId}
        GROUP BY p.id
      )
      UPDATE schema_collab.projects p
      SET
        status = CASE
          WHEN a.total > 0 AND a.total = a.done_count THEN 'completed'::schema_collab.parent_project_status
          WHEN a.total > 0 AND a.review_count > 0 THEN 'in_review'::schema_collab.parent_project_status
          WHEN a.total > 0 AND a.non_pending_count > 0 THEN 'in_progress'::schema_collab.parent_project_status
          ELSE 'todo'::schema_collab.parent_project_status
        END,
        progress_percent = a.progress_avg,
        updated_at = NOW()
      FROM task_agg a
      WHERE p.id = ${projectId};
    `);
  },

  createProject: async (payload: NewProject) => {
    const [project] = await conn.insert(projects).values(payload).returning();
    return project;
  },

  listProjectsForUser: async (opts: {
    userSub: string;
    type?: "campaign_service" | "product_order";
    status?: "todo" | "in_progress" | "in_review" | "completed";
    adminResponsibleSub?: string;
    clientName?: string;
    limit: number;
    offset: number;
  }) => {
    const filters = and(
      eq(projects.isArchived, false),
      opts.type ? eq(projects.type, opts.type) : undefined,
      opts.status ? eq(projects.status, opts.status) : undefined,
      opts.adminResponsibleSub
        ? eq(projects.adminResponsibleSub, opts.adminResponsibleSub)
        : undefined,
      opts.clientName ? ilike(projects.clientName, `%${opts.clientName}%`) : undefined
    );

    const userFilters = and(
      inArray(
        projects.id,
        conn
          .select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(eq(projectMembers.userSub, opts.userSub))
      ),
      filters
    );

    const [totalCount] = await conn
      .select({ count: count() })
      .from(projects)
      .where(userFilters);

    const rows = await conn
      .select()
      .from(projects)
      .where(userFilters)
      .orderBy(desc(projects.updatedAt))
      .limit(opts.limit)
      .offset(opts.offset);

    return { rows, total: totalCount?.count ?? 0 };
  },

  searchProjectsForUser: async (opts: {
    userSub: string;
    role: "admin" | "worker" | "client";
    q: string;
    limit: number;
  }) => {
    const needle = `%${opts.q.trim().toLowerCase()}%`;
    const canSearchClientFields = opts.role === "admin" || opts.role === "worker";

    const rows = await conn.execute(sql<{
      id: string;
      name: string;
      clientName: string;
      clientEmail: string | null;
      type: "campaign_service" | "product_order";
      status: "todo" | "in_progress" | "in_review" | "completed";
      progressPercent: number;
    }>`
      SELECT
        p.id AS "id",
        p.name AS "name",
        p.client_name AS "clientName",
        MAX(pm_client.user_email) AS "clientEmail",
        p.type AS "type",
        p.status AS "status",
        p.progress_percent AS "progressPercent"
      FROM schema_collab.projects p
      LEFT JOIN schema_collab.project_members pm_client
        ON pm_client.project_id = p.id AND pm_client.role = 'client'
      INNER JOIN schema_collab.project_members pm_scope
        ON pm_scope.project_id = p.id AND pm_scope.user_sub = ${opts.userSub}
      WHERE
        p.is_archived = false
        AND (
          LOWER(p.name) LIKE ${needle}
          ${canSearchClientFields ? sql` OR LOWER(p.client_name) LIKE ${needle} OR LOWER(COALESCE(pm_client.user_email, '')) LIKE ${needle}` : sql``}
        )
      GROUP BY p.id, p.name, p.client_name, p.type, p.status, p.progress_percent, p.updated_at
      ORDER BY p.updated_at DESC
      LIMIT ${opts.limit}
    `);
    return (rows.rows ?? []) as ProjectTaskSnapshot[];
  },

  findProjectById: async (projectId: string) => {
    const [row] = await conn
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.isArchived, false)))
      .limit(1);
    return row ?? null;
  },

  updateProjectById: async (
    projectId: string,
    patch: Partial<
      Pick<
        NewProject,
        | "name"
        | "description"
        | "status"
        | "progressPercent"
        | "estimatedDueDate"
        | "unreadNotifications"
        | "latestApprovedFileId"
      >
    >
  ) => {
    const [row] = await conn
      .update(projects)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();
    return row ?? null;
  },

  updateProjectSummary: async (projectId: string, summary: ProjectStatusSnapshot) => {
    const [row] = await conn
      .update(projects)
      .set({
        status: summary.status,
        progressPercent: summary.progressPercent,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning();
    return row ?? null;
  },

  listTaskStatusSnapshotsByProject: async (projectId: string) => {
    const rows = await conn.execute(sql<{
      columnKey: TaskColumnKey;
      checklistProgress: number;
    }>`
      SELECT
        c.key AS "columnKey",
        t.checklist_progress AS "checklistProgress"
      FROM schema_collab.project_tasks t
      INNER JOIN schema_collab.project_task_columns c ON c.id = t.column_id
      WHERE t.project_id = ${projectId}
      ORDER BY t.position ASC, t.created_at ASC
    `);

    return (rows.rows ?? []) as ProjectTaskSnapshot[];
  },

  listProjectTimeline: async (projectId: string, isClientView: boolean, page = 1, limit = 20) => {
    const offset = (page - 1) * limit;

    const countRes = await conn.execute<{ total: string }>(sql`
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
          AND cr.status IN ('accepted', 'approved')
          AND cr.resolved_at IS NOT NULL
          AND (${isClientView} = false OR COALESCE(t.is_client_visible, true) = true)
      ) AS unified_timeline
    `);
    const total = Number(countRes.rows?.[0]?.total ?? 0);

    const rows = await conn.execute<ProjectTimelineItemRow>(sql`
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
        f.is_client_visible AS "isClientVisible"
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
        t.is_client_visible AS "isClientVisible"
      FROM schema_collab.project_tasks t
      INNER JOIN schema_collab.project_task_columns c ON c.id = t.column_id
      WHERE t.project_id = ${projectId}
        AND t.completed_at IS NOT NULL
        AND c.key IN ('done', 'completed')
        AND (${isClientView} = false OR t.is_client_visible = true)

      UNION ALL

      SELECT
        cr.id AS "id",
        'change_accepted'::text AS "kind",
        'Cambio aceptado'::text AS "label",
        cr.title AS "title",
        cr.resolved_at AS "occurredAt",
        NULL::uuid AS "fileId",
        NULL::varchar AS "fileName",
        NULL::varchar AS "mimeType",
        cr.task_id AS "taskId",
        cr.id AS "changeRequestId",
        cr.resolved_by_sub AS "createdBySub",
        NULL::varchar AS "createdByEmail",
        COALESCE(t.is_client_visible, true) AS "isClientVisible"
      FROM schema_collab.project_change_requests cr
      LEFT JOIN schema_collab.project_tasks t ON t.id = cr.task_id
      WHERE cr.project_id = ${projectId}
        AND cr.status IN ('accepted', 'approved')
        AND cr.resolved_at IS NOT NULL
        AND (${isClientView} = false OR COALESCE(t.is_client_visible, true) = true)

      ORDER BY "occurredAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    return { items: rows.rows ?? [], total };
  },
});
