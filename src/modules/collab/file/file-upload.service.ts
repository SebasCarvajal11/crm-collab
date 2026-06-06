import { AppError, BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { v4 as uuidv4 } from "uuid";
import { sanitizeFileName } from "../../../shared/sanitize-filename";
import { createMediaDocumentUploadUrl, deleteDocumentInMedia } from "../../../shared/media-command-client";
import { canInternalChat } from "../shared/guards";
import {
  assertAllowedUploadMime,
  assertProductionObjectRegistered,
} from "../shared/upload-helpers";
import { assertProjectAccess } from "../shared/project-access";
import { createAuditRepository } from "../repository/audit.repository";
import type { GlobalRole } from "../collab.types";
import type { createFileRepository } from "./file.repository";
import type { createProjectRepository } from "../project/project.repository";
import type { createMemberRepository } from "../member/member.repository";
import type { createBoardRepository } from "../board/board.repository";
import { db } from "../../../db/connection";

type Actor = {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
  bearerToken?: string;
};
type RequestMeta = { ipAddress: string; userAgent: string };

export const createFileUploadService = (
  fileRepository: ReturnType<typeof createFileRepository>,
  projectRepository: ReturnType<typeof createProjectRepository>,
  memberRepository: ReturnType<typeof createMemberRepository>,
  boardRepository: ReturnType<typeof createBoardRepository>
) => {
  const accessRepo = {
    findProjectById: projectRepository.findProjectById,
    findProjectMember: memberRepository.findProjectMember,
    listProjectMembers: memberRepository.listProjectMembers,
  };

  return {
    uploadFileMetadata: async (
      actor: Actor,
      projectId: string,
      payload: {
        fileName: string;
        title?: string;
        description?: string | null;
        storagePath: string;
        mimeType: string;
        sizeBytes: number;
        folder: "mockups" | "final_arts" | "briefs" | "contracts" | "shared_deliverables";
        isClientVisible: boolean;
        origin: "internal_chat" | "external_chat" | "manual_upload";
      },
      meta: RequestMeta
    ) => {
      const { member } = await assertProjectAccess(accessRepo, actor, projectId);
      if (actor.role === "client" && payload.origin === "internal_chat") {
        throw new ForbiddenError("Cliente no puede subir archivos internos");
      }
      if (payload.origin === "internal_chat" && !canInternalChat(actor.role, member?.role)) {
        throw new ForbiddenError("No autorizado para archivos internos");
      }
      const fileName = sanitizeFileName(payload.fileName);
      const physicalMeta = await assertProductionObjectRegistered(
        actor,
        projectId,
        payload.storagePath,
        fileName,
        payload.mimeType,
        payload.sizeBytes,
      );
      const MAX_BYTES = 25 * 1024 * 1024;
      if (physicalMeta.sizeBytes > MAX_BYTES) {
        throw new BadRequestError("El archivo supera el límite de 25 MB");
      }
      assertAllowedUploadMime(physicalMeta.mimeType, fileName);
      const latest = await fileRepository.findLatestVersion(projectId, fileName);
      const row = await fileRepository.createFile({
        projectId,
        title: payload.title ?? null,
        description: payload.description ?? null,
        origin: payload.origin,
        folder: payload.folder,
        fileName,
        storagePath: payload.storagePath,
        mimeType: physicalMeta.mimeType,
        sizeBytes: physicalMeta.sizeBytes,
        version: (latest?.version ?? 0) + 1,
        isActive: true,
        isClientVisible: payload.isClientVisible,
        createdBySub: actor.sub,
        createdByEmail: actor.email,
      });
      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "project_file_uploaded",
        resourceType: "project_file",
        resourceId: row.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: { folder: row.folder, version: row.version },
      });
      return row;
    },

    generateProjectFileUploadUrl: async (
      actor: Actor,
      projectId: string,
      payload: { fileName: string; mimeType: string; sizeBytes: number }
    ) => {
      await assertProjectAccess(accessRepo, actor, projectId);
      assertAllowedUploadMime(payload.mimeType, payload.fileName);
      const key = `projects/${projectId}/${uuidv4()}-${sanitizeFileName(payload.fileName)}`;
      return createMediaDocumentUploadUrl(
        actor,
        key,
        payload.fileName,
        payload.mimeType,
        payload.sizeBytes,
      );
    },

    generateTaskFileUploadUrl: async (
      actor: Actor,
      projectId: string,
      taskId: string,
      payload: { fileName: string; mimeType: string; sizeBytes: number }
    ) => {
      const { member } = await assertProjectAccess(accessRepo, actor, projectId);
      const task = await boardRepository.findTaskById(taskId);
      if (!task || task.projectId !== projectId) throw new NotFoundError("Tarea no encontrada");
      if (actor.role === "client" && !canInternalChat(actor.role, member?.role)) {
        if (!task.isClientVisible) throw new ForbiddenError("No tienes acceso a esta tarea");
      }
      assertAllowedUploadMime(payload.mimeType, payload.fileName);
      const key = `projects/${projectId}/tasks/${taskId}/${uuidv4()}-${sanitizeFileName(payload.fileName)}`;
      return createMediaDocumentUploadUrl(
        actor,
        key,
        payload.fileName,
        payload.mimeType,
        payload.sizeBytes,
      );
    },

    abortUnregisteredFileUpload: async (actor: Actor, projectId: string, objectKey: string) => {
      await assertProjectAccess(accessRepo, actor, projectId);
      const prefix = `projects/${projectId}/`;
      if (!objectKey.startsWith(prefix)) {
        throw new ForbiddenError("La clave de almacenamiento no pertenece a este proyecto");
      }
      const existing = await fileRepository.findFileByStoragePath(objectKey);
      if (existing) {
        throw new BadRequestError("El archivo ya está registrado");
      }
      try {
        await deleteDocumentInMedia(actor, objectKey);
      } catch (error) {
        if (!(error instanceof AppError && error.statusCode === 404)) {
          throw error;
        }
      }
      return { deleted: true as const };
    },
  };
};
