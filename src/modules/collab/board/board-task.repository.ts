import type { DbOrTx } from "../shared/db.types";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  projectFiles,
  projectSubtasks,
  projectTaskAssignees,
  projectTaskColumns,
  projectTaskComments,
  projectTasks,
} from "../../../db/schema";
import type {
  NewProjectFile,
  NewProjectTask,
  NewProjectTaskAssignee,
  NewProjectTaskComment,
} from "../collab.types";
import { createBoardSubtaskRepository, loadSubtasksMap } from "./board-subtask.repository";

export const createBoardTaskRepository = (conn: DbOrTx) => ({
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
      opts.isClientVisible !== undefined ? eq(projectTasks.isClientVisible, opts.isClientVisible) : undefined,
    );

    const [[totalCount], tasks] = await Promise.all([
      conn.select({ count: count() }).from(projectTasks).where(filters),
      conn
        .select()
        .from(projectTasks)
        .where(filters)
        .orderBy(asc(projectTasks.position), asc(projectTasks.createdAt))
        .limit(opts.limit)
        .offset(opts.offset),
    ]);

    if (!tasks.length) return { rows: [], total: totalCount?.count ?? 0 };
    const subtasksByTask = await loadSubtasksMap(conn, tasks.map((t) => t.id));

    return {
      rows: tasks.map((t) => ({ ...t, subtasks: subtasksByTask.get(t.id) ?? [] })),
      total: totalCount?.count ?? 0,
    };
  },

  searchTasksByProject: async (opts: {
    projectId: string;
    q: string;
    limit: number;
    isClientVisible?: boolean;
  }) => {
    const sanitized = opts.q
      .trim()
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    const pattern = `%${sanitized}%`;
    const filters = and(
      eq(projectTasks.projectId, opts.projectId),
      opts.isClientVisible !== undefined ? eq(projectTasks.isClientVisible, opts.isClientVisible) : undefined,
      or(
        ilike(projectTasks.title, pattern),
        ilike(projectTasks.description, pattern),
      ),
    );

    const tasks = await conn
      .select()
      .from(projectTasks)
      .where(filters)
      .orderBy(asc(projectTasks.position), asc(projectTasks.createdAt))
      .limit(opts.limit);

    if (!tasks.length) return [];
    const subtasksByTask = await loadSubtasksMap(conn, tasks.map((t) => t.id));
    return tasks.map((t) => ({ ...t, subtasks: subtasksByTask.get(t.id) ?? [] }));
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

  upsertSubtasks: (taskId: string, subtasks: any[]) =>
    createBoardSubtaskRepository(conn).upsertSubtasks(taskId, subtasks),

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
        | "blockReason"
        | "blockType"
        | "blockedAt"
        | "blockedBySub"
        | "clientApprovalRequestedAt"
        | "isClientVisible"
        | "position"
        | "completedAt"
      >
    >,
  ) => {
    const [row] = await conn
      .update(projectTasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(projectTasks.id, taskId))
      .returning();
    return row ?? null;
  },

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

  listTaskAssigneesByProject: async (projectId: string, isClientVisible?: boolean) =>
    conn
      .select({
        taskId: projectTaskAssignees.taskId,
        userSub: projectTaskAssignees.userSub,
        userEmail: projectTaskAssignees.userEmail,
      })
      .from(projectTaskAssignees)
      .innerJoin(projectTasks, eq(projectTaskAssignees.taskId, projectTasks.id))
      .where(
        and(
          eq(projectTasks.projectId, projectId),
          isClientVisible === undefined ? undefined : eq(projectTasks.isClientVisible, isClientVisible),
        ),
      ),

  listTaskCountsByAssigneeByProject: async (projectId: string, isClientVisible?: boolean) => {
    const visibilityFilter = isClientVisible === undefined
      ? sql``
      : sql`AND is_client_visible = ${isClientVisible}`;
    const result = await conn.execute(sql<{ userSub: string; taskCount: number }>`
      WITH assignments AS (
        SELECT id AS task_id, assignee_sub AS user_sub
        FROM schema_collab.project_tasks
        WHERE project_id = ${projectId}::uuid
          AND assignee_sub IS NOT NULL
          ${visibilityFilter}

        UNION

        SELECT task_assignees.task_id, task_assignees.user_sub
        FROM schema_collab.project_task_assignees AS task_assignees
        INNER JOIN schema_collab.project_tasks AS tasks ON tasks.id = task_assignees.task_id
        WHERE tasks.project_id = ${projectId}::uuid
          ${isClientVisible === undefined ? sql`` : sql`AND tasks.is_client_visible = ${isClientVisible}`}
      )
      SELECT user_sub AS "userSub", COUNT(*)::int AS "taskCount"
      FROM assignments
      GROUP BY user_sub
    `);
    return (result.rows ?? []) as Array<{ userSub: string; taskCount: number }>;
  },

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

  listFilesWithTaskInfo: async (opts: {
    projectId: string;
    isClientView: boolean;
    limit: number;
    offset: number;
  }) => {
    const filters = and(
      eq(projectFiles.projectId, opts.projectId),
      opts.isClientView ? eq(projectFiles.isClientVisible, true) : undefined,
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
      ? await conn
          .select({ id: projectTasks.id, title: projectTasks.title, columnId: projectTasks.columnId })
          .from(projectTasks)
          .where(inArray(projectTasks.id, taskIds))
      : [];

    const columnIds = [...new Set(tasks.map((t) => t.columnId))];
    const columns = columnIds.length
      ? await conn
          .select({ id: projectTaskColumns.id, title: projectTaskColumns.title })
          .from(projectTaskColumns)
          .where(inArray(projectTaskColumns.id, columnIds))
      : [];

    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const colMap = new Map(columns.map((c) => [c.id, c]));

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
});
