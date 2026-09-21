import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { collabEvents } from "../events";
import { canBlockTask, canUnblockTask } from "../shared/guards";
import { assertProjectAccess } from "../shared/project-access";
import { createAuditRepository } from "../repository/audit.repository";
import { createBoardRepository } from "./board.repository";
import type { createProjectRepository } from "../project/project.repository";
import type { createMemberRepository } from "../member/member.repository";
import { syncProjectSummary } from "../application/project-summary-sync";
import { db } from "../../../db/connection";
import type { Actor, RequestMeta } from "./board.types";

export const createBoardTaskBlockingService = (
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
    blockTask: async (
      actor: Actor,
      taskId: string,
      payload: { reason: string },
      meta: RequestMeta,
    ) => {
      const task = await boardRepository.findTaskById(taskId);
      if (!task) throw new NotFoundError("Tarea no encontrada");

      const { member } = await assertProjectAccess(accessRepo, actor, task.projectId);
      if (!canBlockTask(actor.role, member?.role)) {
        throw new ForbiddenError("No tienes permisos para bloquear tareas");
      }

      const blockedColumn = await boardRepository.findTaskColumnByKey(task.projectId, "blocked");
      if (!blockedColumn) {
        throw new BadRequestError("Columna de bloqueados no encontrada en el proyecto");
      }

      const currentColumn = await boardRepository.findTaskColumnById(task.columnId);
      const assignees = await boardRepository.listTaskAssignees(taskId);

      return db.transaction(async (tx) => {
        const txBoardRepository = createBoardRepository(tx);
        const txProjectRepository = (await import("../project/project.repository")).createProjectRepository(tx);

        const updated = await txBoardRepository.updateTaskById(taskId, {
          columnId: blockedColumn.id,
          blockReason: payload.reason,
          blockType: "internal_impediment",
          blockedAt: new Date(),
          blockedBySub: actor.sub,
        });
        if (!updated) throw new NotFoundError("Tarea no encontrada al actualizar");

        await syncProjectSummary(txProjectRepository, task.projectId);

        await createAuditRepository(tx).createAuditLog({
          actorSub: actor.sub,
          action: "project_task_blocked",
          resourceType: "project_task",
          resourceId: taskId,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });

        const assigneeSubs = assignees.map((a) => a.userSub);

        await collabEvents.emit("task.blocked", task.projectId, actor.sub, {
          taskId: task.id,
          taskTitle: task.title,
          blockReason: payload.reason,
          blockType: "internal_impediment",
          assigneeSubs,
          clientVisible: task.isClientVisible,
        }, tx);

        await collabEvents.emit("task.moved", task.projectId, actor.sub, {
          taskId: task.id,
          taskTitle: task.title,
          fromColumnKey: currentColumn?.key ?? "unknown",
          toColumnKey: "blocked",
          assigneeSub: task.assigneeSub ?? undefined,
          assigneeSubs,
          clientVisible: task.isClientVisible,
        }, tx);

        return (await txBoardRepository.findTaskById(taskId)) ?? updated;
      });
    },

    unblockTask: async (
      actor: Actor,
      taskId: string,
      options: { targetColumnId?: string; resolutionComment?: string },
      meta: RequestMeta,
    ) => {
      const task = await boardRepository.findTaskById(taskId);
      if (!task) throw new NotFoundError("Tarea no encontrada");

      const { member } = await assertProjectAccess(accessRepo, actor, task.projectId);
      const assignees = await boardRepository.listTaskAssignees(taskId);
      const isAssignee = task.assigneeSub === actor.sub || assignees.some((a) => a.userSub === actor.sub);

      if (!canUnblockTask(actor.role, member?.role, task.blockType, isAssignee)) {
        throw new ForbiddenError("No tienes permisos para desbloquear esta tarea");
      }

      let targetColumn: Awaited<ReturnType<typeof boardRepository.findTaskColumnById>> | null = null;
      if (options.targetColumnId) {
        targetColumn = await boardRepository.findTaskColumnById(options.targetColumnId);
        if (!targetColumn || targetColumn.projectId !== task.projectId || targetColumn.key === "blocked") {
          throw new BadRequestError("Columna destino inválida");
        }
      } else {
        targetColumn = await boardRepository.findTaskColumnByKey(task.projectId, "doing");
        if (!targetColumn) {
          targetColumn = await boardRepository.findTaskColumnByKey(task.projectId, "pending");
        }
        if (!targetColumn) {
          throw new BadRequestError("No se encontró columna destino para reactivar la tarea");
        }
      }

      return db.transaction(async (tx) => {
        const txBoardRepository = createBoardRepository(tx);
        const txProjectRepository = (await import("../project/project.repository")).createProjectRepository(tx);

        if (options.resolutionComment) {
          await txBoardRepository.createTaskComment({
            taskId,
            authorSub: actor.sub,
            authorEmail: actor.email,
            content: `[Resolución de Bloqueo] ${options.resolutionComment}`,
          });
        }

        const isClientApproval = targetColumn!.key === "client_approval";
        const updated = await txBoardRepository.updateTaskById(taskId, {
          columnId: targetColumn!.id,
          blockReason: null,
          blockType: null,
          blockedAt: null,
          blockedBySub: null,
          ...(isClientApproval ? { clientApprovalRequestedAt: new Date() } : {}),
        });
        if (!updated) throw new NotFoundError("Tarea no encontrada al desbloquear");

        await syncProjectSummary(txProjectRepository, task.projectId);

        await createAuditRepository(tx).createAuditLog({
          actorSub: actor.sub,
          action: "project_task_unblocked",
          resourceType: "project_task",
          resourceId: taskId,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        });

        const assigneeSubs = assignees.map((a) => a.userSub);

        await collabEvents.emit("task.unblocked", task.projectId, actor.sub, {
          taskId: task.id,
          taskTitle: task.title,
          targetColumnKey: targetColumn!.key,
          assigneeSubs,
          clientVisible: task.isClientVisible,
        }, tx);

        await collabEvents.emit("task.moved", task.projectId, actor.sub, {
          taskId: task.id,
          taskTitle: task.title,
          fromColumnKey: "blocked",
          toColumnKey: targetColumn!.key,
          assigneeSub: task.assigneeSub ?? undefined,
          assigneeSubs,
          clientVisible: task.isClientVisible,
        }, tx);

        return (await txBoardRepository.findTaskById(taskId)) ?? updated;
      });
    },
  };
};
