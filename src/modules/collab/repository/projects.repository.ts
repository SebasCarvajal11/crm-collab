import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../../../db/connection";
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
} from "../collab.types";

export const projectsRepository = {
  createProject: async (payload: NewProject) => {
    const [project] = await db.insert(projects).values(payload).returning();
    return project;
  },

  listProjectsForUser: async (opts: {
    userSub: string;
    isAdminGlobal: boolean;
    type?: "campaign_service" | "product_order";
    status?: "todo" | "in_progress" | "in_review" | "completed";
    adminResponsibleSub?: string;
    limit: number;
    offset: number;
  }) => {
    if (opts.isAdminGlobal) {
      return db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.isArchived, false),
            opts.type ? eq(projects.type, opts.type) : undefined,
            opts.status ? eq(projects.status, opts.status) : undefined,
            opts.adminResponsibleSub
              ? eq(projects.adminResponsibleSub, opts.adminResponsibleSub)
              : undefined
          )
        )
        .orderBy(desc(projects.updatedAt))
        .limit(opts.limit)
        .offset(opts.offset);
    }

    const memberships = await db
      .select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userSub, opts.userSub))
      .limit(500);
    const projectIds = memberships.map((m) => m.projectId);
    if (!projectIds.length) return [];

    return db
      .select()
      .from(projects)
      .where(
        and(
          inArray(projects.id, projectIds),
          eq(projects.isArchived, false),
          opts.type ? eq(projects.type, opts.type) : undefined,
          opts.status ? eq(projects.status, opts.status) : undefined,
          opts.adminResponsibleSub
            ? eq(projects.adminResponsibleSub, opts.adminResponsibleSub)
            : undefined
        )
      )
      .orderBy(desc(projects.updatedAt))
      .limit(opts.limit)
      .offset(opts.offset);
  },

  findProjectById: async (projectId: string) => {
    const [row] = await db
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
    const [row] = await db
      .update(projects)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();
    return row ?? null;
  },

  createProjectMember: async (payload: NewProjectMember) => {
    const [row] = await db.insert(projectMembers).values(payload).returning();
    return row;
  },

  upsertProjectMember: async (payload: NewProjectMember) => {
    const [row] = await db
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
    db
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(asc(projectMembers.createdAt)),

  findProjectMember: async (projectId: string, userSub: string) => {
    const [row] = await db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userSub, userSub)))
      .limit(1);
    return row ?? null;
  },

  createTaskColumn: async (payload: NewProjectTaskColumn) => {
    const [row] = await db.insert(projectTaskColumns).values(payload).returning();
    return row;
  },

  listTaskColumnsByProject: async (projectId: string) =>
    db
      .select()
      .from(projectTaskColumns)
      .where(eq(projectTaskColumns.projectId, projectId))
      .orderBy(asc(projectTaskColumns.position)),

  updateTaskColumnById: async (
    columnId: string,
    patch: Partial<Pick<NewProjectTaskColumn, "title" | "position" | "isClientVisible">>
  ) => {
    const [row] = await db
      .update(projectTaskColumns)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(projectTaskColumns.id, columnId))
      .returning();
    return row ?? null;
  },

  findTaskColumnById: async (columnId: string) => {
    const [row] = await db.select().from(projectTaskColumns).where(eq(projectTaskColumns.id, columnId)).limit(1);
    return row ?? null;
  },

  createTask: async (payload: NewProjectTask) => {
    const [row] = await db.insert(projectTasks).values(payload).returning();
    return row;
  },

  listTasksByProject: async (projectId: string) =>
    db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.projectId, projectId))
      .orderBy(asc(projectTasks.position), asc(projectTasks.createdAt)),

  findTaskById: async (taskId: string) => {
    const [row] = await db.select().from(projectTasks).where(eq(projectTasks.id, taskId)).limit(1);
    return row ?? null;
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
        | "subtasks"
      >
    >
  ) => {
    const [row] = await db
      .update(projectTasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(projectTasks.id, taskId))
      .returning();
    return row ?? null;
  },

  createChatMessage: async (payload: NewProjectChatMessage) => {
    const [row] = await db.insert(projectChatMessages).values(payload).returning();
    return row;
  },

  listChatMessagesByChannel: async (projectId: string, channel: "internal" | "external" | "system") =>
    db
      .select()
      .from(projectChatMessages)
      .where(and(eq(projectChatMessages.projectId, projectId), eq(projectChatMessages.channel, channel)))
      .orderBy(asc(projectChatMessages.createdAt)),

  createFile: async (payload: NewProjectFile) => {
    const [row] = await db.insert(projectFiles).values(payload).returning();
    return row;
  },

  listFilesByProject: async (projectId: string, isClientView: boolean) =>
    db
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
    const [row] = await db
      .select()
      .from(projectFiles)
      .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.fileName, fileName)))
      .orderBy(desc(projectFiles.version))
      .limit(1);
    return row ?? null;
  },

  markFileApproved: async (fileId: string, approvedBySub: string) => {
    const [row] = await db
      .update(projectFiles)
      .set({ approvedByClient: true, approvedBySub, approvedAt: new Date() })
      .where(eq(projectFiles.id, fileId))
      .returning();
    return row ?? null;
  },

  createBrief: async (payload: NewProjectBrief) => {
    const [row] = await db.insert(projectBriefs).values(payload).returning();
    return row;
  },

  upsertBrief: async (payload: NewProjectBrief) => {
    const [row] = await db
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
    const [row] = await db.select().from(projectBriefs).where(eq(projectBriefs.projectId, projectId)).limit(1);
    return row ?? null;
  },

  createChangeRequest: async (payload: NewProjectChangeRequest) => {
    const [row] = await db.insert(projectChangeRequests).values(payload).returning();
    return row;
  },

  findChangeRequestById: async (changeRequestId: string) => {
    const [row] = await db
      .select()
      .from(projectChangeRequests)
      .where(eq(projectChangeRequests.id, changeRequestId))
      .limit(1);
    return row ?? null;
  },

  listChangeRequestsByProject: async (projectId: string, type?: "minor" | "formal") =>
    db
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
    const [row] = await db
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
    const [row] = await db.insert(projectBriefChangeLog).values(payload).returning();
    return row;
  },

  listBriefChangeLog: async (projectId: string) =>
    db
      .select()
      .from(projectBriefChangeLog)
      .where(eq(projectBriefChangeLog.projectId, projectId))
      .orderBy(desc(projectBriefChangeLog.createdAt)),

  listProjectCardsByClientSub: async (clientSub: string) =>
    db
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
    await db.delete(projectTaskAssignees).where(eq(projectTaskAssignees.taskId, taskId));
    if (!assignees.length) return [];
    const values: NewProjectTaskAssignee[] = assignees.map((a) => ({
      taskId,
      userSub: a.userSub,
      userEmail: a.userEmail,
    }));
    return db.insert(projectTaskAssignees).values(values).returning();
  },

  listTaskAssignees: async (taskId: string) =>
    db
      .select()
      .from(projectTaskAssignees)
      .where(eq(projectTaskAssignees.taskId, taskId))
      .orderBy(asc(projectTaskAssignees.createdAt)),

  listTaskAssigneesByProject: async (projectId: string) =>
    db
      .select({ taskId: projectTaskAssignees.taskId, userSub: projectTaskAssignees.userSub, userEmail: projectTaskAssignees.userEmail })
      .from(projectTaskAssignees)
      .innerJoin(projectTasks, eq(projectTaskAssignees.taskId, projectTasks.id))
      .where(eq(projectTasks.projectId, projectId)),

  // ─── Comentarios de tarea ──────────────────────────────────────────────

  createTaskComment: async (payload: NewProjectTaskComment) => {
    const [row] = await db.insert(projectTaskComments).values(payload).returning();
    return row;
  },

  listTaskComments: async (taskId: string) =>
    db
      .select()
      .from(projectTaskComments)
      .where(eq(projectTaskComments.taskId, taskId))
      .orderBy(asc(projectTaskComments.createdAt)),

  // ─── Archivos enriquecidos con info de tarea ───────────────────────────

  listFilesWithTaskInfo: async (projectId: string, isClientView: boolean) => {
    const files = await db
      .select()
      .from(projectFiles)
      .where(
        and(
          eq(projectFiles.projectId, projectId),
          isClientView ? eq(projectFiles.isClientVisible, true) : undefined
        )
      )
      .orderBy(desc(projectFiles.createdAt));

    if (!files.some((f) => f.taskId)) return files.map((f) => ({ ...f, taskTitle: null, currentColumnTitle: null }));

    const taskIds = [...new Set(files.map((f) => f.taskId).filter(Boolean) as string[])];
    const tasks = taskIds.length
      ? await db.select({ id: projectTasks.id, title: projectTasks.title, columnId: projectTasks.columnId })
          .from(projectTasks).where(inArray(projectTasks.id, taskIds))
      : [];

    const columnIds = [...new Set(tasks.map((t) => t.columnId))];
    const columns = columnIds.length
      ? await db.select({ id: projectTaskColumns.id, title: projectTaskColumns.title })
          .from(projectTaskColumns).where(inArray(projectTaskColumns.id, columnIds))
      : [];

    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const colMap  = new Map(columns.map((c) => [c.id, c]));

    return files.map((f) => {
      const task = f.taskId ? taskMap.get(f.taskId) : undefined;
      const col  = task ? colMap.get(task.columnId) : undefined;
      return { ...f, taskTitle: task?.title ?? null, currentColumnTitle: col?.title ?? null };
    });
  },

  createFileForTask: async (payload: NewProjectFile) => {
    const [row] = await db.insert(projectFiles).values(payload).returning();
    return row;
  },

  findFileById: async (fileId: string) => {
    const [row] = await db.select().from(projectFiles).where(eq(projectFiles.id, fileId)).limit(1);
    return row ?? null;
  },

  deleteFileById: async (fileId: string) => {
    await db.delete(projectFiles).where(eq(projectFiles.id, fileId));
  },

  listTaskFiles: async (taskId: string) =>
    db
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.taskId, taskId))
      .orderBy(desc(projectFiles.createdAt)),
};
