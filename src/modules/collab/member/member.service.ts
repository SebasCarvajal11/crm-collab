import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { canManageProject } from "../shared/guards";
import { assertProjectAccess, assertProjectMemberRoleCompatibility } from "../shared/project-access";
import { enrichProjectMembersWithProfiles } from "../shared/mappers";
import type { GlobalRole } from "../collab.types";
import { createAuditRepository } from "../repository/audit.repository";
import { db } from "../../../db/connection";
import { createMemberRepository } from "./member.repository";
import { createProjectRepository } from "../project/project.repository";
import { createBoardRepository } from "../board/board.repository";
import { getUserProfilesFromSnapshots } from "../../../shared/identity-snapshot-store";

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
      const identity = await getUserProfilesFromSnapshots([userSub]);
      if (identity.replicaUnavailable) throw new BadRequestError("No se pudo validar la identidad del miembro; intenta de nuevo");
      const profile = identity.profiles.get(userSub);
      if (!profile) throw new NotFoundError("Usuario no encontrado o aún no disponible");
      assertProjectMemberRoleCompatibility(profile.role, role);
      return db.transaction(async (tx) => {
        const row = await createMemberRepository(tx).upsertProjectMember({
          projectId,
          userSub,
          role,
          userEmail: profile.email,
        });
        await createAuditRepository(tx).createAuditLog({
          actorSub: actor.sub,
          action: "project_member_upserted",
          resourceType: "project_member",
          resourceId: projectId,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          details: { userSub, role },
        });
        return row;
      });
    },

    listProjectMembers: async (actor: Actor, projectId: string) => {
      await assertProjectAccess(accessRepo, actor, projectId);
      await memberRepository.touchProjectMemberActivity(projectId, actor.sub);
      const [members, assignees, taskCounts] = await Promise.all([
        memberRepository.listProjectMembers(projectId),
        boardRepository.listTaskAssigneesByProject(projectId),
        boardRepository.listTaskCountsByAssigneeByProject(projectId),
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
        [],
        taskCounts
      );
    },
  };
};
