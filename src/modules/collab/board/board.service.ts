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
import { createBoardRepository } from "./board.repository";
import { createProjectRepository } from "../project/project.repository";
import { createMemberRepository } from "../member/member.repository";
import { createFileRepository } from "../file/file.repository";
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
      return db.transaction(async (tx) => {
        const row = await createBoardRepository(tx).createTaskColumnAtPosition({
          projectId,
          key: payload.key as never,
          title: payload.title,
          position: payload.position,
          isClientVisible: payload.isClientVisible,
          isDefault: false,
        });
        await createAuditRepository(tx).createAuditLog({
          actorSub: actor.sub,
          action: "project_column_created",
          resourceType: "project_task_column",
          resourceId: row.id,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
        return row;
      });
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
      return db.transaction(async (tx) => {
        const txBoardRepository = createBoardRepository(tx);
        if (patch.position !== undefined) {
          await txBoardRepository.moveTaskColumnToPosition(column, patch.position);
        }
        const row = await txBoardRepository.updateTaskColumnById(columnId, {
          ...patch,
          position: undefined,
        });
        if (!row) throw new NotFoundError("Columna no encontrada");
        await createAuditRepository(tx).createAuditLog({
          actorSub: actor.sub,
          action: "project_column_updated",
          resourceType: "project_task_column",
          resourceId: columnId,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });
        return row;
      });
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

      return db.transaction(async (tx) => {
      const txBoardRepository = createBoardRepository(tx);
      const txProjectRepository = createProjectRepository(tx);
      const txMemberRepository = createMemberRepository(tx);
      const task = await txBoardRepository.createTask({
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
        await txBoardRepository.upsertSubtasks(task.id, payload.subtasks);
      }
      if (payload.assignees?.length) {
        const resolvedAssignees = await resolveAssigneeEmails(
          txMemberRepository as any,
          actor,
          projectId,
          payload.assignees
        );
        await txBoardRepository.upsertTaskAssignees(task.id, resolvedAssignees);
      }
      await syncProjectSummary(txProjectRepository, projectId);
      await createAuditRepository(tx).createAuditLog({
        actorSub: actor.sub,
        action: "project_task_created",
        resourceType: "project_task",
        resourceId: task.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      for (const assignee of payload.assignees ?? []) {
        if (assignee.userSub !== actor.sub) {
          await collabEvents.emit("task.assigned", projectId, actor.sub, {
            taskId: task.id,
            taskTitle: task.title,
            assigneeSub: assignee.userSub,
          }, tx);
        }
      }
      return task;
      });
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
      const previousAssigneeSubs = patch.assignees !== undefined
        ? (await boardRepository.listTaskAssignees(taskId)).map((assignee) => assignee.userSub)
        : [];

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

      return db.transaction(async (tx) => {
      const txBoardRepository = createBoardRepository(tx);
      const txProjectRepository = createProjectRepository(tx);
      const txMemberRepository = createMemberRepository(tx);
      const updated = await txBoardRepository.updateTaskById(taskId, {
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
        await txBoardRepository.upsertSubtasks(taskId, patch.subtasks);
      }
      if (patch.assignees !== undefined) {
        const resolvedAssignees = await resolveAssigneeEmails(
          txMemberRepository as any,
          actor,
          task.projectId,
          patch.assignees
        );
        await txBoardRepository.upsertTaskAssignees(taskId, resolvedAssignees);
      }
      const progressChanged =
        patch.columnId !== undefined ||
        patch.checklistProgress !== undefined ||
        patch.subtasks !== undefined;
      if (progressChanged) {
        await syncProjectSummary(txProjectRepository, task.projectId);
      }

      await createAuditRepository(tx).createAuditLog({
        actorSub: actor.sub,
        action: "project_task_updated",
        resourceType: "project_task",
        resourceId: taskId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      if (patch.columnId && patch.columnId !== task.columnId) {
        const assigneeSubs = (await txBoardRepository.listTaskAssignees(taskId)).map((assignee) => assignee.userSub);
        await collabEvents.emit("task.moved", task.projectId, actor.sub, {
          taskId: task.id,
          taskTitle: updated.title,
          fromColumnKey: currentColumn.key,
          toColumnKey: targetColumn.key,
          assigneeSub: updated.assigneeSub ?? undefined,
          assigneeSubs,
          clientVisible: updated.isClientVisible,
        }, tx);
      }

      if (patch.assignees !== undefined) {
        for (const assignee of patch.assignees.filter((candidate) => !previousAssigneeSubs.includes(candidate.userSub))) {
          if (assignee.userSub === actor.sub) continue;
          await collabEvents.emit("task.assigned", task.projectId, actor.sub, {
            taskId: task.id,
            taskTitle: updated.title,
            assigneeSub: assignee.userSub,
          }, tx);
        }
      }

      return updated;
      });
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
      return db.transaction(async (tx) => {
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
        version: 1,
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
        details: { taskId, fileName: payload.fileName, sizeBytes: payload.sizeBytes },
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
