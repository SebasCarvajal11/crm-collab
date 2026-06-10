import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { collabEvents } from "../events";
import { ProjectTask } from "../domain/project-aggregate";
import { syncProjectSummary } from "../application/project-summary-sync";
import { canManageProject, canMoveTasks } from "../shared/guards";
import { assertProjectAccess, assertWorkerOnlyAssignments } from "../shared/project-access";
import { resolveAssigneeEmails } from "../shared/mappers";
import { assertProductionObjectRegistered, assertAllowedUploadMime } from "../shared/upload-helpers";
import { createAuditRepository } from "../repository/audit.repository";
import { sanitizeFileName } from "../../../shared/sanitize-filename";
import type { GlobalRole } from "../collab.types";
import type { createBoardRepository } from "./board.repository";
import type { createProjectRepository } from "../project/project.repository";
import type { createMemberRepository } from "../member/member.repository";
import type { createFileRepository } from "../file/file.repository";
import { db } from "../../../db/connection";

type Actor = {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
  bearerToken?: string;
};
type RequestMeta = { ipAddress: string; userAgent: string };

export const createBoardService = (
  boardRepository: ReturnType<typeof createBoardRepository>,
  projectRepository: ReturnType<typeof createProjectRepository>,
  memberRepository: ReturnType<typeof createMemberRepository>,
  fileRepository: ReturnType<typeof createFileRepository>
) => {
  const accessRepo = {
    findProjectById: projectRepository.findProjectById,
    findProjectMember: memberRepository.findProjectMember,
    listProjectMembers: memberRepository.listProjectMembers,
  };

  return {
    createTaskColumn: async (
      actor: Actor,
      projectId: string,
      payload: { key: string; title: string; position: number; isClientVisible: boolean },
      meta: RequestMeta
    ) => {
      const { member } = await assertProjectAccess(accessRepo, actor, projectId);
      if (actor.role !== "admin") throw new ForbiddenError("Solo admin crea/edita columnas y flujo");
      if (!canManageProject(actor.role, member?.role)) {
        throw new ForbiddenError("Solo administrador crea/edita columnas y flujo");
      }
      const row = await boardRepository.createTaskColumn({
        projectId,
        key: payload.key as never,
        title: payload.title,
        position: payload.position,
        isClientVisible: payload.isClientVisible,
        isDefault: false,
      });
      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "project_column_created",
        resourceType: "project_task_column",
        resourceId: row.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return row;
    },

    listTaskColumns: async (actor: Actor, projectId: string) => {
      await assertProjectAccess(accessRepo, actor, projectId);
      return boardRepository.listTaskColumnsByProject(projectId);
    },

    updateTaskColumn: async (
      actor: Actor,
      columnId: string,
      patch: { title?: string; position?: number; isClientVisible?: boolean },
      meta: RequestMeta
    ) => {
      const column = await boardRepository.findTaskColumnById(columnId);
      if (!column) throw new NotFoundError("Columna no encontrada");
      const { member } = await assertProjectAccess(accessRepo, actor, column.projectId);
      if (actor.role !== "admin") throw new ForbiddenError("Solo admin edita columnas");
      if (!canManageProject(actor.role, member?.role)) throw new ForbiddenError("Solo admin edita columnas");
      const row = await boardRepository.updateTaskColumnById(columnId, patch);
      if (!row) throw new NotFoundError("Columna no encontrada");
      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "project_column_updated",
        resourceType: "project_task_column",
        resourceId: columnId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return row;
    },

    createTask: async (
      actor: Actor,
      projectId: string,
      payload: {
        columnId: string;
        title: string;
        description?: string;
        priority: "low" | "medium" | "high" | "urgent";
        assignees?: { userSub: string; userEmail?: string }[];
        dueDate?: Date | null;
        checklistProgress: number;
        blockedByTaskId?: string | null;
        clientVisible: boolean;
        position: number;
        subtasks?: { id?: string; title: string; isCompleted: boolean; assigneeSub?: string | null }[];
      },
      meta: RequestMeta
    ) => {
      const { project, member } = await assertProjectAccess(accessRepo, actor, projectId);
      if (!canMoveTasks(actor.role, member?.role)) throw new ForbiddenError("No puedes crear tareas");
      const column = await boardRepository.findTaskColumnById(payload.columnId);
      if (!column || column.projectId !== projectId) throw new BadRequestError("La columna no pertenece al proyecto");
      await assertWorkerOnlyAssignments(accessRepo, projectId, {
        assignees: payload.assignees,
        subtasks: payload.subtasks,
      });
      const primaryAssigneeSub = payload.assignees?.[0]?.userSub ?? null;

      const hasSubtasks = payload.subtasks && payload.subtasks.length > 0;
      let calculatedProgress = hasSubtasks
        ? ProjectTask.calculateChecklistProgress(payload.subtasks)
        : (payload.checklistProgress ?? 0);

      if (ProjectTask.isFinalizationColumn(column.key) && !hasSubtasks) {
        calculatedProgress = 100;
      }
      const completedAt = ProjectTask.isCompleted(column.key, calculatedProgress) ? new Date() : null;

      const task = await boardRepository.createTask({
        projectId,
        columnId: payload.columnId,
        title: payload.title,
        description: payload.description ?? null,
        priority: payload.priority,
        assigneeSub: primaryAssigneeSub,
        reporterSub: actor.sub,
        deadline: payload.dueDate ?? null,
        checklistProgress: calculatedProgress,
        blockedByTaskId: payload.blockedByTaskId ?? null,
        isClientVisible: payload.clientVisible,
        position: payload.position,
        completedAt,
      });
      if (payload.subtasks?.length) {
        await boardRepository.upsertSubtasks(task.id, payload.subtasks);
      }
      if (payload.assignees?.length) {
        const resolvedAssignees = await resolveAssigneeEmails(
          memberRepository as any,
          actor,
          projectId,
          payload.assignees
        );
        await boardRepository.upsertTaskAssignees(task.id, resolvedAssignees);
      }
      await syncProjectSummary(projectRepository as any, projectId, project.type);
      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "project_task_created",
        resourceType: "project_task",
        resourceId: task.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return task;
    },

    listTasksByProject: async (
      actor: Actor,
      projectId: string,
      query: { page: number; limit: number; columnId?: string }
    ) => {
      await assertProjectAccess(accessRepo, actor, projectId);
      const { rows, total } = await boardRepository.listTasksByProject({
        projectId,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
        columnId: query.columnId,
        isClientVisible: actor.role === "client" ? true : undefined,
      });
      const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
      return { items: rows, page: query.page, limit: query.limit, total, total_pages: totalPages };
    },

    updateTask: async (
      actor: Actor,
      taskId: string,
      patch: {
        columnId?: string;
        title?: string;
        description?: string | null;
        priority?: "low" | "medium" | "high" | "urgent";
        assignees?: { userSub: string; userEmail?: string }[];
        dueDate?: Date | null;
        checklistProgress?: number;
        blockedByTaskId?: string | null;
        clientVisible?: boolean;
        position?: number;
        subtasks?: { id?: string; title: string; isCompleted: boolean; assigneeSub?: string | null }[];
      },
      meta: RequestMeta
    ) => {
      const task = await boardRepository.findTaskById(taskId);
      if (!task) throw new NotFoundError("Tarea no encontrada");
      const { project, member } = await assertProjectAccess(accessRepo, actor, task.projectId);
      if (!canMoveTasks(actor.role, member?.role)) throw new ForbiddenError("No puedes editar/mover tareas");
      if (patch.assignees !== undefined || patch.subtasks !== undefined) {
        await assertWorkerOnlyAssignments(accessRepo, task.projectId, {
          assignees: patch.assignees,
          subtasks: patch.subtasks,
        });
      }
      if (actor.role === "client" && patch.columnId) throw new ForbiddenError("Cliente no puede mover tareas");

      const primaryAssigneeSub =
        patch.assignees !== undefined ? (patch.assignees[0]?.userSub ?? null) : undefined;
      const currentColumn = await boardRepository.findTaskColumnById(task.columnId);
      if (!currentColumn || currentColumn.projectId !== task.projectId) {
        throw new NotFoundError("Columna actual de la tarea no encontrada");
      }
      const targetColumn = patch.columnId
        ? await boardRepository.findTaskColumnById(patch.columnId)
        : currentColumn;
      if (!targetColumn || targetColumn.projectId !== task.projectId) {
        throw new BadRequestError("Columna destino invalida");
      }

      const subtasksForProgress = patch.subtasks !== undefined ? patch.subtasks : task.subtasks;
      const hasSubtasks = subtasksForProgress && subtasksForProgress.length > 0;
      let calculatedProgress = hasSubtasks
        ? ProjectTask.calculateChecklistProgress(subtasksForProgress)
        : (patch.checklistProgress !== undefined ? patch.checklistProgress : task.checklistProgress);

      if (ProjectTask.isFinalizationColumn(targetColumn.key) && !hasSubtasks) {
        calculatedProgress = 100;
      }

      if (
        ProjectTask.isFinalizationColumn(targetColumn.key) &&
        hasSubtasks &&
        calculatedProgress < 100
      ) {
        throw new BadRequestError(
          "No puedes mover la tarea a la columna final sin completar todas las subtareas"
        );
      }
      const completedAt = ProjectTask.isCompleted(targetColumn.key, calculatedProgress)
        ? task.completedAt ?? new Date()
        : null;

      const updated = await boardRepository.updateTaskById(taskId, {
        columnId: patch.columnId,
        title: patch.title,
        description: patch.description,
        priority: patch.priority,
        assigneeSub: primaryAssigneeSub,
        deadline: patch.dueDate,
        checklistProgress: calculatedProgress,
        blockedByTaskId: patch.blockedByTaskId,
        isClientVisible: patch.clientVisible,
        position: patch.position,
        completedAt,
      });
      if (!updated) throw new NotFoundError("Tarea no encontrada");
      if (patch.subtasks !== undefined) {
        await boardRepository.upsertSubtasks(taskId, patch.subtasks);
      }
      if (patch.assignees !== undefined) {
        const resolvedAssignees = await resolveAssigneeEmails(
          memberRepository as any,
          actor,
          task.projectId,
          patch.assignees
        );
        await boardRepository.upsertTaskAssignees(taskId, resolvedAssignees);
      }
      const progressChanged =
        patch.columnId !== undefined ||
        patch.checklistProgress !== undefined ||
        patch.subtasks !== undefined;
      if (progressChanged) {
        await syncProjectSummary(projectRepository as any, task.projectId, project.type);
      }

      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "project_task_updated",
        resourceType: "project_task",
        resourceId: taskId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      if (patch.columnId && patch.columnId !== task.columnId) {
        void collabEvents.emit("task.moved", task.projectId, actor.sub, {
          taskId: task.id,
          taskTitle: updated.title,
          fromColumnKey: currentColumn.key,
          toColumnKey: targetColumn.key,
          assigneeSub: updated.assigneeSub ?? undefined,
        });
      }

      if (patch.assignees !== undefined) {
        const newPrimary = patch.assignees[0]?.userSub;
        if (newPrimary && newPrimary !== task.assigneeSub) {
          void collabEvents.emit("task.assigned", task.projectId, actor.sub, {
            taskId: task.id,
            taskTitle: updated.title,
            assigneeSub: newPrimary,
            previousAssigneeSub: task.assigneeSub ?? undefined,
          });
        }
      }

      return updated;
    },

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
      meta: RequestMeta
    ) => {
      const task = await boardRepository.findTaskById(taskId);
      if (!task) throw new NotFoundError("Tarea no encontrada");
      await assertProjectAccess(accessRepo, actor, task.projectId);
      if (actor.role === "client" && !task.isClientVisible) {
        throw new ForbiddenError("No tienes acceso a esta tarea");
      }
      const comment = await boardRepository.createTaskComment({
        taskId,
        authorSub: actor.sub,
        authorEmail,
        content,
      });
      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "task_comment_created",
        resourceType: "project_task_comment",
        resourceId: comment.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return comment;
    },

    listTaskFiles: async (actor: Actor, taskId: string) => {
      const task = await boardRepository.findTaskById(taskId);
      if (!task) throw new NotFoundError("Tarea no encontrada");
      await assertProjectAccess(accessRepo, actor, task.projectId);
      if (actor.role === "client" && !task.isClientVisible) {
        throw new ForbiddenError("No tienes acceso a esta tarea");
      }
      return fileRepository.listTaskFiles(taskId);
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
      meta: RequestMeta
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
      const file = await boardRepository.createFileForTask({
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
        version: 1,
        createdBySub: actor.sub,
        createdByEmail: payload.authorEmail,
      });
      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "task_file_uploaded",
        resourceType: "project_file",
        resourceId: file.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: { taskId, fileName: payload.fileName, sizeBytes: payload.sizeBytes },
      });
      return file;
    },
  };
};
