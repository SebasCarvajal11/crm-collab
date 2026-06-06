import type { Context } from "hono";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { validatedJson, validatedQuery } from "../validated-json";
import { actorFromContext } from "../actor";
import type {
  CreateColumnBody,
  UpdateColumnBody,
  CreateTaskBody,
  UpdateTaskBody,
  ProjectTasksQuery,
  CreateTaskCommentBody,
  CreateTaskFileMetadataBody,
} from "../collab.schemas";
import type { createBoardService } from "./board.service";

const getIp = (c: Context) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
  c.req.header("x-real-ip")?.trim() ??
  "unknown";
const getUa = (c: Context) => c.req.header("user-agent") ?? "unknown";
const requiredParam = (c: Context, key: string) => c.req.param(key) ?? "";

export const createBoardController = (service: ReturnType<typeof createBoardService>) => ({
  createTaskColumn: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateColumnBody>(c);
    const row = await service.createTaskColumn(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      {
        key: body.key,
        title: body.title,
        position: body.position,
        isClientVisible: body.is_client_visible,
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 201);
  },

  listTaskColumns: async (c: Context<AppEnv>) => {
    const rows = await service.listTaskColumns(actorFromContext(c), requiredParam(c, "projectId"));
    return c.json({ data: rows }, 200);
  },

  updateTaskColumn: async (c: Context<AppEnv>) => {
    const body = validatedJson<UpdateColumnBody>(c);
    const row = await service.updateTaskColumn(
      actorFromContext(c),
      requiredParam(c, "columnId"),
      {
        title: body.title,
        position: body.position,
        isClientVisible: body.is_client_visible,
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 200);
  },

  createTask: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateTaskBody>(c);
    const row = await service.createTask(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      {
        columnId: body.column_id,
        title: body.title,
        description: body.description,
        priority: body.priority,
        assignees: body.assignees?.map((a) => ({ userSub: a.user_sub, userEmail: a.user_email })),
        dueDate: body.due_date,
        checklistProgress: body.checklist_progress,
        blockedByTaskId: body.blocked_by_task_id,
        clientVisible: body.client_visible,
        position: body.position,
        subtasks: body.subtasks?.map((s) => ({ id: s.id, title: s.title, isCompleted: s.is_completed, assigneeSub: s.assignee_sub ?? null })),
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 201);
  },

  listTasks: async (c: Context<AppEnv>) => {
    const q = validatedQuery<ProjectTasksQuery>(c);
    const result = await service.listTasksByProject(actorFromContext(c), requiredParam(c, "projectId"), {
      page: q.page,
      limit: q.limit,
      columnId: q.column_id,
    });
    return c.json({ data: result }, 200);
  },

  updateTask: async (c: Context<AppEnv>) => {
    const body = validatedJson<UpdateTaskBody>(c);
    const row = await service.updateTask(
      actorFromContext(c),
      requiredParam(c, "taskId"),
      {
        columnId: body.column_id,
        title: body.title,
        description: body.description,
        priority: body.priority,
        assignees: body.assignees?.map((a) => ({ userSub: a.user_sub, userEmail: a.user_email })),
        dueDate: body.due_date,
        checklistProgress: body.checklist_progress,
        blockedByTaskId: body.blocked_by_task_id,
        clientVisible: body.client_visible,
        position: body.position,
        subtasks: body.subtasks?.map((s) => ({ id: s.id, title: s.title, isCompleted: s.is_completed, assigneeSub: s.assignee_sub ?? null })),
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 200);
  },

  listTaskAssignees: async (c: Context<AppEnv>) => {
    const rows = await service.listTaskAssignees(actorFromContext(c), requiredParam(c, "taskId"));
    return c.json({ data: rows }, 200);
  },

  listTaskComments: async (c: Context<AppEnv>) => {
    const rows = await service.listTaskComments(actorFromContext(c), requiredParam(c, "taskId"));
    return c.json({ data: rows }, 200);
  },

  createTaskComment: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateTaskCommentBody>(c);
    const user = actorFromContext(c);
    const comment = await service.createTaskComment(
      user,
      requiredParam(c, "taskId"),
      body.content,
      user.email,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: comment }, 201);
  },

  listTaskFiles: async (c: Context<AppEnv>) => {
    const rows = await service.listTaskFiles(actorFromContext(c), requiredParam(c, "taskId"));
    return c.json({ data: rows }, 200);
  },

  uploadTaskFileMetadata: async (c: Context<AppEnv>) => {
    const user = actorFromContext(c);
    const projectId = requiredParam(c, "projectId");
    const taskId = requiredParam(c, "taskId");
    const body = validatedJson<CreateTaskFileMetadataBody>(c);

    const row = await service.uploadTaskFileMetadata(
      user,
      projectId,
      taskId,
      {
        title: body.title,
        description: body.description,
        fileName: body.file_name,
        storagePath: body.storage_path,
        mimeType: body.mime_type,
        sizeBytes: body.size_bytes,
        isClientVisible: body.is_client_visible,
        authorEmail: user.email,
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 201);
  },

});
