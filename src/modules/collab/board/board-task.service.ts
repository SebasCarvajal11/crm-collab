import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { collabEvents } from "../events";
import { syncProjectSummary } from "../application/project-summary-sync";
import { canMoveTasks, canBlockTask, canUnblockTask } from "../shared/guards";
import { assertProjectAccess, assertWorkerOnlyAssignments } from "../shared/project-access";
import { resolveAssigneeEmails } from "../shared/mappers";
import { resolveTaskProgressAndCompletion } from "./board-task-progress";
import {
  resolveTaskColumnStatePatches,
  logTaskUpdateAuditAndComments,
} from "./board-task-patches";
import { emitTaskUpdateEvents } from "./board-task-events";
import { createAuditRepository } from "../repository/audit.repository";
import { createBoardRepository } from "./board.repository";
import { createProjectRepository } from "../project/project.repository";
import { createMemberRepository } from "../member/member.repository";
import { db } from "../../../db/connection";
import type { Actor, CreateTaskInput, RequestMeta, UpdateTaskInput } from "./board.types";

export const createBoardTaskService = (
  boardRepository: ReturnType<typeof createBoardRepository>,
  projectRepository: ReturnType<typeof createProjectRepository>,
  memberRepository: ReturnType<typeof createMemberRepository>,
) => {
  const accessRepo = {
    findProjectById: projectRepository.findProjectById,
    findProjectMember: memberRepository.findProjectMember,
    listProjectMembers: memberRepository.listProjectMembers,
  };

  return {
    createTask: async (
      actor: Actor,
      projectId: string,
      payload: CreateTaskInput,
      meta: RequestMeta,
    ) => {
      const { member } = await assertProjectAccess(accessRepo, actor, projectId);
      if (!canMoveTasks(actor.role, member?.role)) throw new ForbiddenError("No puedes crear tareas");
      const column = await boardRepository.findTaskColumnById(payload.columnId);
      if (!column || column.projectId !== projectId) throw new BadRequestError("La columna no pertenece al proyecto");
      await assertWorkerOnlyAssignments(accessRepo, projectId, {
        assignees: payload.assignees,
        subtasks: payload.subtasks,
      });
      const primaryAssigneeSub = payload.assignees?.[0]?.userSub ?? null;

      const { calculatedProgress, completedAt } = resolveTaskProgressAndCompletion({
        columnKey: column.key,
        subtasks: payload.subtasks,
        checklistProgress: payload.checklistProgress,
      });

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
            payload.assignees,
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
        await collabEvents.emit("task.created", projectId, actor.sub, {
          taskId: task.id,
          taskTitle: task.title,
          columnId: column.id,
          columnKey: column.key,
          priority: task.priority,
          assigneeSubs: payload.assignees?.map((a) => a.userSub) ?? [],
          clientVisible: task.isClientVisible,
        }, tx);
        for (const assignee of payload.assignees ?? []) {
          if (assignee.userSub !== actor.sub) {
            await collabEvents.emit("task.assigned", projectId, actor.sub, {
              taskId: task.id,
              taskTitle: task.title,
              assigneeSub: assignee.userSub,
            }, tx);
          }
        }
        return (await txBoardRepository.findTaskById(task.id)) ?? task;
      });
    },

    listTasksByProject: async (
      actor: Actor,
      projectId: string,
      query: { page: number; limit: number; columnId?: string },
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

    searchTasks: async (
      actor: Actor,
      projectId: string,
      query: { q: string; limit: number },
    ) => {
      await assertProjectAccess(accessRepo, actor, projectId);
      return boardRepository.searchTasksByProject({
        projectId,
        q: query.q,
        limit: query.limit,
        isClientVisible: actor.role === "client" ? true : undefined,
      });
    },

    updateTask: async (
      actor: Actor,
      taskId: string,
      patch: UpdateTaskInput,
      meta: RequestMeta,
    ) => {
      const task = await boardRepository.findTaskById(taskId);
      if (!task) throw new NotFoundError("Tarea no encontrada");
      const { member } = await assertProjectAccess(accessRepo, actor, task.projectId);
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

      const { calculatedProgress, completedAt } = resolveTaskProgressAndCompletion({
        columnKey: targetColumn.key,
        subtasks: patch.subtasks !== undefined ? patch.subtasks : task.subtasks,
        checklistProgress: patch.checklistProgress !== undefined ? patch.checklistProgress : task.checklistProgress,
        existingCompletedAt: task.completedAt,
      });

      const isMovingFromBlocked = currentColumn.key === "blocked" && targetColumn.key !== "blocked";
      const isMovingToBlocked = targetColumn.key === "blocked" && currentColumn.key !== "blocked";
      const isMovingToClientApproval =
        targetColumn.key === "client_approval" && currentColumn.key !== "client_approval";

      if (isMovingFromBlocked) {
        const assignees = await boardRepository.listTaskAssignees(taskId);
        const isAssignee = task.assigneeSub === actor.sub || assignees.some((a) => a.userSub === actor.sub);
        if (!canUnblockTask(actor.role, member?.role, task.blockType, isAssignee)) {
          throw new ForbiddenError("No tienes permisos para desbloquear esta tarea");
        }
      }

      const isBlockingAttempt =
        isMovingToBlocked ||
        (targetColumn.key === "blocked" && (patch.blockReason !== undefined || patch.blockType !== undefined));
      if (isBlockingAttempt && !canBlockTask(actor.role, member?.role)) {
        throw new ForbiddenError("No tienes permisos para bloquear esta tarea");
      }

      if (patch.blockedByTaskId && patch.blockedByTaskId === taskId) {
        throw new BadRequestError("Una tarea no puede bloquearse a si misma");
      }

      return db.transaction(async (tx) => {
        const txBoardRepository = createBoardRepository(tx);
        const txProjectRepository = createProjectRepository(tx);
        const txMemberRepository = createMemberRepository(tx);

        const { unblockingPatch, blockingPatch, clientApprovalPatch } = resolveTaskColumnStatePatches({
          isMovingFromBlocked,
          isMovingToBlocked,
          isMovingToClientApproval,
          targetColumnKey: targetColumn.key,
          blockReason: patch.blockReason,
          blockType: patch.blockType,
          actorSub: actor.sub,
        });

        const updated = await txBoardRepository.updateTaskById(taskId, {
          columnId: patch.columnId,
          title: patch.title,
          description: patch.description,
          priority: patch.priority,
          assigneeSub: primaryAssigneeSub,
          deadline: patch.dueDate,
          checklistProgress: calculatedProgress,
          blockedByTaskId: patch.blockedByTaskId,
          isClientVisible: isMovingToClientApproval ? true : patch.clientVisible,
          position: patch.position,
          completedAt,
          ...unblockingPatch,
          ...blockingPatch,
          ...clientApprovalPatch,
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
            patch.assignees,
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

        await logTaskUpdateAuditAndComments({
          auditRepo: createAuditRepository(tx),
          txBoardRepository,
          actor,
          taskId,
          meta,
          isMovingToBlocked,
          isMovingFromBlocked,
          resolutionComment: patch.resolutionComment,
        });

        const assigneeSubs = (await txBoardRepository.listTaskAssignees(taskId)).map((a) => a.userSub);
        await emitTaskUpdateEvents({
          tx,
          task,
          updated,
          currentColumn,
          targetColumn,
          actor,
          patch,
          isMovingFromBlocked,
          isMovingToBlocked,
          assigneeSubs,
          previousAssigneeSubs,
        });

        return (await txBoardRepository.findTaskById(taskId)) ?? updated;
      });
    },
  };
};
