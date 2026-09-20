import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { collabEvents } from "../events";
import { assertProjectAccess } from "../shared/project-access";
import { assertProductionObjectRegistered, assertAllowedUploadMime } from "../shared/upload-helpers";
import { createAuditRepository } from "../repository/audit.repository";
import { sanitizeFileName } from "../../../shared/sanitize-filename";
import { createBoardRepository } from "./board.repository";
import type { createProjectRepository } from "../project/project.repository";
import type { createMemberRepository } from "../member/member.repository";
import { createFileRepository } from "../file/file.repository";
import { db } from "../../../db/connection";
import type { Actor, RequestMeta } from "./board.types";

export const createBoardTaskInteractionService = (
  boardRepository: ReturnType<typeof createBoardRepository>,
  projectRepository: ReturnType<typeof createProjectRepository>,
  memberRepository: ReturnType<typeof createMemberRepository>,
  fileRepository: ReturnType<typeof createFileRepository>,
) => {
  const accessRepo = {
    findProjectById: projectRepository.findProjectById,
    findProjectMember: memberRepository.findProjectMember,
    listProjectMembers: memberRepository.listProjectMembers,
  };

  return {
    listTaskAssignees: async (actor: Actor, taskId: string) => {
      const task = await boardRepository.findTaskById(taskId);
      if (!task) throw new NotFoundError("Tarea no encontrada");
      await assertProjectAccess(accessRepo, actor, task.projectId);
      if (actor.role === "client" && !task.isClientVisible) {
        throw new ForbiddenError("No tienes acceso a esta tarea");
      }
      return boardRepository.listTaskAssignees(taskId);
    },

    listTaskComments: async (actor: Actor, taskId: string) => {
      const task = await boardRepository.findTaskById(taskId);
      if (!task) throw new NotFoundError("Tarea no encontrada");
      await assertProjectAccess(accessRepo, actor, task.projectId);
      if (actor.role === "client" && !task.isClientVisible) {
        throw new ForbiddenError("No tienes acceso a esta tarea");
      }
      return boardRepository.listTaskComments(taskId);
    },

    createTaskComment: async (
      actor: Actor,
      taskId: string,
      content: string,
      authorEmail: string,
      meta: RequestMeta,
    ) => {
      const task = await boardRepository.findTaskById(taskId);
      if (!task) throw new NotFoundError("Tarea no encontrada");
      await assertProjectAccess(accessRepo, actor, task.projectId);
      if (actor.role === "client" && !task.isClientVisible) {
        throw new ForbiddenError("No tienes acceso a esta tarea");
      }
      return db.transaction(async (tx) => {
        const txBoardRepository = createBoardRepository(tx);
        const comment = await txBoardRepository.createTaskComment({
          taskId,
          authorSub: actor.sub,
          authorEmail,
          content,
        });
        await createAuditRepository(tx).createAuditLog({
          actorSub: actor.sub,
          action: "task_comment_created",
          resourceType: "project_task_comment",
          resourceId: comment.id,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
        const assigneeSubs = (await txBoardRepository.listTaskAssignees(taskId)).map((assignee) => assignee.userSub);
        await collabEvents.emit("task.comment.created", task.projectId, actor.sub, {
          taskId: task.id,
          taskTitle: task.title,
          assigneeSubs,
          clientVisible: task.isClientVisible,
        }, tx);
        return comment;
      });
    },

    listTaskFiles: async (actor: Actor, taskId: string) => {
      const task = await boardRepository.findTaskById(taskId);
      if (!task) throw new NotFoundError("Tarea no encontrada");
      await assertProjectAccess(accessRepo, actor, task.projectId);
      if (actor.role === "client" && !task.isClientVisible) {
        throw new ForbiddenError("No tienes acceso a esta tarea");
      }
      const files = await fileRepository.listTaskFiles(taskId);
      return actor.role === "client" ? files.filter((file) => file.isClientVisible) : files;
    },

    uploadTaskFileMetadata: async (
      actor: Actor,
      projectId: string,
      taskId: string,
      payload: {
        title: string;
        description: string;
        fileName: string;
        storagePath: string;
        mimeType: string;
        sizeBytes: number;
        isClientVisible: boolean;
        authorEmail: string;
      },
      meta: RequestMeta,
    ) => {
      const { member } = await assertProjectAccess(accessRepo, actor, projectId);
      const task = await boardRepository.findTaskById(taskId);
      if (!task || task.projectId !== projectId) throw new NotFoundError("Tarea no encontrada");
      if (actor.role === "client" && member.role !== "admin" && member.role !== "worker") {
        if (!task.isClientVisible) throw new ForbiddenError("No tienes acceso a esta tarea");
      }
      const fileName = sanitizeFileName(payload.fileName);
      const physicalMeta = await assertProductionObjectRegistered(
        actor,
        projectId,
        payload.storagePath,
        fileName,
        payload.mimeType,
        payload.sizeBytes,
        taskId,
      );
      const MAX_BYTES = 25 * 1024 * 1024;
      if (physicalMeta.sizeBytes > MAX_BYTES) throw new BadRequestError("El archivo supera el límite de 25 MB");
      assertAllowedUploadMime(physicalMeta.mimeType, fileName);
      return db.transaction(async (tx) => {
        const txFileRepository = createFileRepository(tx);
        await txFileRepository.lockFileVersionSequence(projectId, fileName);
        const latest = await txFileRepository.findLatestVersion(projectId, fileName);
        const version = (latest?.version ?? 0) + 1;

        const txBoardRepository = createBoardRepository(tx);
        const file = await txBoardRepository.createFileForTask({
          projectId,
          taskId,
          title: payload.title,
          description: payload.description,
          origin: "manual_upload",
          folder: "shared_deliverables",
          fileName,
          storagePath: payload.storagePath,
          mimeType: physicalMeta.mimeType,
          sizeBytes: physicalMeta.sizeBytes,
          isClientVisible: payload.isClientVisible,
          isActive: true,
          approvedByClient: false,
          version,
          createdBySub: actor.sub,
          createdByEmail: payload.authorEmail,
        });
        await createAuditRepository(tx).createAuditLog({
          actorSub: actor.sub,
          action: "task_file_uploaded",
          resourceType: "project_file",
          resourceId: file.id,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          details: { taskId, fileName: payload.fileName, sizeBytes: payload.sizeBytes, version },
        });
        await collabEvents.emit("file.uploaded", projectId, actor.sub, {
          fileId: file.id,
          fileName: file.fileName,
          isClientVisible: file.isClientVisible,
        }, tx);
        return file;
      });
    },
  };
};
