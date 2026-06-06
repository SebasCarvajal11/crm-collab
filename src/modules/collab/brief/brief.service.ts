import { ForbiddenError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { canManageProject } from "../shared/guards";
import { assertProjectAccess } from "../shared/project-access";
import { createAuditRepository } from "../repository/audit.repository";
import type { GlobalRole } from "../collab.types";
import type { createBriefRepository } from "./brief.repository";
import type { createProjectRepository } from "../project/project.repository";
import type { createMemberRepository } from "../member/member.repository";
import { db } from "../../../db/connection";

type Actor = {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
  bearerToken?: string;
};
type RequestMeta = { ipAddress: string; userAgent: string };

export const createBriefService = (
  briefRepository: ReturnType<typeof createBriefRepository>,
  projectRepository: ReturnType<typeof createProjectRepository>,
  memberRepository: ReturnType<typeof createMemberRepository>
) => {
  const accessRepo = {
    findProjectById: projectRepository.findProjectById,
    findProjectMember: memberRepository.findProjectMember,
    listProjectMembers: memberRepository.listProjectMembers,
  };

  return {
    getBrief: async (actor: Actor, projectId: string) => {
      await assertProjectAccess(accessRepo, actor, projectId);
      await memberRepository.touchProjectMemberActivity(projectId, actor.sub);
      const brief = await briefRepository.getBriefByProject(projectId);
      if (!brief) throw new NotFoundError("Brief no encontrado");
      return brief;
    },

    patchBrief: async (actor: Actor, projectId: string, body: string, meta: RequestMeta) => {
      const { member } = await assertProjectAccess(accessRepo, actor, projectId);
      if (!canManageProject(actor.role, member?.role)) throw new ForbiddenError("Solo admin edita brief");
      const brief = await briefRepository.upsertBrief({
        projectId,
        content: body,
        updatedBySub: actor.sub,
      });
      await briefRepository.createBriefChangeLog({
        projectId,
        requestedBySub: actor.sub,
        approvedBySub: actor.sub,
        description: "Actualización manual del brief",
        sourceChangeRequestId: null,
      });
      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "project_brief_updated",
        resourceType: "project_brief",
        resourceId: projectId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return brief;
    },
  };
};
