import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { canManageProject } from "../shared/guards";
import { assertProjectAccess } from "../shared/project-access";
import { enrichProjectMembersWithProfiles } from "../shared/mappers";
import { PROJECT_BOARD_TASK_LIMIT } from "../shared/constants";
import type { GlobalRole } from "../collab.types";
import { createAuditRepository } from "../repository/audit.repository";
import { db } from "../../../db/connection";
import type { createMemberRepository } from "./member.repository";
import type { createProjectRepository } from "../project/project.repository";
import type { createBoardRepository } from "../board/board.repository";

type Actor = {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
  bearerToken?: string;
};
type RequestMeta = { ipAddress: string; userAgent: string };

export const createMemberService = (
  memberRepository: ReturnType<typeof createMemberRepository>,
  projectRepository: ReturnType<typeof createProjectRepository>,
  boardRepository: ReturnType<typeof createBoardRepository>
) => {
  const accessRepo = {
    findProjectById: projectRepository.findProjectById,
    findProjectMember: memberRepository.findProjectMember,
    listProjectMembers: memberRepository.listProjectMembers,
  };

  return {
    upsertProjectMember: async (
      actor: Actor,
      projectId: string,
      userSub: string,
      role: "admin" | "worker" | "client",
      userEmail: string | undefined,
      meta: RequestMeta
    ) => {
      const { project, member } = await assertProjectAccess(accessRepo, actor, projectId);
      if (!canManageProject(actor.role, member?.role)) throw new ForbiddenError("Solo admin gestiona miembros");
      const row = await memberRepository.upsertProjectMember({
        projectId,
        userSub,
        role,
        userEmail: userEmail ?? null,
      });
      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "project_member_upserted",
        resourceType: "project_member",
        resourceId: projectId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: { userSub, role },
      });
      return row;
    },

    listProjectMembers: async (actor: Actor, projectId: string) => {
      await assertProjectAccess(accessRepo, actor, projectId);
      await memberRepository.touchProjectMemberActivity(projectId, actor.sub);
      const [members, assignees, tasks] = await Promise.all([
        memberRepository.listProjectMembers(projectId),
        boardRepository.listTaskAssigneesByProject(projectId),
        boardRepository.listTasksByProject({ projectId, limit: PROJECT_BOARD_TASK_LIMIT, offset: 0 }),
      ]);
      return enrichProjectMembersWithProfiles(
        {
          listProjectMembers: memberRepository.listProjectMembers,
          findProjectById: projectRepository.findProjectById,
          findProjectMember: memberRepository.findProjectMember,
          listTasksByProject: boardRepository.listTasksByProject,
          listTaskAssigneesByProject: boardRepository.listTaskAssigneesByProject,
        } as any,
        members,
        actor,
        assignees,
        tasks.rows
      );
    },
  };
};
