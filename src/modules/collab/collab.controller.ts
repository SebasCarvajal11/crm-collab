import type { Context } from "hono";
import type { AppEnv } from "../../shared/middlewares/auth.middleware";
import type { CollabService } from "./collab.service";
import { formatContentDisposition } from "../../shared/sanitize-filename";
import { validatedJson, validatedQuery } from "./validated-json";
import { AppError } from "../../shared/middlewares/error-handler.middleware";
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
  ProjectTasksQuery,
  ChatMessageQuery,
  ProjectFilesQuery,
  FormalChangeLogQuery,
  ProjectSearchQuery,
  ResolveChangeRequestBody,
  UpdateProjectFileBody,
  UpdateColumnBody,
  UpdateTaskBody,
  UpdateProjectBody,
  CreateTaskFileMetadataBody,
  UpsertProjectMemberBody,
  GenerateUploadUrlBody,
} from "./collab.schemas";
import { actorFromContext } from "./actor";

const getIp = (c: Context) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
  c.req.header("x-real-ip")?.trim() ??
  "unknown";
const getUa = (c: Context) => c.req.header("user-agent") ?? "unknown";
const requiredParam = (c: Context, key: string) => c.req.param(key) ?? "";

export const createCollabController = (service: CollabService) => ({
  listProjects: async (c: Context<AppEnv>) => {
    const q = validatedQuery<ProjectFiltersQuery>(c);
    const rows = await service.listProjects(actorFromContext(c), {
      page: q.page,
      limit: q.limit,
      type: q.type,
      status: q.status,
      adminSub: q.admin_sub,
      clientName: q.client_name,
    });
    return c.json({ data: rows }, 200);
  },

  searchProjects: async (c: Context<AppEnv>) => {
    const q = validatedQuery<ProjectSearchQuery>(c);
    const rows = await service.searchProjects(actorFromContext(c), { q: q.q, limit: q.limit });
    return c.json({ data: rows }, 200);
  },

  createProject: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateProjectBody>(c);
    const created = await service.createProject(
      actorFromContext(c),
      {
        name: body.name,
        description: body.description,
        clientName: body.client_name,
        clientSub: body.client_sub,
        workerSubs: body.worker_subs,
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
      actorFromContext(c),
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
    const data = await service.getProjectWorkspace(actorFromContext(c), requiredParam(c, "projectId"));
    return c.json({ data }, 200);
  },

  getProjectBoard: async (c: Context<AppEnv>) => {
    const data = await service.getProjectBoard(actorFromContext(c), requiredParam(c, "projectId"));
    return c.json({ data }, 200);
  },

  upsertProjectMember: async (c: Context<AppEnv>) => {
    const body = validatedJson<UpsertProjectMemberBody>(c);
    const row = await service.upsertProjectMember(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      body.user_sub,
      body.role,
      body.user_email,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 200);
  },

  listProjectMembers: async (c: Context<AppEnv>) => {
    const rows = await service.listProjectMembers(actorFromContext(c), requiredParam(c, "projectId"));
    return c.json({ data: rows }, 200);
  },

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

  listInternalChat: async (c: Context<AppEnv>) => {
    const q = validatedQuery<ChatMessageQuery>(c);
    const result = await service.listChatMessages(actorFromContext(c), requiredParam(c, "projectId"), "internal", {
      page: q.page,
      limit: q.limit,
    });
    return c.json({ data: result }, 200);
  },

  postInternalChat: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateChatMessageBody>(c);
    const row = await service.postChatMessage(
      actorFromContext(c),
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
      actorFromContext(c),
      requiredParam(c, "projectId"),
      "internal",
      { upToMessageId: body.up_to_message_id, messageIds: body.message_ids ?? [] }
    );
    return c.json({ data: row }, 200);
  },

  listExternalChat: async (c: Context<AppEnv>) => {
    const q = validatedQuery<ChatMessageQuery>(c);
    const result = await service.listChatMessages(actorFromContext(c), requiredParam(c, "projectId"), "external", {
      page: q.page,
      limit: q.limit,
    });
    return c.json({ data: result }, 200);
  },

  postExternalChat: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateChatMessageBody>(c);
    const row = await service.postChatMessage(
      actorFromContext(c),
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
      actorFromContext(c),
      requiredParam(c, "projectId"),
      "external",
      { upToMessageId: body.up_to_message_id, messageIds: body.message_ids ?? [] }
    );
    return c.json({ data: row }, 200);
  },

  listUnreadMentionNotifications: async (c: Context<AppEnv>) => {
    const data = await service.listUnreadMentionNotifications(actorFromContext(c));
    return c.json({ data }, 200);
  },

  countUnreadMentionNotifications: async (c: Context<AppEnv>) => {
    const count = await service.countUnreadMentionNotifications(actorFromContext(c));
    return c.json({ data: { unread_count: count } }, 200);
  },

  markMentionNotificationSeen: async (c: Context<AppEnv>) => {
    const data = await service.markMentionNotificationSeen(actorFromContext(c), requiredParam(c, "notificationId"));
    return c.json({ data }, 200);
  },

  createMinorChangeRequest: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateMinorChangeRequestBody>(c);
    const row = await service.createMinorChangeRequest(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      { taskId: body.task_id, title: body.title, description: body.description },
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 201);
  },

  createFormalChangeRequest: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateFormalChangeRequestBody>(c);
    const row = await service.createFormalChangeRequest(
      actorFromContext(c),
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
      actorFromContext(c),
      requiredParam(c, "projectId"),
      requiredParam(c, "changeRequestId"),
      body.status,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 200);
  },

  listFormalChangeLog: async (c: Context<AppEnv>) => {
    const q = validatedQuery<FormalChangeLogQuery>(c);
    const result = await service.listFormalChangeLog(actorFromContext(c), requiredParam(c, "projectId"), {
      page: q.page,
      limit: q.limit,
    });
    return c.json({ data: result }, 200);
  },

  listFiles: async (c: Context<AppEnv>) => {
    const q = validatedQuery<ProjectFilesQuery>(c);
    const result = await service.listFiles(actorFromContext(c), requiredParam(c, "projectId"), {
      page: q.page,
      limit: q.limit,
    });
    return c.json({ data: result }, 200);
  },

  uploadFileMetadata: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateFileBody>(c);
    const row = await service.uploadFileMetadata(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      {
        fileName: body.file_name,
        title: body.title,
        description: body.description,
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

  /**
   * Paso 1 del flujo pre-signed para archivos de proyecto.
   * Genera y retorna una URL prefirmada de escritura OCI.
   * Body: { file_name, mime_type, size_bytes }
   */
  generateProjectFileUploadUrl: async (c: Context<AppEnv>) => {
    const body = validatedJson<GenerateUploadUrlBody>(c);
    const data = await service.generateProjectFileUploadUrl(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      { fileName: body.file_name, mimeType: body.mime_type, sizeBytes: body.size_bytes }
    );
    return c.json({ data }, 200);
  },

  abortUploadedFileObject: async (c: Context<AppEnv>) => {
    const objectKey = c.req.query("objectKey")?.trim();
    if (!objectKey) throw new AppError(400, "objectKey es requerido");
    const data = await service.abortUnregisteredFileUpload(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      objectKey,
    );
    return c.json({ data }, 200);
  },

  approveFile: async (c: Context<AppEnv>) => {
    const body = validatedJson<ApproveFileBody>(c);
    const row = await service.approveFile(
      actorFromContext(c),
      requiredParam(c, "fileId"),
      body.approve,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 200);
  },

  getBrief: async (c: Context<AppEnv>) => {
    const brief = await service.getBrief(actorFromContext(c), requiredParam(c, "projectId"));
    return c.json({ data: brief }, 200);
  },

  patchBrief: async (c: Context<AppEnv>) => {
    const body = validatedJson<BriefPatchBody>(c);
    const brief = await service.patchBrief(actorFromContext(c), requiredParam(c, "projectId"), body.body, {
      ipAddress: getIp(c),
      userAgent: getUa(c),
    });
    return c.json({ data: brief }, 200);
  },

  // ─── Comentarios de tarea ────────────────────────────────────────────────

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

  // ─── Archivos de tarea ───────────────────────────────────────────────────

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

  /**
   * Paso 1 del flujo pre-signed para archivos de tarea.
   * Genera y retorna una URL prefirmada de escritura OCI.
   * Body: { file_name, mime_type, size_bytes }
   */
  generateTaskFileUploadUrl: async (c: Context<AppEnv>) => {
    const body = validatedJson<GenerateUploadUrlBody>(c);
    const data = await service.generateTaskFileUploadUrl(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      requiredParam(c, "taskId"),
      { fileName: body.file_name, mimeType: body.mime_type, sizeBytes: body.size_bytes }
    );
    return c.json({ data }, 200);
  },

  downloadFile: async (c: Context<AppEnv>) => {
    const fileId = requiredParam(c, "fileId");
    const preview = c.req.query("preview") === "true";
    const { file, url } = await service.getFileAccess(actorFromContext(c), fileId, !preview);
    const upstream = await fetch(url);
    if (!upstream.ok) throw new AppError(502, "No se pudo obtener el archivo desde mod-media");
    if (!upstream.body) throw new AppError(502, "Respuesta de almacenamiento sin cuerpo");

    const disposition = preview ? "inline" : "attachment";
    const headers = new Headers();
    headers.set("Content-Type", file.mimeType || "application/octet-stream");
    headers.set("Content-Disposition", formatContentDisposition(disposition, file.fileName));
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    headers.set("Cache-Control", "no-store");

    return new Response(upstream.body, { status: 200, headers });
  },

  getFileAccess: async (c: Context<AppEnv>) => {
    const fileId = requiredParam(c, "fileId");
    const preview = c.req.query("preview") === "true";
    const data = await service.getFileAccess(actorFromContext(c), fileId, !preview);
    return c.json({ data }, 200);
  },

  deleteFile: async (c: Context<AppEnv>) => {
    const result = await service.deleteFile(
      actorFromContext(c),
      requiredParam(c, "fileId"),
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: result }, 200);
  },

  updateProjectFile: async (c: Context<AppEnv>) => {
    const body = validatedJson<UpdateProjectFileBody>(c);
    const result = await service.updateProjectFile(
      actorFromContext(c),
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
    const rows = await service.listFilesWithTaskInfo(actorFromContext(c), requiredParam(c, "projectId"));
    return c.json({ data: rows }, 200);
  },

  listProjectTimeline: async (c: Context<AppEnv>) => {
    const rows = await service.listProjectTimeline(actorFromContext(c), requiredParam(c, "projectId"));
    return c.json({ data: rows }, 200);
  },

  listFilesTimeline: async (c: Context<AppEnv>) => {
    const rows = await service.listProjectTimeline(actorFromContext(c), requiredParam(c, "projectId"));
    return c.json({ data: rows }, 200);
  },

  assertStoragePathAccess: async (c: Context<AppEnv>) => {
    const storagePath = c.req.query("objectKey")?.trim();
    if (!storagePath) throw new AppError(400, "objectKey es requerido");
    await service.assertStoragePathAccess(actorFromContext(c), storagePath);
    return c.body(null, 204);
  },

});
