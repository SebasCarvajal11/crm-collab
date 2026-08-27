import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { collabEvents } from "../events";
import { assertProjectAccess } from "../shared/project-access";
import { createAuditRepository } from "../repository/audit.repository";
import type { GlobalRole } from "../collab.types";
import { db } from "../../../db/connection";
import { createChangeRequestRepository } from "./change-request.repository";
import { createProjectRepository } from "../project/project.repository";
import { createMemberRepository } from "../member/member.repository";
import { createChatRepository } from "../chat/chat.repository";
import { createBriefRepository } from "../brief/brief.repository";
import { createBoardRepository } from "../board/board.repository";

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
      await assertProjectAccess(accessRepo, actor, projectId);
      if (actor.role !== "client") throw new ForbiddenError("Solo cliente solicita ajuste menor");
      return db.transaction(async (tx) => {
      const txBoardRepository = createBoardRepository(tx);
      const txChangeRequestRepository = createChangeRequestRepository(tx);
      const txChatRepository = createChatRepository(tx);
      let taskId = payload.taskId;
      if (!taskId) {
        const tasksResult = await txBoardRepository.listTasksByProject({ projectId, limit: 1, offset: 0 });
        if (tasksResult.rows.length > 0) {
          taskId = tasksResult.rows[0].id;
        } else {
          const columns = await txBoardRepository.listTaskColumnsByProject(projectId);
          const columnId = columns[0]?.id;
          if (!columnId) throw new BadRequestError("No hay columnas en el proyecto para crear una tarea");
          const defaultTask = await txBoardRepository.createTask({
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
      const task = await txBoardRepository.findTaskById(taskId);
      if (!task || task.projectId !== projectId) throw new NotFoundError("Tarea no encontrada");
      const openMinor = await txChangeRequestRepository.listChangeRequestsByProject(projectId, "minor");
      if (openMinor.some((r) => r.taskId === taskId && r.status === "open")) {
        throw new BadRequestError("Ya existe un ajuste menor abierto para esta tarea");
      }
      const title = payload.title || `Ajuste menor: ${payload.description.slice(0, 50)}`;
      const request = await txChangeRequestRepository.createChangeRequest({
        projectId,
        taskId: taskId,
        type: "minor",
        status: "open",
        requestedBySub: actor.sub,
        title: title,
        description: payload.description,
        justification: null,
      });
      await txChatRepository.createChatMessage({
        projectId,
        channel: "external",
        messageType: "minor_request",
        authorSub: actor.sub,
        body: `Solicitud de ajuste menor: ${title}`,
        metadata: { changeRequestId: request.id, taskId: taskId },
      });
      await createAuditRepository(tx).createAuditLog({
        actorSub: actor.sub,
        action: "minor_change_requested",
        resourceType: "project_change_request",
        resourceId: request.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      await collabEvents.emit("change_request.minor.created", projectId, actor.sub, {
        changeRequestId: request.id,
        taskId: taskId,
        taskTitle: task.title,
        requestedBySub: actor.sub,
        title: title,
        description: payload.description,
      }, tx);

      return request;
      });
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
      return db.transaction(async (tx) => {
      const txChangeRequestRepository = createChangeRequestRepository(tx);
      const txChatRepository = createChatRepository(tx);
      const request = await txChangeRequestRepository.createChangeRequest({
        projectId,
        taskId: payload.taskId ?? null,
        type: "formal",
        status: "open",
        requestedBySub: actor.sub,
        title: title,
        description: payload.description,
        justification: justification,
      });
      await txChatRepository.createChatMessage({
        projectId,
        channel: "external",
        messageType: "formal_request",
        authorSub: actor.sub,
        body: `Solicitud de cambio formal: ${title}`,
        metadata: { changeRequestId: request.id },
      });
      await createAuditRepository(tx).createAuditLog({
        actorSub: actor.sub,
        action: "formal_change_requested",
        resourceType: "project_change_request",
        resourceId: request.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });

      await collabEvents.emit("change_request.formal.created", projectId, actor.sub, {
        changeRequestId: request.id,
        taskId: payload.taskId,
        requestedBySub: actor.sub,
        title: payload.title,
        description: payload.description,
        justification: payload.justification,
      }, tx);

      return request;
      });
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
      return db.transaction(async (tx) => {
      const txChangeRequestRepository = createChangeRequestRepository(tx);
      const txBriefRepository = createBriefRepository(tx);
      const updated = await txChangeRequestRepository.updateChangeRequestById(changeRequestId, {
        status,
        resolvedBySub: actor.sub,
        escalatedByWorkerSub: status === "escalated" ? actor.sub : undefined,
      });
      if (!updated) throw new NotFoundError("Solicitud no encontrada");
      if (req.type === "formal" && status === "approved") {
        await txBriefRepository.createBriefChangeLog({
          projectId,
          requestedBySub: req.requestedBySub,
          approvedBySub: actor.sub,
          description: req.description,
          sourceChangeRequestId: req.id,
        });
      }
      await createAuditRepository(tx).createAuditLog({
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
          await collabEvents.emit(eventType, projectId, actor.sub, {
            changeRequestId: req.id,
            taskId: req.taskId!,
            status: status as "accepted" | "rejected" | "escalated",
            resolvedBySub: actor.sub,
            requestedBySub: req.requestedBySub,
            title: req.title,
          }, tx);
        }
      } else if (req.type === "formal" && (status === "approved" || status === "rejected")) {
        await collabEvents.emit(status === "approved" ? "change_request.formal.approved" : "change_request.formal.rejected", projectId, actor.sub, {
          changeRequestId: req.id,
          approvedBySub: actor.sub,
          title: req.title,
          affectsScope: true,
          requestedBySub: req.requestedBySub,
        }, tx);
      }

      return updated;
      });
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
