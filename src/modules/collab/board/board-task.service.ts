import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { collabEvents } from "../events";
import { ProjectTask } from "../domain/project-aggregate";
import { syncProjectSummary } from "../application/project-summary-sync";
import { canMoveTasks } from "../shared/guards";
import { assertProjectAccess, assertWorkerOnlyAssignments } from "../shared/project-access";
import { resolveAssigneeEmails } from "../shared/mappers";
import { createAuditRepository } from "../repository/audit.repository";
import { createBoardRepository } from "./board.repository";
import { createProjectRepository } from "../project/project.repository";
import { createMemberRepository } from "../member/member.repository";
import { db } from "../../../db/connection";
import type { Actor, RequestMeta } from "./board.types";

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
          "No puedes mover la tarea a la columna final sin completar todas las subtareas",
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

        return (await txBoardRepository.findTaskById(taskId)) ?? updated;
      });
    },
  };
};
