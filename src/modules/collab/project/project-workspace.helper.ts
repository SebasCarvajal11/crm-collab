import type { GlobalRole } from "../collab.types";
import { PROJECT_BOARD_TASK_LIMIT } from "../shared/constants";
import { enrichProjectMembersWithProfiles } from "../shared/mappers";
import type { createMemberRepository } from "../member/member.repository";
import type { createBoardRepository } from "../board/board.repository";
import type { createProjectRepository } from "./project.repository";
import type { createBriefRepository } from "../brief/brief.repository";

type Actor = {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
};

export interface WorkspaceHelperRepos {
  memberRepository: ReturnType<typeof createMemberRepository>;
  boardRepository: ReturnType<typeof createBoardRepository>;
  projectRepository: ReturnType<typeof createProjectRepository>;
  briefRepository: ReturnType<typeof createBriefRepository>;
  changeRequestRepository: {
    listChangeRequestsByProject: (projectId: string, type?: "minor" | "formal") => Promise<any[]>;
  };
}

export async function fetchProjectBoardData(
  repos: Pick<WorkspaceHelperRepos, "memberRepository" | "boardRepository" | "projectRepository">,
  actor: Actor,
  projectId: string
) {
  const isClient = actor.role === "client";
  const [members, columns, tasks, assignees, taskCounts] = await Promise.all([
    repos.memberRepository.listProjectMembers(projectId),
    repos.boardRepository.listTaskColumnsByProject(projectId, isClient ? true : undefined),
    repos.boardRepository.listTasksByProject({
      projectId,
      limit: PROJECT_BOARD_TASK_LIMIT,
      offset: 0,
      isClientVisible: isClient ? true : undefined,
    }),
    repos.boardRepository.listTaskAssigneesByProject(projectId, isClient ? true : undefined),
    repos.boardRepository.listTaskCountsByAssigneeByProject(projectId, isClient ? true : undefined),
  ]);

  const enrichedMembers = await enrichProjectMembersWithProfiles(
    {
      listProjectMembers: repos.memberRepository.listProjectMembers,
      findProjectById: repos.projectRepository.findProjectById,
      findProjectMember: repos.memberRepository.findProjectMember,
      listTasksByProject: repos.boardRepository.listTasksByProject,
      listTaskAssigneesByProject: repos.boardRepository.listTaskAssigneesByProject,
    } as any,
    members,
    actor,
    assignees,
    tasks.rows,
    taskCounts
  );

  return {
    members: enrichedMembers,
    board: {
      columns,
      tasks: tasks.rows,
      tasksTotal: tasks.total,
      tasksLimit: PROJECT_BOARD_TASK_LIMIT,
      tasksTruncated: tasks.total > PROJECT_BOARD_TASK_LIMIT,
    },
  };
}

export async function fetchProjectWorkspaceData(
  repos: WorkspaceHelperRepos,
  actor: Actor,
  projectId: string
) {
  const [boardData, brief, formalChanges] = await Promise.all([
    fetchProjectBoardData(repos, actor, projectId),
    repos.briefRepository.getBriefByProject(projectId),
    repos.changeRequestRepository.listChangeRequestsByProject(projectId, "formal"),
  ]);

  return {
    ...boardData,
    brief,
    formalChanges,
  };
}
