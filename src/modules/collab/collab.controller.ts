import type { Context } from "hono";
import type { AppEnv } from "../../shared/middlewares/auth.middleware";
import type { CollabService } from "./collab.service";
import { validatedJson, validatedQuery } from "./validated-json";
import type {
  ApproveFileBody,
  BriefPatchBody,
  CreateChatMessageBody,
  CreateFileBody,
  CreateFormalChangeRequestBody,
  CreateMinorChangeRequestBody,
  MarkChatReadBody,
  CreateColumnBody,
  CreateTaskBody,
  CreateProjectBody,
  CreateTaskCommentBody,
  ProjectFiltersQuery,
  ResolveChangeRequestBody,
  UpdateProjectFileBody,
  UpdateColumnBody,
  UpdateTaskBody,
  UpdateProjectBody,
  UpsertProjectMemberBody,
} from "./collab.schemas";

const getIp = (c: Context) =>
  c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip") ?? "unknown";
const getUa = (c: Context) => c.req.header("user-agent") ?? "unknown";
const requiredParam = (c: Context, key: string) => c.req.param(key) ?? "";

export const createCollabController = (service: CollabService) => ({
  listProjects: async (c: Context<AppEnv>) => {
    const q = validatedQuery<ProjectFiltersQuery>(c);
    const rows = await service.listProjects(c.get("user"), {
      page: q.page,
      limit: q.limit,
      type: q.type,
      status: q.status,
      adminSub: q.admin_sub,
      clientName: q.client_name,
    });
    return c.json({ data: rows }, 200);
  },

  createProject: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateProjectBody>(c);
    const created = await service.createProject(
      c.get("user"),
      {
        name: body.name,
        description: body.description,
        clientName: body.client_name,
        clientSub: body.client_sub,
        type: body.type,
        estimatedDueDate: body.estimated_due_date,
        brief: body.brief,
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: created }, 201);
  },

  updateProject: async (c: Context<AppEnv>) => {
    const body = validatedJson<UpdateProjectBody>(c);
    const row = await service.updateProject(
      c.get("user"),
      requiredParam(c, "projectId"),
      {
        name: body.name,
        description: body.description,
        status: body.status,
        estimatedDueDate: body.estimated_due_date,
        progressPercent: body.progress_percent,
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 200);
  },

  getProjectWorkspace: async (c: Context<AppEnv>) => {
    const data = await service.getProjectWorkspace(c.get("user"), requiredParam(c, "projectId"));
    return c.json({ data }, 200);
  },

  upsertProjectMember: async (c: Context<AppEnv>) => {
    const body = validatedJson<UpsertProjectMemberBody>(c);
    const row = await service.upsertProjectMember(
      c.get("user"),
      requiredParam(c, "projectId"),
      body.user_sub,
      body.role,
      body.user_email,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 200);
  },

  listProjectMembers: async (c: Context<AppEnv>) => {
    const rows = await service.listProjectMembers(c.get("user"), requiredParam(c, "projectId"));
    return c.json({ data: rows }, 200);
  },

  createTaskColumn: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateColumnBody>(c);
    const row = await service.createTaskColumn(
      c.get("user"),
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
    const rows = await service.listTaskColumns(c.get("user"), requiredParam(c, "projectId"));
    return c.json({ data: rows }, 200);
  },

  updateTaskColumn: async (c: Context<AppEnv>) => {
    const body = validatedJson<UpdateColumnBody>(c);
    const row = await service.updateTaskColumn(
      c.get("user"),
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
      c.get("user"),
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
    const rows = await service.listTasksByProject(c.get("user"), requiredParam(c, "projectId"));
    return c.json({ data: rows }, 200);
  },

  updateTask: async (c: Context<AppEnv>) => {
    const body = validatedJson<UpdateTaskBody>(c);
    const row = await service.updateTask(
      c.get("user"),
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

  listInternalChat: async (c: Context<AppEnv>) => {
    const rows = await service.listChatMessages(c.get("user"), requiredParam(c, "projectId"), "internal");
    return c.json({ data: rows }, 200);
  },

  postInternalChat: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateChatMessageBody>(c);
    const row = await service.postChatMessage(
      c.get("user"),
      requiredParam(c, "projectId"),
      "internal",
      body.body,
      body.mentions,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 201);
  },

  markInternalChatRead: async (c: Context<AppEnv>) => {
    const body = validatedJson<MarkChatReadBody>(c);
    const row = await service.markChatAsRead(
      c.get("user"),
      requiredParam(c, "projectId"),
      "internal",
      { upToMessageId: body.up_to_message_id, messageIds: body.message_ids ?? [] }
    );
    return c.json({ data: row }, 200);
  },

  listExternalChat: async (c: Context<AppEnv>) => {
    const rows = await service.listChatMessages(c.get("user"), requiredParam(c, "projectId"), "external");
    return c.json({ data: rows }, 200);
  },

  postExternalChat: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateChatMessageBody>(c);
    const row = await service.postChatMessage(
      c.get("user"),
      requiredParam(c, "projectId"),
      "external",
      body.body,
      body.mentions,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 201);
  },

  markExternalChatRead: async (c: Context<AppEnv>) => {
    const body = validatedJson<MarkChatReadBody>(c);
    const row = await service.markChatAsRead(
      c.get("user"),
      requiredParam(c, "projectId"),
      "external",
      { upToMessageId: body.up_to_message_id, messageIds: body.message_ids ?? [] }
    );
    return c.json({ data: row }, 200);
  },

  listUnreadMentionNotifications: async (c: Context<AppEnv>) => {
    const data = await service.listUnreadMentionNotifications(c.get("user"));
    return c.json({ data }, 200);
  },

  countUnreadMentionNotifications: async (c: Context<AppEnv>) => {
    const count = await service.countUnreadMentionNotifications(c.get("user"));
    return c.json({ data: { unread_count: count } }, 200);
  },

  markMentionNotificationSeen: async (c: Context<AppEnv>) => {
    const data = await service.markMentionNotificationSeen(c.get("user"), requiredParam(c, "notificationId"));
    return c.json({ data }, 200);
  },

  createMinorChangeRequest: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateMinorChangeRequestBody>(c);
    const row = await service.createMinorChangeRequest(
      c.get("user"),
      requiredParam(c, "projectId"),
      { taskId: body.task_id, title: body.title, description: body.description },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 201);
  },

  createFormalChangeRequest: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateFormalChangeRequestBody>(c);
    const row = await service.createFormalChangeRequest(
      c.get("user"),
      requiredParam(c, "projectId"),
      {
        taskId: body.task_id,
        title: body.title,
        description: body.description,
        justification: body.justification,
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 201);
  },

  resolveChangeRequest: async (c: Context<AppEnv>) => {
    const body = validatedJson<ResolveChangeRequestBody>(c);
    const row = await service.resolveChangeRequest(
      c.get("user"),
      requiredParam(c, "projectId"),
      requiredParam(c, "changeRequestId"),
      body.status,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 200);
  },

  listFormalChangeLog: async (c: Context<AppEnv>) => {
    const rows = await service.listFormalChangeLog(c.get("user"), requiredParam(c, "projectId"));
    return c.json({ data: rows }, 200);
  },

  listFiles: async (c: Context<AppEnv>) => {
    const rows = await service.listFiles(c.get("user"), requiredParam(c, "projectId"));
    return c.json({ data: rows }, 200);
  },

  uploadFileMetadata: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateFileBody>(c);
    const row = await service.uploadFileMetadata(
      c.get("user"),
      requiredParam(c, "projectId"),
      {
        fileName: body.file_name,
        storagePath: body.storage_path,
        mimeType: body.mime_type,
        sizeBytes: body.size_bytes,
        folder: body.folder,
        isClientVisible: body.is_client_visible,
        origin: body.origin,
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 201);
  },

  approveFile: async (c: Context<AppEnv>) => {
    const body = validatedJson<ApproveFileBody>(c);
    const row = await service.approveFile(
      c.get("user"),
      requiredParam(c, "fileId"),
      body.approve,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 200);
  },

  getBrief: async (c: Context<AppEnv>) => {
    const brief = await service.getBrief(c.get("user"), requiredParam(c, "projectId"));
    return c.json({ data: brief }, 200);
  },

  patchBrief: async (c: Context<AppEnv>) => {
    const body = validatedJson<BriefPatchBody>(c);
    const brief = await service.patchBrief(c.get("user"), requiredParam(c, "projectId"), body.body, {
      ipAddress: getIp(c),
      userAgent: getUa(c),
    });
    return c.json({ data: brief }, 200);
  },

  // ─── Comentarios de tarea ────────────────────────────────────────────────

  listTaskComments: async (c: Context<AppEnv>) => {
    const rows = await service.listTaskComments(c.get("user"), requiredParam(c, "taskId"));
    return c.json({ data: rows }, 200);
  },

  createTaskComment: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateTaskCommentBody>(c);
    const user = c.get("user");
    const comment = await service.createTaskComment(
      user,
      requiredParam(c, "taskId"),
      body.content,
      user.email,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: comment }, 201);
  },

  // ─── Archivos de tarea ───────────────────────────────────────────────────

  listTaskFiles: async (c: Context<AppEnv>) => {
    const rows = await service.listTaskFiles(c.get("user"), requiredParam(c, "taskId"));
    return c.json({ data: rows }, 200);
  },

  uploadTaskFile: async (c: Context<AppEnv>) => {
    const user = c.get("user");
    const projectId = requiredParam(c, "projectId");
    const taskId    = requiredParam(c, "taskId");

    const formData = await c.req.parseBody({ all: true });
    const file = formData["file"] as File | undefined;
    if (!file || typeof file === "string") {
      return c.json({ error: "Se requiere el archivo (campo 'file')" }, 400);
    }
    const title       = (formData["title"] as string | undefined)?.trim();
    const description = (formData["description"] as string | undefined)?.trim();
    if (!title || !description) {
      return c.json({ error: "Se requieren título y descripción del archivo" }, 400);
    }
    const MAX_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_BYTES) return c.json({ error: "El archivo supera el límite de 25 MB" }, 400);

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const isClientVisible = formData["is_client_visible"] === "true";

    const row = await service.uploadTaskFile(
      user,
      projectId,
      taskId,
      {
        title,
        description,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        fileBuffer,
        isClientVisible,
        authorEmail: user.email,
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 201);
  },

  downloadFile: async (c: Context<AppEnv>) => {
    const { file, stream } = await service.downloadTaskFile(c.get("user"), requiredParam(c, "fileId"));
    c.header("Content-Type", file.mimeType);
    c.header("Content-Disposition", `attachment; filename="${file.fileName}"`);
    c.header("Content-Length", String(file.sizeBytes));
    return c.body(stream as unknown as ReadableStream);
  },

  deleteFile: async (c: Context<AppEnv>) => {
    const result = await service.deleteFile(
      c.get("user"),
      requiredParam(c, "fileId"),
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: result }, 200);
  },

  updateProjectFile: async (c: Context<AppEnv>) => {
    const body = validatedJson<UpdateProjectFileBody>(c);
    const result = await service.updateProjectFile(
      c.get("user"),
      requiredParam(c, "fileId"),
      {
        title: body.title,
        description: body.description,
        taskId: body.task_id,
        isClientVisible: body.is_client_visible,
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: result }, 200);
  },

  listFilesWithTaskInfo: async (c: Context<AppEnv>) => {
    const rows = await service.listFilesWithTaskInfo(c.get("user"), requiredParam(c, "projectId"));
    return c.json({ data: rows }, 200);
  },

  listFilesTimeline: async (c: Context<AppEnv>) => {
    const rows = await service.listFilesWithTaskInfo(c.get("user"), requiredParam(c, "projectId"));
    return c.json({ data: rows }, 200);
  },

  uploadProjectFile: async (c: Context<AppEnv>) => {
    const user = c.get("user");
    const projectId = requiredParam(c, "projectId");
    const formData = await c.req.parseBody({ all: true });

    const file = formData["file"] as File | undefined;
    if (!file || typeof file === "string") {
      return c.json({ error: "Se requiere el archivo (campo 'file')" }, 400);
    }

    const title = (formData["title"] as string | undefined)?.trim();
    if (!title) {
      return c.json({ error: "Se requiere el titulo del archivo" }, 400);
    }

    const description = (formData["description"] as string | undefined)?.trim() ?? null;
    const taskId = (formData["task_id"] as string | undefined)?.trim() || null;
    const channel = ((formData["channel"] as string | undefined)?.trim() || "external") as "internal" | "external";
    if (channel !== "internal" && channel !== "external") {
      return c.json({ error: "El campo 'channel' debe ser 'internal' o 'external'" }, 400);
    }

    const MAX_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return c.json({ error: "El archivo supera el limite de 25 MB" }, 400);
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const isClientVisible = formData["is_client_visible"] === "true";

    const row = await service.uploadProjectFile(
      user,
      projectId,
      {
        taskId,
        title,
        description,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        fileBuffer,
        isClientVisible,
        channel,
        authorEmail: user.email,
      },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );

    return c.json({ data: row }, 201);
  },
});
