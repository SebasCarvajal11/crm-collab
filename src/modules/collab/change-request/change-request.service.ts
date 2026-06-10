import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { collabEvents } from "../events";
import { assertProjectAccess } from "../shared/project-access";
import { createAuditRepository } from "../repository/audit.repository";
import type { GlobalRole } from "../collab.types";
import { db } from "../../../db/connection";
import type { createChangeRequestRepository } from "./change-request.repository";
import type { createProjectRepository } from "../project/project.repository";
import type { createMemberRepository } from "../member/member.repository";
import type { createChatRepository } from "../chat/chat.repository";
import type { createBriefRepository } from "../brief/brief.repository";
import type { createBoardRepository } from "../board/board.repository";

type Actor = {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
  bearerToken?: string;
};
type RequestMeta = { ipAddress: string; userAgent: string };

export const createChangeRequestService = (
  changeRequestRepository: ReturnType<typeof createChangeRequestRepository>,
  projectRepository: ReturnType<typeof createProjectRepository>,
  memberRepository: ReturnType<typeof createMemberRepository>,
  chatRepository: ReturnType<typeof createChatRepository>,
  briefRepository: ReturnType<typeof createBriefRepository>,
  boardRepository: ReturnType<typeof createBoardRepository>
) => {
  const accessRepo = {
    findProjectById: projectRepository.findProjectById,
    findProjectMember: memberRepository.findProjectMember,
    listProjectMembers: memberRepository.listProjectMembers,
  };

  return {
    createMinorChangeRequest: async (
      actor: Actor,
      projectId: string,
      payload: { taskId?: string; title?: string; description: string },
      meta: RequestMeta
    ) => {
      let taskId = payload.taskId;
      if (!taskId) {
        const tasksResult = await boardRepository.listTasksByProject({ projectId, limit: 1, offset: 0 });
        if (tasksResult.rows.length > 0) {
          taskId = tasksResult.rows[0].id;
        } else {
          const columns = await boardRepository.listTaskColumnsByProject(projectId);
          const columnId = columns[0]?.id;
          if (!columnId) throw new BadRequestError("No hay columnas en el proyecto para crear una tarea");
          const defaultTask = await boardRepository.createTask({
            projectId,
            columnId,
            title: "Tarea Automática para Ajuste",
            description: "Creada automáticamente para asociar la solicitud de cambio",
            priority: "medium",
            reporterSub: actor.sub,
            position: 0,
          });
          taskId = defaultTask.id;
        }
      }
      const task = await boardRepository.findTaskById(taskId);
      if (!task || task.projectId !== projectId) throw new NotFoundError("Tarea no encontrada");
      if (actor.role !== "client") throw new ForbiddenError("Solo cliente solicita ajuste menor");
      const openMinor = await changeRequestRepository.listChangeRequestsByProject(projectId, "minor");
      if (openMinor.some((r) => r.taskId === taskId && r.status === "open")) {
        throw new BadRequestError("Ya existe un ajuste menor abierto para esta tarea");
      }
      const title = payload.title || `Ajuste menor: ${payload.description.slice(0, 50)}`;
      const request = await changeRequestRepository.createChangeRequest({
        projectId,
        taskId: taskId,
        type: "minor",
        status: "open",
        requestedBySub: actor.sub,
        title: title,
        description: payload.description,
        justification: null,
      });
      await chatRepository.createChatMessage({
        projectId,
        channel: "external",
        messageType: "minor_request",
        authorSub: actor.sub,
        body: `Solicitud de ajuste menor: ${title}`,
        metadata: { changeRequestId: request.id, taskId: taskId },
      });
      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "minor_change_requested",
        resourceType: "project_change_request",
        resourceId: request.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      void collabEvents.emit("change_request.minor.created", projectId, actor.sub, {
        changeRequestId: request.id,
        taskId: taskId,
        taskTitle: task.title,
        requestedBySub: actor.sub,
        title: title,
        description: payload.description,
      });

      return request;
    },

    createFormalChangeRequest: async (
      actor: Actor,
      projectId: string,
      payload: { taskId?: string; title?: string; description: string; justification?: string },
      meta: RequestMeta
    ) => {
      await assertProjectAccess(accessRepo, actor, projectId);
      const title = payload.title || "Solicitud de Cambio Formal";
      const justification = payload.justification || "Justificación predeterminada";
      const request = await changeRequestRepository.createChangeRequest({
        projectId,
        taskId: payload.taskId ?? null,
        type: "formal",
        status: "open",
        requestedBySub: actor.sub,
        title: title,
        description: payload.description,
        justification: justification,
      });
      await chatRepository.createChatMessage({
        projectId,
        channel: "external",
        messageType: "formal_request",
        authorSub: actor.sub,
        body: `Solicitud de cambio formal: ${title}`,
        metadata: { changeRequestId: request.id },
      });
      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "formal_change_requested",
        resourceType: "project_change_request",
        resourceId: request.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      void collabEvents.emit("change_request.formal.created", projectId, actor.sub, {
        changeRequestId: request.id,
        taskId: payload.taskId,
        requestedBySub: actor.sub,
        title: payload.title,
        description: payload.description,
        justification: payload.justification,
      });

      return request;
    },

    resolveChangeRequest: async (
      actor: Actor,
      projectId: string,
      changeRequestId: string,
      status: "accepted" | "rejected" | "escalated" | "approved",
      meta: RequestMeta
    ) => {
      const req = await changeRequestRepository.findChangeRequestById(changeRequestId);
      if (!req || req.projectId !== projectId) throw new NotFoundError("Solicitud no encontrada");
      const { member } = await assertProjectAccess(accessRepo, actor, projectId);
      if (req.type === "minor") {
        const canResolveMinor =
          actor.role === "admin" || member.role === "worker" || member.role === "admin";
        if (!canResolveMinor) {
          throw new ForbiddenError("Solo worker o administrador del proyecto resuelven ajuste menor");
        }
      } else {
        if (actor.role !== "admin") {
          throw new ForbiddenError(
            "Solo un administrador del sistema puede aprobar o rechazar un cambio formal"
          );
        }
      }
      const updated = await changeRequestRepository.updateChangeRequestById(changeRequestId, {
        status,
        resolvedBySub: actor.sub,
        escalatedByWorkerSub: status === "escalated" ? actor.sub : undefined,
      });
      if (!updated) throw new NotFoundError("Solicitud no encontrada");
      if (req.type === "formal" && status === "approved") {
        await briefRepository.createBriefChangeLog({
          projectId,
          requestedBySub: req.requestedBySub,
          approvedBySub: actor.sub,
          description: req.description,
          sourceChangeRequestId: req.id,
        });
      }
      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "change_request_resolved",
        resourceType: "project_change_request",
        resourceId: req.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: { status, type: req.type },
      });

      if (req.type === "minor") {
        const eventType =
          status === "accepted"
            ? "change_request.minor.accepted"
            : status === "rejected"
            ? "change_request.minor.rejected"
            : null;

        if (eventType) {
          void collabEvents.emit(eventType, projectId, actor.sub, {
            changeRequestId: req.id,
            taskId: req.taskId!,
            status: status as "accepted" | "rejected" | "escalated",
            resolvedBySub: actor.sub,
          });
        }
      } else if (req.type === "formal" && status === "approved") {
        void collabEvents.emit("change_request.formal.approved", projectId, actor.sub, {
          changeRequestId: req.id,
          approvedBySub: actor.sub,
          title: req.title,
          affectsScope: true,
        });
      }

      return updated;
    },

    listFormalChangeLog: async (
      actor: Actor,
      projectId: string,
      query: { page: number; limit: number }
    ) => {
      await assertProjectAccess(accessRepo, actor, projectId);
      const { rows, total } = await briefRepository.listBriefChangeLog({
        projectId,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
      });
      const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
      return { items: rows, page: query.page, limit: query.limit, total, total_pages: totalPages };
    },
  };
};
