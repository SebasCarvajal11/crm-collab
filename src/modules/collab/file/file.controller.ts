import type { Context } from "hono";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { validatedJson, validatedQuery } from "../validated-json";
import { actorFromContext } from "../actor";
import { AppError } from "../../../shared/middlewares/error-handler.middleware";
import type {
  CreateFileBody,
  ApproveFileBody,
  UpdateProjectFileBody,
  GenerateUploadUrlBody,
} from "../collab.schemas";
import type { createFileUploadService } from "./file-upload.service";
import type { createFileManagementService } from "./file-management.service";

const getIp = (c: Context) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
  c.req.header("x-real-ip")?.trim() ??
  "unknown";
const getUa = (c: Context) => c.req.header("user-agent") ?? "unknown";
const requiredParam = (c: Context, key: string) => c.req.param(key) ?? "";

export const createFileController = (
  uploadService: ReturnType<typeof createFileUploadService>,
  managementService: ReturnType<typeof createFileManagementService>
) => ({
  listFiles: async (c: Context<AppEnv>) => {
    const q = validatedQuery<{ page: number; limit: number }>(c);
    const result = await managementService.listFiles(actorFromContext(c), requiredParam(c, "projectId"), {
      page: q.page,
      limit: q.limit,
    });
    return c.json({ data: result }, 200);
  },

  uploadFileMetadata: async (c: Context<AppEnv>) => {
    const body = validatedJson<CreateFileBody>(c);
    const row = await uploadService.uploadFileMetadata(
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

  generateProjectFileUploadUrl: async (c: Context<AppEnv>) => {
    const body = validatedJson<GenerateUploadUrlBody>(c);
    const data = await uploadService.generateProjectFileUploadUrl(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      { fileName: body.file_name, mimeType: body.mime_type, sizeBytes: body.size_bytes }
    );
    return c.json({ data }, 200);
  },

  abortUploadedFileObject: async (c: Context<AppEnv>) => {
    const objectKey = c.req.query("objectKey")?.trim();
    if (!objectKey) throw new AppError(400, "objectKey es requerido");
    const data = await uploadService.abortUnregisteredFileUpload(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      objectKey,
    );
    return c.json({ data }, 200);
  },

  approveFile: async (c: Context<AppEnv>) => {
    const body = validatedJson<ApproveFileBody>(c);
    const row = await managementService.approveFile(
      actorFromContext(c),
      requiredParam(c, "fileId"),
      body.approve,
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: row }, 200);
  },

  downloadFile: async (c: Context<AppEnv>) => {
    const fileId = requiredParam(c, "fileId");
    const preview = c.req.query("preview") === "true";
    const { url } = await managementService.getFileAccess(actorFromContext(c), fileId, !preview);
    return c.redirect(url, 302);
  },

  getFileAccess: async (c: Context<AppEnv>) => {
    const fileId = requiredParam(c, "fileId");
    const preview = c.req.query("preview") === "true";
    const data = await managementService.getFileAccess(actorFromContext(c), fileId, !preview);
    return c.json({ data }, 200);
  },

  deleteFile: async (c: Context<AppEnv>) => {
    const result = await managementService.deleteFile(
      actorFromContext(c),
      requiredParam(c, "fileId"),
      { ipAddress: getIp(c), userAgent: getUa(c) }
    );
    return c.json({ data: result }, 200);
  },

  updateProjectFile: async (c: Context<AppEnv>) => {
    const body = validatedJson<UpdateProjectFileBody>(c);
    const result = await managementService.updateProjectFile(
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
    const rows = await managementService.listFilesWithTaskInfo(actorFromContext(c), requiredParam(c, "projectId"));
    return c.json({ data: rows }, 200);
  },

  generateTaskFileUploadUrl: async (c: Context<AppEnv>) => {
    const body = validatedJson<GenerateUploadUrlBody>(c);
    const data = await uploadService.generateTaskFileUploadUrl(
      actorFromContext(c),
      requiredParam(c, "projectId"),
      requiredParam(c, "taskId"),
      { fileName: body.file_name, mimeType: body.mime_type, sizeBytes: body.size_bytes }
    );
    return c.json({ data }, 200);
  },

  assertStoragePathAccess: async (c: Context<AppEnv>) => {
    const storagePath = c.req.query("objectKey")?.trim();
    if (!storagePath) throw new AppError(400, "objectKey es requerido");
    await managementService.assertStoragePathAccess(actorFromContext(c), storagePath);
    return c.body(null, 204);
  },
});
