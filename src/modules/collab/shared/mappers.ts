import { getUserProfilesFromSnapshots } from "../../../shared/identity-snapshot-store";
import { BadRequestError } from "../../../shared/middlewares/error-handler.middleware";
import { getLogger } from "../../../shared/logger";
import type { GlobalRole, ProjectMemberRole } from "../collab.types";

const logger = getLogger();

interface MemberRepo {
  listProjectMembers: (projectId: string) => Promise<any[]>;
  findProjectById: (projectId: string) => Promise<any>;
  findProjectMember: (projectId: string, userSub: string) => Promise<any>;
  listTasksByProject: (opts: { projectId: string; limit: number; offset: number }) => Promise<{ rows: any[]; total: number }>;
  listTaskAssigneesByProject: (projectId: string) => Promise<any[]>;
}

type Actor = {
  sub: string;
  userId: string;
  role: string;
  email: string;
  bearerToken?: string;
};

export const allowedMentionRolesByActor = (actorRole: GlobalRole): ProjectMemberRole[] => {
  if (actorRole === "admin" || actorRole === "worker") return ["admin", "worker", "client"];
  return ["admin", "worker"];
};

export const resolveAssigneeEmails = async (
  repo: MemberRepo,
  _actor: Actor,
  projectId: string,
  assignees: { userSub: string; userEmail?: string }[]
): Promise<{ userSub: string; userEmail: string }[]> => {
  if (!assignees.length) return [];

  const members = await repo.listProjectMembers(projectId);
  const emailBySub = new Map(
    members.map((m) => [m.userSub, m.userEmail] as const)
  );

  const missingSubs = [
    ...new Set(
      assignees
        .filter((a) => !a.userEmail && !emailBySub.get(a.userSub))
        .map((a) => a.userSub)
    ),
  ];
  const { profiles } =
    missingSubs.length > 0 ? await getUserProfilesFromSnapshots(missingSubs) : { profiles: new Map() };

  return assignees.map((a) => {
    const email =
      a.userEmail ?? emailBySub.get(a.userSub) ?? profiles.get(a.userSub)?.email ?? null;
    if (!email) {
      throw new BadRequestError(
        "No se pudo resolver el correo del asignado desde la replica local de identidad. Sincroniza los snapshots y vuelve a intentar."
      );
    }
    return { userSub: a.userSub, userEmail: email };
  });
};

export const buildMemberAssignmentMaps = (
  assignees: Array<{ taskId: string; userSub: string; userEmail: string }>,
  tasks: Array<{ id: string; assigneeSub: string | null }>
) => {
  const assigneeEmailBySub = new Map<string, string>();
  const taskIdsByAssignee = new Map<string, Set<string>>();

  const registerAssignment = (userSub: string, taskId: string) => {
    const taskIds = taskIdsByAssignee.get(userSub) ?? new Set<string>();
    taskIds.add(taskId);
    taskIdsByAssignee.set(userSub, taskIds);
  };

  for (const assignee of assignees) {
    if (!assigneeEmailBySub.has(assignee.userSub)) assigneeEmailBySub.set(assignee.userSub, assignee.userEmail);
    registerAssignment(assignee.userSub, assignee.taskId);
  }

  for (const task of tasks) {
    if (!task.assigneeSub) continue;
    registerAssignment(task.assigneeSub, task.id);
  }

  const taskCountBySub = new Map(
    [...taskIdsByAssignee].map(([userSub, taskIds]) => [userSub, taskIds.size])
  );
  return { assigneeEmailBySub, taskCountBySub };
};

export const buildTaskCountMap = (
  taskCounts: Array<{ userSub: string; taskCount: number }>
) => new Map(taskCounts.map(({ userSub, taskCount }) => [userSub, Number(taskCount)]));

export const enrichProjectMembersWithProfiles = async (
  repo: MemberRepo,
  members: Array<{
    projectId: string;
    userSub: string;
    role: "admin" | "worker" | "client";
    userEmail: string | null;
    lastSeenAt: Date | null;
  }>,
  actor: Actor,
  assignees: Array<{ taskId: string; userSub: string; userEmail: string }>,
  tasks: Array<{ id: string; assigneeSub: string | null }>,
  taskCounts?: Array<{ userSub: string; taskCount: number }>
) => {
  const { assigneeEmailBySub, taskCountBySub: taskCountsFromLoadedTasks } = buildMemberAssignmentMaps(assignees, tasks);
  const taskCountBySub = taskCounts ? buildTaskCountMap(taskCounts) : taskCountsFromLoadedTasks;
  const userSubs = [...new Set(members.map((m) => m.userSub).filter(Boolean))];
  const { profiles: profileMap, missingSubs, replicaUnavailable } =
    await getUserProfilesFromSnapshots(userSubs);
  if (replicaUnavailable || missingSubs.length > 0) {
    logger.warn(
      { missing: missingSubs.length, replicaUnavailable },
      "[collab] Perfiles de miembros incompletos desde snapshots locales"
    );
  }

  return members.map((member) => ({
    ...member,
    email: member.userEmail ?? assigneeEmailBySub.get(member.userSub) ?? profileMap.get(member.userSub)?.email ?? null,
    taskCount: taskCountBySub.get(member.userSub) ?? 0,
    role_label: profileMap.get(member.userSub)?.role ?? member.role,
    first_name: profileMap.get(member.userSub)?.firstName ?? null,
    last_name: profileMap.get(member.userSub)?.lastName ?? null,
    client_kind: profileMap.get(member.userSub)?.clientKind ?? null,
    company_name: profileMap.get(member.userSub)?.companyName ?? null,
    profession: profileMap.get(member.userSub)?.profession ?? null,
  }));
};
