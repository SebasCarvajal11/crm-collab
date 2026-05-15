import type { DbOrTx } from "../collab.repository";
import { and, asc, count, desc, eq, ilike, inArray, isNull, notInArray, or, sql } from "drizzle-orm";

import {
  projectBriefChangeLog,
  projectBriefs,
  projectChangeRequests,
  projectChatMessages,
  projectFiles,
  projectMembers,
  projects,
  projectTaskAssignees,
  projectTaskColumns,
  projectTaskComments,
  projectTasks,
  projectChatMessageReads,
  projectMentionNotifications,
  projectSubtasks,
  projectChatMentions,
} from "../../../db/schema";
import type {
  NewProject,
  NewProjectBrief,
  NewProjectBriefChangeLog,
  NewProjectChangeRequest,
  NewProjectChatMessage,
  NewProjectFile,
  NewProjectTaskAssignee,
  NewProjectTaskComment,
  NewProjectMember,
  NewProjectTask,
  NewProjectTaskColumn,
  NewProjectChatMessageRead,
  NewProjectMentionNotification,
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

export const createProjectsRepository = (conn: DbOrTx) => ({
  syncAllProjectsStatusAndProgress: async () => {
    // ... existing global sync remains for maintenance, but will be removed from critical path
    await conn.execute(sql`
      WITH task_agg AS (
        SELECT
          t.project_id,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE c.key IN ('done','completed'))::int AS done_count,
          COUNT(*) FILTER (WHERE c.key IN ('client_approval','quality_control'))::int AS review_count,
          COUNT(*) FILTER (WHERE c.key <> 'pending')::int AS non_pending_count,
          ROUND(AVG(
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
          ))::int AS progress_avg
        FROM schema_collab.project_tasks t
        INNER JOIN schema_collab.project_task_columns c ON c.id = t.column_id
        GROUP BY t.project_id
      )
      UPDATE schema_collab.projects p
      SET
        status = CASE
          WHEN a.total = a.done_count THEN 'completed'::schema_collab.parent_project_status
          WHEN a.review_count > 0 THEN 'in_review'::schema_collab.parent_project_status
          WHEN a.non_pending_count > 0 THEN 'in_progress'::schema_collab.parent_project_status
          ELSE 'todo'::schema_collab.parent_project_status
        END,
        progress_percent = COALESCE(a.progress_avg, 0),
        updated_at = NOW()
      FROM task_agg a
      WHERE p.id = a.project_id
        AND p.is_archived = false
        AND (
          p.status IS DISTINCT FROM CASE
            WHEN a.total = a.done_count THEN 'completed'::schema_collab.parent_project_status
            WHEN a.review_count > 0 THEN 'in_review'::schema_collab.parent_project_status
            WHEN a.non_pending_count > 0 THEN 'in_progress'::schema_collab.parent_project_status
            ELSE 'todo'::schema_collab.parent_project_status
          END
          OR p.progress_percent IS DISTINCT FROM COALESCE(a.progress_avg, 0)
        );
    `);

    await conn.execute(sql`
      UPDATE schema_collab.projects p
      SET
        status = 'todo'::schema_collab.parent_project_status,
        progress_percent = 0,
        updated_at = NOW()
      WHERE p.is_archived = false
        AND NOT EXISTS (
          SELECT 1
          FROM schema_collab.project_tasks t
          WHERE t.project_id = p.id
        )
        AND (p.status IS DISTINCT FROM 'todo'::schema_collab.parent_project_status OR p.progress_percent IS DISTINCT FROM 0);
    `);
  },

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
    isAdminGlobal: boolean;
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

    if (opts.isAdminGlobal) {
      const [totalCount] = await conn
        .select({ count: count() })
        .from(projects)
        .where(filters);

      const rows = await conn
        .select()
        .from(projects)
        .where(filters)
        .orderBy(desc(projects.updatedAt))
        .limit(opts.limit)
        .offset(opts.offset);

      return { rows, total: totalCount?.count ?? 0 };
    }

    const memberships = await conn
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userSub, opts.userSub))
      .limit(1000);

    const projectIds = memberships.map((m) => m.projectId);
    if (!projectIds.length) return { rows: [], total: 0 };

    const userFilters = and(inArray(projects.id, projectIds), filters);

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
      ${opts.role === "admin"
        ? sql``
        : sql`INNER JOIN schema_collab.project_members pm_scope ON pm_scope.project_id = p.id AND pm_scope.user_sub = ${opts.userSub}`}
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
    return rows.rows ?? [];
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

  getProjectProgressAggregate: async (projectId: string) => {
    const rows = await conn.execute(sql<{
      total: number;
      doneCount: number;
      reviewCount: number;
      nonPendingCount: number;
      progressAvg: number;
    }>`
      SELECT
        COUNT(*)::int AS "total",
        COUNT(*) FILTER (WHERE c.key IN ('done','completed'))::int AS "doneCount",
        COUNT(*) FILTER (WHERE c.key IN ('client_approval','quality_control'))::int AS "reviewCount",
        COUNT(*) FILTER (WHERE c.key <> 'pending')::int AS "nonPendingCount",
        ROUND(AVG(
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
        ))::int AS "progressAvg"
      FROM schema_collab.project_tasks t
      INNER JOIN schema_collab.project_task_columns c ON c.id = t.column_id
      WHERE t.project_id = ${projectId}
    `);
    return rows.rows?.[0] ?? null;
  },

  createProjectMember: async (payload: NewProjectMember) => {
    const [row] = await conn.insert(projectMembers).values(payload).returning();
    return row;
  },

  upsertProjectMember: async (payload: NewProjectMember) => {
    const [row] = await conn
      .insert(projectMembers)
      .values(payload)
      .onConflictDoUpdate({
        target: [projectMembers.projectId, projectMembers.userSub],
        set: { role: payload.role, userEmail: payload.userEmail ?? null, updatedAt: new Date() },
      })
      .returning();
    return row;
  },

  listProjectMembers: async (projectId: string) =>
    conn
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(asc(projectMembers.createdAt)),

  findProjectMember: async (projectId: string, userSub: string) => {
    const [row] = await conn
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userSub, userSub)))
      .limit(1);
    return row ?? null;
  },

  touchProjectMemberActivity: async (projectId: string, userSub: string) => {
    await conn
      .update(projectMembers)
      .set({ lastSeenAt: new Date(), updatedAt: new Date() })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userSub, userSub)));
  },

  createTaskColumn: async (payload: NewProjectTaskColumn) => {
    const [row] = await conn.insert(projectTaskColumns).values(payload).returning();
    return row;
  },

  listTaskColumnsByProject: async (projectId: string) =>
    conn
      .select()
      .from(projectTaskColumns)
      .where(eq(projectTaskColumns.projectId, projectId))
      .orderBy(asc(projectTaskColumns.position)),

  updateTaskColumnById: async (
    columnId: string,
    patch: Partial<Pick<NewProjectTaskColumn, "title" | "position" | "isClientVisible">>
  ) => {
    const [row] = await conn
      .update(projectTaskColumns)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(projectTaskColumns.id, columnId))
      .returning();
    return row ?? null;
  },

  findTaskColumnById: async (columnId: string) => {
    const [row] = await conn.select().from(projectTaskColumns).where(eq(projectTaskColumns.id, columnId)).limit(1);
    return row ?? null;
  },

  createTask: async (payload: NewProjectTask) => {
    const [row] = await conn.insert(projectTasks).values(payload).returning();
    return { ...row, subtasks: [] };
  },

  listTasksByProject: async (opts: {
    projectId: string;
    limit: number;
    offset: number;
    columnId?: string;
    isClientVisible?: boolean;
  }) => {
    const filters = and(
      eq(projectTasks.projectId, opts.projectId),
      opts.columnId ? eq(projectTasks.columnId, opts.columnId) : undefined,
      opts.isClientVisible !== undefined ? eq(projectTasks.isClientVisible, opts.isClientVisible) : undefined
    );

    const [totalCount] = await conn
      .select({ count: count() })
      .from(projectTasks)
      .where(filters);

    const tasks = await conn
      .select()
      .from(projectTasks)
      .where(filters)
      .orderBy(asc(projectTasks.position), asc(projectTasks.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    if (!tasks.length) return { rows: [], total: totalCount?.count ?? 0 };

    const subtasks = await conn
      .select()
      .from(projectSubtasks)
      .where(inArray(projectSubtasks.taskId, tasks.map(t => t.id)))
      .orderBy(asc(projectSubtasks.position), asc(projectSubtasks.createdAt));
    
    const subtasksByTask = new Map<string, any[]>();
    for (const s of subtasks) {
      if (!subtasksByTask.has(s.taskId)) subtasksByTask.set(s.taskId, []);
      subtasksByTask.get(s.taskId)!.push(s);
    }

    return {
      rows: tasks.map((t) => ({ ...t, subtasks: subtasksByTask.get(t.id) ?? [] })),
      total: totalCount?.count ?? 0,
    };
  },

  findTaskById: async (taskId: string) => {
    const [row] = await conn.select().from(projectTasks).where(eq(projectTasks.id, taskId)).limit(1);
    if (!row) return null;
    const subtasks = await conn
      .select()
      .from(projectSubtasks)
      .where(eq(projectSubtasks.taskId, taskId))
      .orderBy(asc(projectSubtasks.position), asc(projectSubtasks.createdAt));
    return { ...row, subtasks };
  },

  upsertSubtasks: async (taskId: string, subtasks: any[]) => {
    if (!subtasks.length) {
      await conn.delete(projectSubtasks).where(eq(projectSubtasks.taskId, taskId));
      return [];
    }

    const incomingIds = subtasks.map(s => s.id).filter(Boolean) as string[];
    
    // Delete ones removed from the list
    if (incomingIds.length > 0) {
      await conn.delete(projectSubtasks).where(
        and(
          eq(projectSubtasks.taskId, taskId),
          notInArray(projectSubtasks.id, incomingIds)
        )
      );
    } else {
      await conn.delete(projectSubtasks).where(eq(projectSubtasks.taskId, taskId));
    }

    // Upsert remaining
    return conn.insert(projectSubtasks).values(
      subtasks.map((s, i) => ({
        id: s.id || undefined,
        taskId,
        title: s.title,
        isCompleted: s.isCompleted,
        assigneeSub: s.assigneeSub || null,
        position: s.position ?? i,
      }))
    ).onConflictDoUpdate({
      target: projectSubtasks.id,
      set: {
        title: sql`excluded.title`,
        isCompleted: sql`excluded.is_completed`,
        assigneeSub: sql`excluded.assignee_sub`,
        position: sql`excluded.position`,
        updatedAt: new Date(),
      }
    }).returning();
  },

  updateTaskById: async (
    taskId: string,
    patch: Partial<
      Pick<
        NewProjectTask,
        | "title"
        | "description"
        | "columnId"
        | "priority"
        | "assigneeSub"
        | "deadline"
        | "checklistProgress"
        | "blockedByTaskId"
        | "isClientVisible"
        | "position"
        | "completedAt"
      >
    >
  ) => {
    const [row] = await conn
      .update(projectTasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(projectTasks.id, taskId))
      .returning();
    return row ?? null;
  },

  createChatMessage: async (payload: NewProjectChatMessage) => {
    const [row] = await conn.insert(projectChatMessages).values(payload).returning();
    return { ...row, mentions: [] };
  },

  createChatMentions: async (messageId: string, userSubs: string[]) => {
    if (!userSubs.length) return [];
    return conn
      .insert(projectChatMentions)
      .values(userSubs.map(sub => ({ messageId, userSub: sub })))
      .returning();
  },

  listChatMessagesByChannel: async (opts: {
    projectId: string;
    channel: "internal" | "external" | "system";
    limit: number;
    offset: number;
  }) => {
    const filters = and(
      eq(projectChatMessages.projectId, opts.projectId),
      eq(projectChatMessages.channel, opts.channel)
    );

    const [totalCount] = await conn
      .select({ count: count() })
      .from(projectChatMessages)
      .where(filters);

    const messages = await conn
      .select()
      .from(projectChatMessages)
      .where(filters)
      .orderBy(desc(projectChatMessages.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    if (!messages.length) return { rows: [], total: totalCount?.count ?? 0 };

    const mentions = await conn
      .select()
      .from(projectChatMentions)
      .where(inArray(projectChatMentions.messageId, messages.map(m => m.id)));
    
    const mentionsByMessage = new Map<string, string[]>();
    for (const m of mentions) {
      if (!mentionsByMessage.has(m.messageId)) mentionsByMessage.set(m.messageId, []);
      mentionsByMessage.get(m.messageId)!.push(m.userSub);
    }

    return {
      rows: [...messages].reverse().map((msg) => ({
        ...msg,
        mentionedSubs: mentionsByMessage.get(msg.id) ?? [],
      })),
      total: totalCount?.count ?? 0,
    };
  },

  findChatMessageByIdInChannel: async (projectId: string, channel: "internal" | "external" | "system", messageId: string) => {
    const [row] = await conn
      .select({ id: projectChatMessages.id, createdAt: projectChatMessages.createdAt })
      .from(projectChatMessages)
      .where(
        and(
          eq(projectChatMessages.id, messageId),
          eq(projectChatMessages.projectId, projectId),
          eq(projectChatMessages.channel, channel)
        )
      )
      .limit(1);
    return row ?? null;
  },

  listChatMessageIdsUpTo: async (projectId: string, channel: "internal" | "external" | "system", createdAt: Date) => {
    const rows = await conn
      .select({ id: projectChatMessages.id })
      .from(projectChatMessages)
      .where(
        and(
          eq(projectChatMessages.projectId, projectId),
          eq(projectChatMessages.channel, channel),
          sql`${projectChatMessages.createdAt} <= ${createdAt}`
        )
      );
    return rows.map((r) => r.id);
  },

  markChatMessagesRead: async (rows: NewProjectChatMessageRead[]) => {
    if (!rows.length) return [];
    return conn
      .insert(projectChatMessageReads)
      .values(rows)
      .onConflictDoUpdate({
        target: [projectChatMessageReads.messageId, projectChatMessageReads.userSub],
        set: { readAt: new Date() },
      })
      .returning();
  },

  listChatReadsByMessages: async (messageIds: string[]) => {
    if (!messageIds.length) return [];
    return conn
      .select()
      .from(projectChatMessageReads)
      .where(inArray(projectChatMessageReads.messageId, messageIds));
  },

  createMentionNotifications: async (rows: NewProjectMentionNotification[]) => {
    if (!rows.length) return [];
    return conn
      .insert(projectMentionNotifications)
      .values(rows)
      .onConflictDoNothing()
      .returning();
  },

  listUnreadMentionNotificationsByUser: async (recipientSub: string) =>
    conn
      .select({
        id: projectMentionNotifications.id,
        projectId: projectMentionNotifications.projectId,
        messageId: projectMentionNotifications.messageId,
        channel: projectMentionNotifications.channel,
        recipientSub: projectMentionNotifications.recipientSub,
        authorSub: projectMentionNotifications.authorSub,
        authorEmail: projectMentionNotifications.authorEmail,
        messagePreview: projectMentionNotifications.messagePreview,
        createdAt: projectMentionNotifications.createdAt,
        projectName: projects.name,
      })
      .from(projectMentionNotifications)
      .innerJoin(projects, eq(projectMentionNotifications.projectId, projects.id))
      .where(
        and(
          eq(projectMentionNotifications.recipientSub, recipientSub),
          eq(projectMentionNotifications.isSeen, false),
          eq(projects.isArchived, false)
        )
      )
      .orderBy(desc(projectMentionNotifications.createdAt))
      .limit(100),

  countUnreadMentionNotificationsByUser: async (recipientSub: string) => {
    const rows = await conn
      .select({ id: projectMentionNotifications.id })
      .from(projectMentionNotifications)
      .innerJoin(projects, eq(projectMentionNotifications.projectId, projects.id))
      .where(
        and(
          eq(projectMentionNotifications.recipientSub, recipientSub),
          eq(projectMentionNotifications.isSeen, false),
          eq(projects.isArchived, false)
        )
      );
    return rows.length;
  },

  markMentionNotificationSeen: async (id: string, recipientSub: string) => {
    const [row] = await conn
      .update(projectMentionNotifications)
      .set({ isSeen: true, seenAt: new Date() })
      .where(
        and(
          eq(projectMentionNotifications.id, id),
          eq(projectMentionNotifications.recipientSub, recipientSub),
          eq(projectMentionNotifications.isSeen, false)
        )
      )
      .returning();
    return row ?? null;
  },

  markMentionNotificationsSeenByMessages: async (recipientSub: string, messageIds: string[]) => {
    if (!messageIds.length) return [];
    return conn
      .update(projectMentionNotifications)
      .set({ isSeen: true, seenAt: new Date() })
      .where(
        and(
          eq(projectMentionNotifications.recipientSub, recipientSub),
          eq(projectMentionNotifications.isSeen, false),
          inArray(projectMentionNotifications.messageId, messageIds)
        )
      )
      .returning();
  },

  createFile: async (payload: NewProjectFile) => {
    const [row] = await conn.insert(projectFiles).values(payload).returning();
    return row;
  },

  listFilesByProject: async (projectId: string, isClientView: boolean) =>
    conn
      .select()
      .from(projectFiles)
      .where(
        and(
          eq(projectFiles.projectId, projectId),
          isClientView ? eq(projectFiles.isClientVisible, true) : undefined
        )
      )
      .orderBy(desc(projectFiles.createdAt)),

  findLatestVersion: async (projectId: string, fileName: string) => {
    const [row] = await conn
      .select()
      .from(projectFiles)
      .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.fileName, fileName)))
      .orderBy(desc(projectFiles.version))
      .limit(1);
    return row ?? null;
  },

  markFileApproved: async (fileId: string, approvedBySub: string) => {
    const [row] = await conn
      .update(projectFiles)
      .set({ approvedByClient: true, approvedBySub, approvedAt: new Date() })
      .where(eq(projectFiles.id, fileId))
      .returning();
    return row ?? null;
  },

  createBrief: async (payload: NewProjectBrief) => {
    const [row] = await conn.insert(projectBriefs).values(payload).returning();
    return row;
  },

  upsertBrief: async (payload: NewProjectBrief) => {
    const [row] = await conn
      .insert(projectBriefs)
      .values(payload)
      .onConflictDoUpdate({
        target: [projectBriefs.projectId],
        set: { content: payload.content, updatedBySub: payload.updatedBySub, updatedAt: new Date() },
      })
      .returning();
    return row;
  },

  getBriefByProject: async (projectId: string) => {
    const [row] = await conn.select().from(projectBriefs).where(eq(projectBriefs.projectId, projectId)).limit(1);
    return row ?? null;
  },

  createChangeRequest: async (payload: NewProjectChangeRequest) => {
    const [row] = await conn.insert(projectChangeRequests).values(payload).returning();
    return row;
  },

  findChangeRequestById: async (changeRequestId: string) => {
    const [row] = await conn
      .select()
      .from(projectChangeRequests)
      .where(eq(projectChangeRequests.id, changeRequestId))
      .limit(1);
    return row ?? null;
  },

  listChangeRequestsByProject: async (projectId: string, type?: "minor" | "formal") =>
    conn
      .select()
      .from(projectChangeRequests)
      .where(
        and(eq(projectChangeRequests.projectId, projectId), type ? eq(projectChangeRequests.type, type) : undefined)
      )
      .orderBy(desc(projectChangeRequests.createdAt)),

  updateChangeRequestById: async (
    changeRequestId: string,
    patch: Partial<
      Pick<
        NewProjectChangeRequest,
        "status" | "resolvedBySub" | "escalatedByWorkerSub" | "description" | "justification" | "title"
      >
    >
  ) => {
    const [row] = await conn
      .update(projectChangeRequests)
      .set({
        ...patch,
        ...(patch.status && patch.status !== "open" ? { resolvedAt: new Date() } : {}),
      })
      .where(eq(projectChangeRequests.id, changeRequestId))
      .returning();
    return row ?? null;
  },

  createBriefChangeLog: async (payload: NewProjectBriefChangeLog) => {
    const [row] = await conn.insert(projectBriefChangeLog).values(payload).returning();
    return row;
  },

  listBriefChangeLog: async (opts: { projectId: string; limit: number; offset: number }) => {
    const filters = eq(projectBriefChangeLog.projectId, opts.projectId);

    const [totalCount] = await conn
      .select({ count: count() })
      .from(projectBriefChangeLog)
      .where(filters);

    const rows = await conn
      .select()
      .from(projectBriefChangeLog)
      .where(filters)
      .orderBy(desc(projectBriefChangeLog.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    return { rows, total: totalCount?.count ?? 0 };
  },

  listProjectCardsByClientSub: async (clientSub: string) =>
    conn
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.isArchived, false),
          or(eq(projects.clientSub, clientSub), isNull(projects.clientSub))
        )
      )
      .orderBy(desc(projects.updatedAt)),

  // ─── Asignados de tarea ────────────────────────────────────────────────

  upsertTaskAssignees: async (taskId: string, assignees: { userSub: string; userEmail: string }[]) => {
    return conn.transaction(async (tx) => {
      await tx.delete(projectTaskAssignees).where(eq(projectTaskAssignees.taskId, taskId));
      if (!assignees.length) return [];
      const values: NewProjectTaskAssignee[] = assignees.map((a) => ({
        taskId,
        userSub: a.userSub,
        userEmail: a.userEmail,
      }));
      return tx.insert(projectTaskAssignees).values(values).returning();
    });
  },

  listTaskAssignees: async (taskId: string) =>
    conn
      .select()
      .from(projectTaskAssignees)
      .where(eq(projectTaskAssignees.taskId, taskId))
      .orderBy(asc(projectTaskAssignees.createdAt)),

  listTaskAssigneesByProject: async (projectId: string) =>
    conn
      .select({ taskId: projectTaskAssignees.taskId, userSub: projectTaskAssignees.userSub, userEmail: projectTaskAssignees.userEmail })
      .from(projectTaskAssignees)
      .innerJoin(projectTasks, eq(projectTaskAssignees.taskId, projectTasks.id))
      .where(eq(projectTasks.projectId, projectId)),

  // ─── Comentarios de tarea ──────────────────────────────────────────────

  createTaskComment: async (payload: NewProjectTaskComment) => {
    const [row] = await conn.insert(projectTaskComments).values(payload).returning();
    return row;
  },

  listTaskComments: async (taskId: string) =>
    conn
      .select()
      .from(projectTaskComments)
      .where(eq(projectTaskComments.taskId, taskId))
      .orderBy(asc(projectTaskComments.createdAt)),

  // ─── Archivos enriquecidos con info de tarea ───────────────────────────

  listFilesWithTaskInfo: async (opts: {
    projectId: string;
    isClientView: boolean;
    limit: number;
    offset: number;
  }) => {
    const filters = and(
      eq(projectFiles.projectId, opts.projectId),
      opts.isClientView ? eq(projectFiles.isClientVisible, true) : undefined
    );

    const [totalCount] = await conn
      .select({ count: count() })
      .from(projectFiles)
      .where(filters);

    const files = await conn
      .select()
      .from(projectFiles)
      .where(filters)
      .orderBy(desc(projectFiles.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    if (!files.length) return { rows: [], total: totalCount?.count ?? 0 };

    const taskIds = [...new Set(files.map((f) => f.taskId).filter(Boolean) as string[])];
    const tasks = taskIds.length
      ? await conn.select({ id: projectTasks.id, title: projectTasks.title, columnId: projectTasks.columnId })
          .from(projectTasks).where(inArray(projectTasks.id, taskIds))
      : [];

    const columnIds = [...new Set(tasks.map((t) => t.columnId))];
    const columns = columnIds.length
      ? await conn.select({ id: projectTaskColumns.id, title: projectTaskColumns.title })
          .from(projectTaskColumns).where(inArray(projectTaskColumns.id, columnIds))
      : [];

    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const colMap  = new Map(columns.map((c) => [c.id, c]));

    return {
      rows: files.map((f) => {
        const task = f.taskId ? taskMap.get(f.taskId) : undefined;
        const col = task ? colMap.get(task.columnId) : undefined;
        return { ...f, taskTitle: task?.title ?? null, currentColumnTitle: col?.title ?? null };
      }),
      total: totalCount?.count ?? 0,
    };
  },

  createFileForTask: async (payload: NewProjectFile) => {
    const [row] = await conn.insert(projectFiles).values(payload).returning();
    return row;
  },

  findFileById: async (fileId: string) => {
    const [row] = await conn.select().from(projectFiles).where(eq(projectFiles.id, fileId)).limit(1);
    return row ?? null;
  },

  deleteFileById: async (fileId: string) => {
    await conn.delete(projectFiles).where(eq(projectFiles.id, fileId));
  },

  updateFileById: async (
    fileId: string,
    patch: { title?: string; description?: string | null; taskId?: string | null; isClientVisible?: boolean }
  ) => {
    const [row] = await conn
      .update(projectFiles)
      .set({
        title: patch.title,
        description: patch.description,
        taskId: patch.taskId,
        isClientVisible: patch.isClientVisible,
      })
      .where(eq(projectFiles.id, fileId))
      .returning();
    return row ?? null;
  },

  listTaskFiles: async (taskId: string) =>
    conn
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.taskId, taskId))
      .orderBy(desc(projectFiles.createdAt)),

  listProjectTimeline: async (projectId: string, isClientView: boolean) => {
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
        AND t.checklist_progress = 100
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
    `);

    return rows.rows ?? [];
  },
});
