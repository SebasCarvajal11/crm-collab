import { NotFoundError, ForbiddenError, BadRequestError } from "../../../shared/middlewares/error-handler.middleware";
import type { ProjectMemberRole } from "../collab.types";

interface ProjectAccessRepo {
  findProjectById: (projectId: string) => Promise<any>;
  findProjectMember: (projectId: string, userSub: string) => Promise<any>;
  listProjectMembers: (projectId: string) => Promise<any[]>;
}

type Actor = {
  sub: string;
  userId: string;
  role: string;
  email: string;
  bearerToken?: string;
};

/**
 * Los administradores globales tienen acceso a cualquier proyecto activo.
 * No se crea una membresía implícita: el objeto virtual solo permite evaluar
 * las capacidades del administrador sin modificar la composición del proyecto.
 */
export const assertProjectAccess = async (repo: ProjectAccessRepo, actor: Actor, projectId: string) => {
  const project = await repo.findProjectById(projectId);
  if (!project) throw new NotFoundError("Proyecto no encontrado");
  if (actor.role === "admin") return { project, member: { role: "admin" as const } };
  const member = await repo.findProjectMember(projectId, actor.sub);
  if (!member) throw new ForbiddenError("No eres miembro del proyecto");
  return { project, member };
};

export const assertWorkerOnlyAssignments = async (
  repo: ProjectAccessRepo,
  projectId: string,
  payload: {
    assignees?: { userSub: string }[];
    subtasks?: { assigneeSub?: string | null }[];
  }
) => {
  const projectMembers = await repo.listProjectMembers(projectId);
  const assignableSubs = new Set(
    projectMembers
      .filter((m) => m.role === "worker" || m.role === "admin")
      .map((m) => m.userSub)
  );

  for (const assignee of payload.assignees ?? []) {
    if (!assignableSubs.has(assignee.userSub)) {
      throw new BadRequestError("Solo puedes asignar tareas a trabajadores o administradores del proyecto");
    }
  }

  for (const subtask of payload.subtasks ?? []) {
    if (!subtask.assigneeSub) continue;
    if (!assignableSubs.has(subtask.assigneeSub)) {
      throw new BadRequestError("Las subtareas solo pueden asignarse a trabajadores o administradores del proyecto");
    }
  }
};

/** Prevent a project-local role from granting capabilities above the identity role. */
export const assertProjectMemberRoleCompatibility = (
  identityRole: string,
  projectRole: ProjectMemberRole
) => {
  const compatible =
    (projectRole === "admin" && identityRole === "admin") ||
    (projectRole === "worker" && (identityRole === "worker" || identityRole === "admin")) ||
    (projectRole === "client" && identityRole === "client");
  if (!compatible) {
    throw new BadRequestError("El rol asignado en el proyecto no es compatible con la identidad del usuario");
  }
};
