import type { DbOrTx } from "../shared/db.types";
import { and, asc, count, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
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
  NewProjectTaskColumn,
  NewProjectTaskComment,
} from "../collab.types";
import { defaultColumnsByType } from "../shared/constants";
import type { ProjectType } from "../collab.types";

export const createBoardRepository = (conn: DbOrTx) => ({
  createTaskColumn: async (payload: NewProjectTaskColumn) => {
    const [row] = await conn.insert(projectTaskColumns).values(payload).returning();
    return row;
  },

  createDefaultTaskColumns: async (projectId: string, type: ProjectType) => {
    const columns = defaultColumnsByType(type);
    const values: NewProjectTaskColumn[] = columns.map((c) => ({
      projectId,
      key: c.key as never,
      title: c.title,
      position: c.position,
      isClientVisible: c.isClientVisible,
      isDefault: true,
    }));
    return conn.insert(projectTaskColumns).values(values).returning();
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
});
