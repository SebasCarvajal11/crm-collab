import { ForbiddenError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { canManageProject } from "../shared/guards";
import { assertProjectAccess } from "../shared/project-access";
import { createAuditRepository } from "../repository/audit.repository";
import { createBoardRepository } from "./board.repository";
import type { createProjectRepository } from "../project/project.repository";
import type { createMemberRepository } from "../member/member.repository";
import { db } from "../../../db/connection";
import type { Actor, RequestMeta } from "./board.types";

export const createBoardColumnService = (
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
    createTaskColumn: async (
      actor: Actor,
      projectId: string,
      payload: { key: string; title: string; position: number; isClientVisible: boolean },
      meta: RequestMeta,
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
      meta: RequestMeta,
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
  };
};
