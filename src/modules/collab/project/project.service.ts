import type { GlobalRole, ProjectType } from "../collab.types";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { collabEvents } from "../events";
import { getUserProfilesFromSnapshots } from "../../../shared/identity-snapshot-store";
import { db } from "../../../db/connection";
import { createProjectRepository } from "./project.repository";
import { createMemberRepository } from "../member/member.repository";
import { createBoardRepository } from "../board/board.repository";
import { createBriefRepository } from "../brief/brief.repository";
import { createAuditRepository } from "../repository/audit.repository";
import { defaultColumnsByType, PROJECT_BOARD_TASK_LIMIT } from "../shared/constants";
import { assertProjectAccess } from "../shared/project-access";
import { enrichProjectMembersWithProfiles } from "../shared/mappers";
import { canManageProject } from "../shared/guards";

type Actor = {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
  bearerToken?: string;
};
type RequestMeta = { ipAddress: string; userAgent: string };

export const createProjectService = (
  projectRepository: ReturnType<typeof createProjectRepository>,
  memberRepository: ReturnType<typeof createMemberRepository>,
  boardRepository: ReturnType<typeof createBoardRepository>,
  briefRepository: ReturnType<typeof createBriefRepository>,
  changeRequestRepository: {
    listChangeRequestsByProject: (projectId: string, type?: "minor" | "formal") => Promise<any[]>;
  }
) => {
  const accessRepo = {
    findProjectById: projectRepository.findProjectById,
    findProjectMember: memberRepository.findProjectMember,
    listProjectMembers: memberRepository.listProjectMembers,
  };

  return {
    listProjects: async (
      actor: Actor,
      query: {
        page: number;
        limit: number;
        type?: "campaign_service" | "product_order";
        status?: "todo" | "in_progress" | "in_review" | "completed";
        adminSub?: string;
        clientName?: string;
      }
    ) => {
      const { rows, total } = await projectRepository.listProjectsForUser({
        userSub: actor.sub,
        type: query.type,
        status: query.status,
        adminResponsibleSub: query.adminSub,
        clientName: query.clientName,
        limit: query.limit,
        offset: (query.page - 1) * query.limit,
      });
      const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
      return { items: rows, page: query.page, limit: query.limit, total, total_pages: totalPages };
    },

    searchProjects: async (actor: Actor, query: { q: string; limit: number }) => {
      return projectRepository.searchProjectsForUser({
        userSub: actor.sub,
        role: actor.role,
        q: query.q,
        limit: query.limit,
      });
    },

    createProject: async (
      actor: Actor,
      payload: {
        name: string;
        description: string;
        clientName: string;
        clientSub?: string;
        workerSubs: string[];
        type: ProjectType;
        estimatedDueDate?: Date;
        brief: string;
      },
      meta: RequestMeta
    ) => {
      if (actor.role !== "admin") throw new ForbiddenError("Solo admin puede crear proyectos");

      const uniqueWorkerSubs = [...new Set(payload.workerSubs)].filter(
        (sub) => sub !== actor.sub && sub !== payload.clientSub
      );
      const subsForProfiles = [...uniqueWorkerSubs, ...(payload.clientSub ? [payload.clientSub] : [])];
      const memberProfilesResult =
        subsForProfiles.length > 0
          ? await getUserProfilesFromSnapshots(subsForProfiles)
          : await getUserProfilesFromSnapshots([]);
      const memberProfiles = memberProfilesResult.profiles;

      const project = await db.transaction(async (tx) => {
        const txProjectRepo = createProjectRepository(tx);
        const txMemberRepo = createMemberRepository(tx);
        const txBoardRepo = createBoardRepository(tx);
        const txBriefRepo = createBriefRepository(tx);
        const txAuditRepo = createAuditRepository(tx);

        const project = await txProjectRepo.createProject({
          name: payload.name,
          description: payload.description,
          clientName: payload.clientName,
          clientSub: payload.clientSub ?? null,
          type: payload.type,
          adminResponsibleSub: actor.sub,
          estimatedDueDate: payload.estimatedDueDate ?? null,
          status: "todo",
          progressPercent: 0,
        });
        await txMemberRepo.createProjectMember({
          projectId: project.id,
          userSub: actor.sub,
          role: "admin",
          userEmail: actor.email,
        });
        for (const workerSub of uniqueWorkerSubs) {
          await txMemberRepo.upsertProjectMember({
            projectId: project.id,
            userSub: workerSub,
            role: "worker",
            userEmail: memberProfiles.get(workerSub)?.email ?? null,
          });
        }
        if (payload.clientSub) {
          await txMemberRepo.upsertProjectMember({
            projectId: project.id,
            userSub: payload.clientSub,
            role: "client",
            userEmail: memberProfiles.get(payload.clientSub)?.email ?? null,
          });
        }
        await txBoardRepo.createDefaultTaskColumns(project.id, payload.type);
        await txBriefRepo.createBrief({
          projectId: project.id,
          content: payload.brief,
          updatedBySub: actor.sub,
        });
        await txAuditRepo.createAuditLog({
          actorSub: actor.sub,
          action: "project_created",
          resourceType: "project",
          resourceId: project.id,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          details: { type: project.type, client: project.clientName },
        });
        return project;
      });

      void collabEvents.emit("project.created", project.id, actor.sub, {
        projectId: project.id,
        projectName: project.name,
        projectType: project.type,
        clientName: project.clientName,
        clientSub: project.clientSub ?? undefined,
        adminResponsibleSub: project.adminResponsibleSub,
      });

      return project;
    },

    updateProject: async (
      actor: Actor,
      projectId: string,
      patch: {
        name?: string;
        description?: string | null;
        status?: "todo" | "in_progress" | "in_review" | "completed";
        estimatedDueDate?: Date | null;
        progressPercent?: number;
      },
      meta: RequestMeta
    ) => {
      const { project, member } = await assertProjectAccess(accessRepo, actor, projectId);
      if (!canManageProject(actor.role, member?.role)) {
        throw new ForbiddenError("Solo administradores editan proyecto");
      }
      const updated = await projectRepository.updateProjectById(projectId, {
        name: patch.name,
        description: patch.description ?? undefined,
        status: patch.status,
        estimatedDueDate: patch.estimatedDueDate ?? undefined,
        progressPercent: patch.progressPercent,
      });
      if (!updated) throw new NotFoundError("Proyecto no encontrado");
      await createAuditRepository(db).createAuditLog({
        actorSub: actor.sub,
        action: "project_updated",
        resourceType: "project",
        resourceId: projectId,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      });
      return updated;
    },

    getProjectWorkspace: async (actor: Actor, projectId: string) => {
      const { project } = await assertProjectAccess(accessRepo, actor, projectId);
      await memberRepository.touchProjectMemberActivity(projectId, actor.sub);
      const [members, columns, tasks, brief, formalChanges, assignees] = await Promise.all([
        memberRepository.listProjectMembers(projectId),
        boardRepository.listTaskColumnsByProject(projectId),
        boardRepository.listTasksByProject({ projectId, limit: PROJECT_BOARD_TASK_LIMIT, offset: 0 }),
        briefRepository.getBriefByProject(projectId),
        changeRequestRepository.listChangeRequestsByProject(projectId, "formal"),
        boardRepository.listTaskAssigneesByProject(projectId),
      ]);

      const enrichedMembers = await enrichProjectMembersWithProfiles(
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

      const isClient = actor.role === "client";
      const visibleColumns = isClient ? columns.filter((c: any) => c.isClientVisible) : columns;
      const visibleTasks = isClient ? tasks.rows.filter((t: any) => t.isClientVisible) : tasks.rows;
      const tasksTruncated = tasks.total > PROJECT_BOARD_TASK_LIMIT;

      return {
        project,
        members: enrichedMembers,
        board: {
          columns: visibleColumns,
          tasks: visibleTasks,
          tasksTotal: tasks.total,
          tasksLimit: PROJECT_BOARD_TASK_LIMIT,
          tasksTruncated,
        },
        brief,
        formalChanges,
      };
    },

    getProjectBoard: async (actor: Actor, projectId: string) => {
      const { project } = await assertProjectAccess(accessRepo, actor, projectId);
      await memberRepository.touchProjectMemberActivity(projectId, actor.sub);
      const [members, columns, tasks, assignees] = await Promise.all([
        memberRepository.listProjectMembers(projectId),
        boardRepository.listTaskColumnsByProject(projectId),
        boardRepository.listTasksByProject({ projectId, limit: PROJECT_BOARD_TASK_LIMIT, offset: 0 }),
        boardRepository.listTaskAssigneesByProject(projectId),
      ]);

      const { assigneeEmailBySub, taskCountBySub } = { assigneeEmailBySub: new Map<string, string>(), taskCountBySub: new Map<string, number>() }; // simplified; original used buildMemberAssignmentMaps
      for (const a of assignees) {
        if (!assigneeEmailBySub.has(a.userSub)) assigneeEmailBySub.set(a.userSub, a.userEmail);
        taskCountBySub.set(a.userSub, (taskCountBySub.get(a.userSub) ?? 0) + 1);
      }
      for (const t of tasks.rows) {
        if (!t.assigneeSub) continue;
        taskCountBySub.set(t.assigneeSub, (taskCountBySub.get(t.assigneeSub) ?? 0) + 1);
      }

      const lightweightMembers = members.map((member) => ({
        ...member,
        email: member.userEmail ?? assigneeEmailBySub.get(member.userSub) ?? null,
        taskCount: taskCountBySub.get(member.userSub) ?? 0,
        first_name: null,
        last_name: null,
        client_kind: null,
        company_name: null,
        profession: null,
      }));

      const isClient = actor.role === "client";
      const visibleColumns = isClient ? columns.filter((c: any) => c.isClientVisible) : columns;
      const visibleTasks = isClient ? tasks.rows.filter((t: any) => t.isClientVisible) : tasks.rows;
      const tasksTruncated = tasks.total > PROJECT_BOARD_TASK_LIMIT;

      return {
        project,
        members: lightweightMembers,
        board: {
          columns: visibleColumns,
          tasks: visibleTasks,
          tasksTotal: tasks.total,
          tasksLimit: PROJECT_BOARD_TASK_LIMIT,
          tasksTruncated,
        },
      };
    },

    listProjectTimeline: async (
      actor: Actor,
      projectId: string,
      query: { page: number; limit: number }
    ) => {
      await assertProjectAccess(accessRepo, actor, projectId);
      const { items, total } = await projectRepository.listProjectTimeline(
        projectId,
        actor.role === "client",
        query.page,
        query.limit
      );
      const totalPages = Math.ceil(total / query.limit);
      return { items, page: query.page, limit: query.limit, total, total_pages: totalPages };
    },
  };
};
