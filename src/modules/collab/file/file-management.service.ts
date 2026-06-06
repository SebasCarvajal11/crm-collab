import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { collabEvents } from "../events";
import { getMediaDocumentAccessUrl, deleteDocumentInMedia } from "../../../shared/media-command-client";
import { canMoveTasks } from "../shared/guards";
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

export const createFileManagementService = (
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
    listFiles: async (actor: Actor, projectId: string, query: { page: number; limit: number }) => {
      await assertProjectAccess(accessRepo, actor, projectId);
      const { rows, total } = await boardRepository.listFilesWithTaskInfo({
        projectId,
        isClientView: actor.role === "client",
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
      });
      const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
      return { items: rows, page: query.page, limit: query.limit, total, total_pages: totalPages };
    },

    approveFile: async (actor: Actor, fileId: string, approve: boolean, meta: RequestMeta) => {
      if (!approve) throw new BadRequestError("Solo se permite aprobación positiva");
      const file = await fileRepository.findFileById(fileId);
      if (!file) throw new NotFoundError("Archivo no encontrado");
      const { member } = await assertProjectAccess(accessRepo, actor, file.projectId);
      const isAuthorized = actor.role === "admin" || member?.role === "admin" || member?.role === "client";
      if (!isAuthorized) {
        throw new ForbiddenError("Solo administradores o clientes pueden aprobar archivos del proyecto");
      }
      const updated = await fileRepository.markFileApproved(fileId, actor.sub);
      if (!updated) throw new NotFoundError("Archivo no encontrado");
      await projectRepository.updateProjectById(file.projectId, { latestApprovedFileId: fileId });
      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "project_file_approved",
        resourceType: "project_file",
        resourceId: fileId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      void collabEvents.emit("file.approved", file.projectId, actor.sub, {
        fileId: file.id,
        fileName: file.fileName,
        folder: file.folder,
        approvedBySub: actor.sub,
      });
      return updated;
    },

    getFileAccess: async (actor: Actor, fileId: string, forceDownload: boolean) => {
      const file = await fileRepository.findFileById(fileId);
      if (!file) throw new NotFoundError("Archivo no encontrado");
      const { member } = await assertProjectAccess(accessRepo, actor, file.projectId);
      if ((actor.role === "client" || member?.role === "client") && !file.isClientVisible) {
        throw new ForbiddenError("No tienes permiso para descargar este archivo");
      }
      const access = await getMediaDocumentAccessUrl(actor, file.storagePath, forceDownload);
      return { file, ...access };
    },

    deleteFile: async (actor: Actor, fileId: string, meta: RequestMeta) => {
      const file = await fileRepository.findFileById(fileId);
      if (!file) throw new NotFoundError("Archivo no encontrado");
      const { member } = await assertProjectAccess(accessRepo, actor, file.projectId);
      const canDelete = actor.role === "admin" || member?.role === "admin" || file.createdBySub === actor.sub;
      if (!canDelete) {
        throw new ForbiddenError("Solo el creador, un administrador del proyecto o un admin global puede eliminar el archivo");
      }
      await deleteDocumentInMedia(actor, file.storagePath);
      await fileRepository.deleteFileById(fileId);
      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "task_file_deleted",
        resourceType: "project_file",
        resourceId: fileId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: { fileName: file.fileName, storagePath: file.storagePath },
      });
      return { deleted: true };
    },

    updateProjectFile: async (
      actor: Actor,
      fileId: string,
      patch: { title?: string; description?: string | null; taskId?: string | null; isClientVisible?: boolean },
      meta: RequestMeta
    ) => {
      const file = await fileRepository.findFileById(fileId);
      if (!file) throw new NotFoundError("Archivo no encontrado");
      const { member } = await assertProjectAccess(accessRepo, actor, file.projectId);
      if (!canMoveTasks(actor.role, member?.role)) throw new ForbiddenError("No autorizado para editar archivos");

      let taskId = patch.taskId;
      if (patch.taskId) {
        const task = await boardRepository.findTaskById(patch.taskId);
        if (!task || task.projectId !== file.projectId) throw new BadRequestError("La tarea no pertenece al proyecto");
        taskId = task.id;
      }

      const updated = await fileRepository.updateFileById(fileId, {
        title: patch.title,
        description: patch.description,
        taskId,
        isClientVisible: patch.isClientVisible,
      });
      if (!updated) throw new NotFoundError("Archivo no encontrado");

      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "project_file_updated",
        resourceType: "project_file",
        resourceId: fileId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: { taskId: taskId ?? null },
      });
      return updated;
    },

    listFilesWithTaskInfo: async (actor: Actor, projectId: string) => {
      await assertProjectAccess(accessRepo, actor, projectId);
      return boardRepository.listFilesWithTaskInfo({
        projectId,
        isClientView: actor.role === "client",
        limit: 1000,
        offset: 0,
      });
    },

    assertStoragePathAccess: async (actor: Actor, storagePath: string) => {
      const file = await fileRepository.findFileByStoragePath(storagePath);
      if (!file) {
        throw new NotFoundError("Archivo no registrado en colaboración");
      }
      await assertProjectAccess(accessRepo, actor, file.projectId);
      if (actor.role === "client" && !file.isClientVisible) {
        throw new ForbiddenError("No tienes permiso para este archivo");
      }
    },
  };
};
