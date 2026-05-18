import type { CollabRepository } from "./collab.repository";
import type { GlobalRole, ProjectMemberRole, ProjectType } from "./collab.types";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../shared/middlewares/error-handler.middleware";
import { collabEvents } from "./events";
import { fetchUserProfiles } from "../../shared/auth-client";
import { getMediaDocumentAccessUrl, deleteDocumentInMedia } from "../../shared/media-client";
import { v4 as uuidv4 } from "uuid";
import { ociStorage } from "../../shared/storage/oci-storage";
import { sanitizeFileName } from "../../shared/sanitize-filename";

type Actor = {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
  bearerToken?: string;
};
type RequestMeta = { ipAddress: string; userAgent: string };

const canManageProject = (globalRole: GlobalRole, memberRole?: ProjectMemberRole) =>
  globalRole === "admin" || memberRole === "admin";
const canMoveTasks = (globalRole: GlobalRole, memberRole?: ProjectMemberRole) =>
  globalRole === "admin" || memberRole === "admin" || memberRole === "worker";
const canInternalChat = (globalRole: GlobalRole, memberRole?: ProjectMemberRole) =>
  globalRole === "admin" || memberRole === "admin" || memberRole === "worker";
const canReceiveMentionInChannel = (channel: "internal" | "external", memberRole: ProjectMemberRole) =>
  channel === "internal" ? memberRole === "admin" || memberRole === "worker" : true;

const FINALIZATION_COLUMN_KEYS = new Set(["done", "completed"]);

/** Máximo de tareas cargadas en workspace/board en una sola petición. */
const PROJECT_BOARD_TASK_LIMIT = 2000;

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".dll", ".com",
  ".vbs", ".js", ".ts", ".jsx", ".tsx", ".py", ".rb", ".pl", ".php",
]);

const BLOCKED_MIMES = new Set([
  "application/x-msdownload",
  "application/x-executable",
  "application/x-sh",
  "application/x-bat",
  "text/javascript",
  "application/javascript",
  "application/x-php",
]);

const isCollabManagedStoragePath = (storagePath: string) => storagePath.startsWith("projects/");

const assertAllowedUploadMime = (mimeType: string, fileName: string) => {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext)) throw new BadRequestError("Tipo de archivo no permitido");
  if (BLOCKED_MIMES.has(mimeType)) throw new BadRequestError("Tipo de archivo no permitido");
};

const assertOciObjectRegistered = async (
  projectId: string,
  storagePath: string,
  taskId?: string,
) => {
  const projectPrefix = `projects/${projectId}/`;
  if (!storagePath.startsWith(projectPrefix)) {
    throw new BadRequestError("storage_path no pertenece al proyecto");
  }
  if (taskId) {
    const taskPrefix = `projects/${projectId}/tasks/${taskId}/`;
    if (!storagePath.startsWith(taskPrefix)) {
      throw new BadRequestError("storage_path no pertenece a la tarea");
    }
  }
  const exists = await ociStorage.headObject(storagePath);
  if (!exists) {
    throw new BadRequestError(
      "El archivo aún no está en almacenamiento; completa el upload a OCI antes de confirmar",
    );
  }
};

const calculateChecklistProgress = (
  subtasks?: { isCompleted: boolean }[] | null,
  fallbackProgress = 0
) => {
  if (subtasks === undefined) return fallbackProgress;
  if (subtasks === null) return fallbackProgress;
  if (!subtasks.length) return 0;
  const completed = subtasks.filter((s) => s.isCompleted).length;
  return Math.round((completed / subtasks.length) * 100);
};

const isTaskInFinalizationColumn = (columnKey: string) => FINALIZATION_COLUMN_KEYS.has(columnKey);

const isTaskCompleted = (columnKey: string, checklistProgress: number) =>
  isTaskInFinalizationColumn(columnKey) && checklistProgress === 100;


const allowedMentionRolesByActor = (actorRole: GlobalRole): ProjectMemberRole[] => {
  if (actorRole === "admin") return ["admin", "worker", "client"];
  if (actorRole === "worker") return ["worker", "client"];
  return ["worker"];
};

const defaultColumnsByType = (type: ProjectType) =>
  type === "campaign_service"
    ? [
        { key: "pending", title: "Pendiente", position: 0, isClientVisible: false },
        { key: "doing", title: "Haciendo", position: 1, isClientVisible: false },
        { key: "internal_review", title: "En Revisión Interna", position: 2, isClientVisible: false },
        { key: "client_approval", title: "En Aprobación Cliente", position: 3, isClientVisible: true },
        { key: "blocked", title: "Bloqueado", position: 4, isClientVisible: false },
        { key: "done", title: "Hecho", position: 5, isClientVisible: true },
      ]
    : [
        { key: "pending", title: "Pendiente", position: 0, isClientVisible: false },
        { key: "art_approved", title: "Arte Aprobado", position: 1, isClientVisible: true },
        { key: "in_production", title: "En Producción", position: 2, isClientVisible: false },
        { key: "quality_control", title: "En Control de Calidad", position: 3, isClientVisible: false },
        { key: "shipped", title: "Enviado", position: 4, isClientVisible: true },
        { key: "completed", title: "Completado", position: 5, isClientVisible: true },
        { key: "waiting_material", title: "Esperando Material", position: 6, isClientVisible: false },
      ];

const inferParentStatus = (taskColumnKeys: string[]): "todo" | "in_progress" | "in_review" | "completed" => {
  if (!taskColumnKeys.length) return "todo";
  const allDone = taskColumnKeys.every((k) => k === "done" || k === "completed");
  if (allDone) return "completed";
  if (taskColumnKeys.some((k) => k === "client_approval" || k === "quality_control")) return "in_review";
  if (taskColumnKeys.some((k) => k !== "pending")) return "in_progress";
  return "todo";
};

const inferProgress = (type: ProjectType, taskColumnKeys: string[]): number => {
  if (!taskColumnKeys.length) return 0;
  if (type === "product_order") {
    if (taskColumnKeys.some((k) => k === "shipped" || k === "completed")) return 100;
    if (taskColumnKeys.some((k) => k === "quality_control")) return 80;
    if (taskColumnKeys.some((k) => k === "in_production")) return 60;
    if (taskColumnKeys.some((k) => k === "art_approved")) return 30;
    return 0;
  }
  const map: Record<string, number> = {
    pending: 0,
    doing: 25,
    internal_review: 50,
    client_approval: 75,
    done: 100,
    blocked: 10,
    waiting_material: 10,
    completed: 100,
    in_production: 60,
    quality_control: 80,
    shipped: 100,
    art_approved: 30,
  };
  const sum = taskColumnKeys.reduce((acc, key) => acc + (map[key] ?? 0), 0);
  return Math.round(sum / taskColumnKeys.length);
};

/**
 * Acceso a un proyecto solo por membresía en `project_members`.
 * El rol global `admin` no omite esta comprobación (aislamiento entre administradores).
 */
const assertProjectAccess = async (repo: CollabRepository, actor: Actor, projectId: string) => {
  const project = await repo.findProjectById(projectId);
  if (!project) throw new NotFoundError("Proyecto no encontrado");
  const member = await repo.findProjectMember(projectId, actor.sub);
  if (!member) throw new ForbiddenError("No eres miembro del proyecto");
  return { project, member };
};



const assertWorkerOnlyAssignments = async (
  repo: CollabRepository,
  projectId: string,
  payload: {
    assignees?: { userSub: string }[];
    subtasks?: { assigneeSub?: string | null }[];
  }
) => {
  const projectMembers = await repo.listProjectMembers(projectId);
  const workerSubs = new Set(projectMembers.filter((m) => m.role === "worker").map((m) => m.userSub));

  for (const assignee of payload.assignees ?? []) {
    if (!workerSubs.has(assignee.userSub)) {
      throw new BadRequestError("Solo puedes asignar tareas a trabajadores del proyecto");
    }
  }

  for (const subtask of payload.subtasks ?? []) {
    if (!subtask.assigneeSub) continue;
    if (!workerSubs.has(subtask.assigneeSub)) {
      throw new BadRequestError("Las subtareas solo pueden asignarse a trabajadores del proyecto");
    }
  }
};

const resolveAssigneeEmails = async (
  repo: CollabRepository,
  actor: Actor,
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
    missingSubs.length > 0 ? await fetchUserProfiles(missingSubs, actor) : { profiles: new Map() };

  return assignees.map((a) => {
    const email =
      a.userEmail ?? emailBySub.get(a.userSub) ?? profiles.get(a.userSub)?.email ?? null;
    if (!email) {
      throw new BadRequestError(
        "No se pudo resolver el correo de uno o más asignados. Verifica que mod-auth esté activo (MOD_AUTH_URL) y reinicia mod-collab."
      );
    }
    return { userSub: a.userSub, userEmail: email };
  });
};

const buildMemberAssignmentMaps = (
  assignees: Array<{ userSub: string; userEmail: string }>,
  tasks: Array<{ assigneeSub: string | null }>
) => {
  const assigneeEmailBySub = new Map<string, string>();
  const taskCountBySub = new Map<string, number>();

  for (const assignee of assignees) {
    if (!assigneeEmailBySub.has(assignee.userSub)) assigneeEmailBySub.set(assignee.userSub, assignee.userEmail);
    taskCountBySub.set(assignee.userSub, (taskCountBySub.get(assignee.userSub) ?? 0) + 1);
  }

  for (const task of tasks) {
    if (!task.assigneeSub) continue;
    taskCountBySub.set(task.assigneeSub, (taskCountBySub.get(task.assigneeSub) ?? 0) + 1);
  }

  return { assigneeEmailBySub, taskCountBySub };
};

const enrichProjectMembersWithProfiles = async (
  repo: CollabRepository,
  members: Array<{
    projectId: string;
    userSub: string;
    role: "admin" | "worker" | "client";
    userEmail: string | null;
    lastSeenAt: Date | null;
  }>,
  actor: Actor,
  assignees: Array<{ userSub: string; userEmail: string }>,
  tasks: Array<{ assigneeSub: string | null }>
) => {
  const { assigneeEmailBySub, taskCountBySub } = buildMemberAssignmentMaps(assignees, tasks);
  const userSubs = [...new Set(members.map((m) => m.userSub).filter(Boolean))];
  const { profiles: profileMap, enrichmentFailed } = await fetchUserProfiles(userSubs, actor);
  if (enrichmentFailed) {
    console.warn("[collab] Perfiles de miembros incompletos: mod-auth no disponible o error de red");
  }

  if (!enrichmentFailed) {
    await Promise.all(
      members.map(async (member) => {
        const profileEmail = profileMap.get(member.userSub)?.email;
        if (profileEmail && !member.userEmail) {
          await repo.upsertProjectMember({
            projectId: member.projectId,
            userSub: member.userSub,
            role: member.role,
            userEmail: profileEmail,
          });
        }
      })
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

export const createCollabService = (repo: CollabRepository) => ({
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
    const { rows, total } = await repo.listProjectsForUser({
      userSub: actor.sub,
      type: query.type,
      status: query.status,
      adminResponsibleSub: query.adminSub,
      clientName: query.clientName,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);

    return {
      items: rows,
      page: query.page,
      limit: query.limit,
      total,
      total_pages: totalPages,
    };
  },

  searchProjects: async (
    actor: Actor,
    query: { q: string; limit: number }
  ) => {
    return repo.searchProjectsForUser({
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
    const subsForProfiles = [
      ...uniqueWorkerSubs,
      ...(payload.clientSub ? [payload.clientSub] : []),
    ];
    const memberProfilesResult =
      subsForProfiles.length > 0
        ? await fetchUserProfiles(subsForProfiles, actor)
        : await fetchUserProfiles([], actor);
    const memberProfiles = memberProfilesResult.profiles;

    const project = await repo.transaction(async (txRepo) => {
      const project = await txRepo.createProject({
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
      await txRepo.createProjectMember({
        projectId: project.id,
        userSub: actor.sub,
        role: "admin",
        userEmail: actor.email,
      });
      for (const workerSub of uniqueWorkerSubs) {
        await txRepo.upsertProjectMember({
          projectId: project.id,
          userSub: workerSub,
          role: "worker",
          userEmail: memberProfiles.get(workerSub)?.email ?? null,
        });
      }
      if (payload.clientSub) {
        await txRepo.upsertProjectMember({
          projectId: project.id,
          userSub: payload.clientSub,
          role: "client",
          userEmail: memberProfiles.get(payload.clientSub)?.email ?? null,
        });
      }
      for (const c of defaultColumnsByType(payload.type)) {
        await txRepo.createTaskColumn({
          projectId: project.id,
          key: c.key as never,
          title: c.title,
          position: c.position,
          isClientVisible: c.isClientVisible,
          isDefault: true,
        });
      }
      await txRepo.createBrief({ projectId: project.id, content: payload.brief, updatedBySub: actor.sub });
      await txRepo.createAuditLog({
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

    // Emit event
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
    const { member } = await assertProjectAccess(repo, actor, projectId);
    if (actor.role !== "admin") throw new ForbiddenError("Solo admin puede editar proyecto");
    if (!canManageProject(actor.role, member?.role)) throw new ForbiddenError("Solo administradores editan proyecto");
    const updated = await repo.updateProjectById(projectId, {
      name: patch.name,
      description: patch.description ?? undefined,
      status: patch.status,
      estimatedDueDate: patch.estimatedDueDate ?? undefined,
      progressPercent: patch.progressPercent,
    });
    if (!updated) throw new NotFoundError("Proyecto no encontrado");
    await repo.createAuditLog({
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
    const { project } = await assertProjectAccess(repo, actor, projectId);
    await repo.touchProjectMemberActivity(projectId, actor.sub);
    const [members, columns, tasks, brief, formalChanges, assignees] = await Promise.all([
      repo.listProjectMembers(projectId),
      repo.listTaskColumnsByProject(projectId),
      repo.listTasksByProject({ projectId, limit: PROJECT_BOARD_TASK_LIMIT, offset: 0 }),
      repo.getBriefByProject(projectId),
      repo.listChangeRequestsByProject(projectId, "formal"),
      repo.listTaskAssigneesByProject(projectId),
    ]);

    const enrichedMembers = await enrichProjectMembersWithProfiles(repo, members, actor, assignees, tasks.rows);

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
    const { project } = await assertProjectAccess(repo, actor, projectId);
    await repo.touchProjectMemberActivity(projectId, actor.sub);
    const [members, columns, tasks, assignees] = await Promise.all([
      repo.listProjectMembers(projectId),
      repo.listTaskColumnsByProject(projectId),
      repo.listTasksByProject({ projectId, limit: PROJECT_BOARD_TASK_LIMIT, offset: 0 }),
      repo.listTaskAssigneesByProject(projectId),
    ]);

    const { assigneeEmailBySub, taskCountBySub } = buildMemberAssignmentMaps(assignees, tasks.rows);

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
    const visibleColumns = isClient ? columns.filter((c) => c.isClientVisible) : columns;
    const visibleTasks = isClient ? tasks.rows.filter((t) => t.isClientVisible) : tasks.rows;
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


  upsertProjectMember: async (
    actor: Actor,
    projectId: string,
    userSub: string,
    role: "admin" | "worker" | "client",
    userEmail: string | undefined,
    meta: RequestMeta
  ) => {
    const { member } = await assertProjectAccess(repo, actor, projectId);
    if (actor.role !== "admin") throw new ForbiddenError("Solo admin gestiona miembros");
    if (!canManageProject(actor.role, member?.role)) throw new ForbiddenError("Solo admin gestiona miembros");
    const row = await repo.upsertProjectMember({ projectId, userSub, role, userEmail: userEmail ?? null });
    await repo.createAuditLog({
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
    await assertProjectAccess(repo, actor, projectId);
    await repo.touchProjectMemberActivity(projectId, actor.sub);
    const [members, assignees, tasks] = await Promise.all([
      repo.listProjectMembers(projectId),
      repo.listTaskAssigneesByProject(projectId),
      repo.listTasksByProject({ projectId, limit: PROJECT_BOARD_TASK_LIMIT, offset: 0 }),
    ]);
    return enrichProjectMembersWithProfiles(repo, members, actor, assignees, tasks.rows);
  },

  createTaskColumn: async (
    actor: Actor,
    projectId: string,
    payload: { key: string; title: string; position: number; isClientVisible: boolean },
    meta: RequestMeta
  ) => {
    const { member } = await assertProjectAccess(repo, actor, projectId);
    if (actor.role !== "admin") throw new ForbiddenError("Solo admin crea/edita columnas y flujo");
    if (!canManageProject(actor.role, member?.role)) {
      throw new ForbiddenError("Solo administrador crea/edita columnas y flujo");
    }
    const row = await repo.createTaskColumn({
      projectId,
      key: payload.key as never,
      title: payload.title,
      position: payload.position,
      isClientVisible: payload.isClientVisible,
      isDefault: false,
    });
    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "project_column_created",
      resourceType: "project_task_column",
      resourceId: row.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return row;
  },

  listTaskColumns: async (actor: Actor, projectId: string) => {
    await assertProjectAccess(repo, actor, projectId);
    return repo.listTaskColumnsByProject(projectId);
  },

  updateTaskColumn: async (
    actor: Actor,
    columnId: string,
    patch: { title?: string; position?: number; isClientVisible?: boolean },
    meta: RequestMeta
  ) => {
    const column = await repo.findTaskColumnById(columnId);
    if (!column) throw new NotFoundError("Columna no encontrada");
    const { member } = await assertProjectAccess(repo, actor, column.projectId);
    if (actor.role !== "admin") throw new ForbiddenError("Solo admin edita columnas");
    if (!canManageProject(actor.role, member?.role)) throw new ForbiddenError("Solo admin edita columnas");
    const row = await repo.updateTaskColumnById(columnId, patch);
    if (!row) throw new NotFoundError("Columna no encontrada");
    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "project_column_updated",
      resourceType: "project_task_column",
      resourceId: columnId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return row;
  },

  createTask: async (
    actor: Actor,
    projectId: string,
    payload: {
      columnId: string;
      title: string;
      description?: string;
      priority: "low" | "medium" | "high" | "urgent";
      assignees?: { userSub: string; userEmail?: string }[];
      dueDate?: Date | null;
      checklistProgress: number;
      blockedByTaskId?: string | null;
      clientVisible: boolean;
      position: number;
      subtasks?: { id: string; title: string; isCompleted: boolean; assigneeSub?: string | null }[];
    },
    meta: RequestMeta
  ) => {
    const { member } = await assertProjectAccess(repo, actor, projectId);
    if (!canMoveTasks(actor.role, member?.role)) throw new ForbiddenError("No puedes crear tareas");
    const column = await repo.findTaskColumnById(payload.columnId);
    if (!column || column.projectId !== projectId) throw new BadRequestError("La columna no pertenece al proyecto");
    await assertWorkerOnlyAssignments(repo, projectId, {
      assignees: payload.assignees,
      subtasks: payload.subtasks,
    });
    const primaryAssigneeSub = payload.assignees?.[0]?.userSub ?? null;

    const calculatedProgress = calculateChecklistProgress(payload.subtasks, payload.checklistProgress);
    const completedAt = isTaskCompleted(column.key, calculatedProgress) ? new Date() : null;

    const task = await repo.createTask({
      projectId,
      columnId: payload.columnId,
      title: payload.title,
      description: payload.description ?? null,
      priority: payload.priority,
      assigneeSub: primaryAssigneeSub,
      reporterSub: actor.sub,
      deadline: payload.dueDate ?? null,
      checklistProgress: calculatedProgress,
      blockedByTaskId: payload.blockedByTaskId ?? null,
      isClientVisible: payload.clientVisible,
      position: payload.position,
      completedAt,
    });
    if (payload.subtasks?.length) {
      await repo.upsertSubtasks(task.id, payload.subtasks);
    }
    if (payload.assignees?.length) {
      const resolvedAssignees = await resolveAssigneeEmails(repo, actor, projectId, payload.assignees);
      await repo.upsertTaskAssignees(task.id, resolvedAssignees);
    }
    await repo.syncProjectStatusAndProgress(projectId);
    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "project_task_created",
      resourceType: "project_task",
      resourceId: task.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return task;
  },

  listTasksByProject: async (actor: Actor, projectId: string, query: { page: number; limit: number; columnId?: string }) => {
    await assertProjectAccess(repo, actor, projectId);
    const { rows, total } = await repo.listTasksByProject({
      projectId,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      columnId: query.columnId,
      isClientVisible: actor.role === "client" ? true : undefined,
    });
    
    const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);

    return {
      items: rows,
      page: query.page,
      limit: query.limit,
      total,
      total_pages: totalPages,
    };
  },

  updateTask: async (
    actor: Actor,
    taskId: string,
    patch: {
      columnId?: string;
      title?: string;
      description?: string | null;
      priority?: "low" | "medium" | "high" | "urgent";
      assignees?: { userSub: string; userEmail?: string }[];
      dueDate?: Date | null;
      checklistProgress?: number;
      blockedByTaskId?: string | null;
      clientVisible?: boolean;
      position?: number;
      subtasks?: { id: string; title: string; isCompleted: boolean; assigneeSub?: string | null }[];
    },
    meta: RequestMeta
  ) => {
    const task = await repo.findTaskById(taskId);
    if (!task) throw new NotFoundError("Tarea no encontrada");
    const { member } = await assertProjectAccess(repo, actor, task.projectId);
    if (!canMoveTasks(actor.role, member?.role)) throw new ForbiddenError("No puedes editar/mover tareas");
    if (patch.assignees !== undefined || patch.subtasks !== undefined) {
      await assertWorkerOnlyAssignments(repo, task.projectId, {
        assignees: patch.assignees,
        subtasks: patch.subtasks,
      });
    }
    if (actor.role === "client" && patch.columnId) throw new ForbiddenError("Cliente no puede mover tareas");

    const primaryAssigneeSub = patch.assignees !== undefined
      ? (patch.assignees[0]?.userSub ?? null)
      : undefined;
    const currentColumn = await repo.findTaskColumnById(task.columnId);
    if (!currentColumn || currentColumn.projectId !== task.projectId) {
      throw new NotFoundError("Columna actual de la tarea no encontrada");
    }
    const targetColumn = patch.columnId ? await repo.findTaskColumnById(patch.columnId) : currentColumn;
    if (!targetColumn || targetColumn.projectId !== task.projectId) {
      throw new BadRequestError("Columna destino invalida");
    }

    const calculatedProgress = calculateChecklistProgress(
      patch.subtasks,
      patch.checklistProgress ?? task.checklistProgress
    );
    const effectiveSubtasks = patch.subtasks ?? ((task.subtasks as { isCompleted: boolean }[] | null) ?? []);
    if (isTaskInFinalizationColumn(targetColumn.key) && effectiveSubtasks.length > 0 && calculatedProgress < 100) {
      throw new BadRequestError("No puedes mover la tarea a la columna final sin completar todas las subtareas");
    }
    const completedAt = isTaskCompleted(targetColumn.key, calculatedProgress)
      ? task.completedAt ?? new Date()
      : null;

    const updated = await repo.updateTaskById(taskId, {
      columnId: patch.columnId,
      title: patch.title,
      description: patch.description,
      priority: patch.priority,
      assigneeSub: primaryAssigneeSub,
      deadline: patch.dueDate,
      checklistProgress: calculatedProgress,
      blockedByTaskId: patch.blockedByTaskId,
      isClientVisible: patch.clientVisible,
      position: patch.position,
      completedAt,
    });
    if (!updated) throw new NotFoundError("Tarea no encontrada");
    if (patch.subtasks !== undefined) {
      await repo.upsertSubtasks(taskId, patch.subtasks);
    }
    if (patch.assignees !== undefined) {
      const resolvedAssignees = await resolveAssigneeEmails(repo, actor, task.projectId, patch.assignees);
      await repo.upsertTaskAssignees(taskId, resolvedAssignees);
    }
    const columnChanged =
      patch.columnId !== undefined && patch.columnId !== task.columnId;
    if (columnChanged) {
      await repo.syncProjectStatusAndProgress(task.projectId);
    }

    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "project_task_updated",
      resourceType: "project_task",
      resourceId: taskId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    if (patch.columnId && patch.columnId !== task.columnId) {
      void collabEvents.emit("task.moved", task.projectId, actor.sub, {
        taskId: task.id,
        taskTitle: updated.title,
        fromColumnKey: currentColumn.key,
        toColumnKey: targetColumn.key,
        assigneeSub: updated.assigneeSub ?? undefined,
      });
    }

    if (patch.assignees !== undefined) {
      const newPrimary = patch.assignees[0]?.userSub;
      if (newPrimary && newPrimary !== task.assigneeSub) {
        void collabEvents.emit("task.assigned", task.projectId, actor.sub, {
          taskId: task.id,
          taskTitle: updated.title,
          assigneeSub: newPrimary,
          previousAssigneeSub: task.assigneeSub ?? undefined,
        });
      }
    }

    return updated;
  },

  listChatMessages: async (
    actor: Actor,
    projectId: string,
    channel: "internal" | "external",
    query: { page: number; limit: number }
  ) => {
    const { member } = await assertProjectAccess(repo, actor, projectId);
    await repo.touchProjectMemberActivity(projectId, actor.sub);
    if (channel === "internal" && !canInternalChat(actor.role, member?.role)) {
      throw new ForbiddenError("No tienes acceso al chat interno");
    }
    const { rows: messages, total } = await repo.listChatMessagesByChannel({
      projectId,
      channel,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    const members = await repo.listProjectMembers(projectId);
    const reads = await repo.listChatReadsByMessages(messages.map((m) => m.id));
    const readersByMessage = new Map<string, Set<string>>();
    for (const read of reads) {
      if (!readersByMessage.has(read.messageId)) readersByMessage.set(read.messageId, new Set());
      readersByMessage.get(read.messageId)!.add(read.userSub);
    }
    const memberSubs = new Set(members.map((m) => m.userSub));
    const memberBySub = new Map(members.map((m) => [m.userSub, m]));

    const items = messages.map((msg) => {
      const readers = readersByMessage.get(msg.id) ?? new Set<string>();
      const mentioned = ((msg.mentionedSubs ?? []) as string[]).filter((sub) => memberSubs.has(sub));
      const authorMember = msg.authorSub ? memberBySub.get(msg.authorSub) : undefined;
      const required = mentioned.length > 0
        ? mentioned.filter((sub) => sub !== msg.authorSub)
        : members.map((m) => m.userSub).filter((sub) => sub !== msg.authorSub);
      const seenCount = required.filter((sub) => readers.has(sub)).length;
      const isSeen = required.length === 0 ? true : seenCount === required.length;
      return {
        ...msg,
        authorFirstName: null,
        authorLastName: null,
        authorRole: authorMember?.role ?? null,
        authorProfession: null,
        readStatus: {
          isSeen,
          requiredCount: required.length,
          seenCount,
        },
      };
    });

    const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);

    return {
      items,
      page: query.page,
      limit: query.limit,
      total,
      total_pages: totalPages,
    };
  },

  postChatMessage: async (
    actor: Actor,
    projectId: string,
    channel: "internal" | "external",
    body: string,
    mentions: string[] | undefined,
    meta: RequestMeta
  ) => {
    const { member } = await assertProjectAccess(repo, actor, projectId);
    if (channel === "internal" && !canInternalChat(actor.role, member?.role)) {
      throw new ForbiddenError("No tienes acceso al chat interno");
    }
    const projectMembers = await repo.listProjectMembers(projectId);
    const allowedTargetRoles = new Set(allowedMentionRolesByActor(actor.role));
    const memberRoleBySub = new Map(projectMembers.map((m) => [m.userSub, m.role]));

    const mentionSubs = [...new Set(mentions ?? [])];
    for (const mentionedSub of mentionSubs) {
      const targetRole = memberRoleBySub.get(mentionedSub);
      if (!targetRole) {
        throw new BadRequestError("Solo puedes mencionar participantes del proyecto");
      }
      if (!allowedTargetRoles.has(targetRole)) {
        throw new ForbiddenError("No tienes permiso para mencionar ese rol en este proyecto");
      }
      if (!canReceiveMentionInChannel(channel, targetRole)) {
        throw new ForbiddenError("No puedes mencionar a este usuario en el canal seleccionado");
      }
    }

    const row = await repo.createChatMessage({
      projectId,
      channel,
      messageType: "text",
      authorSub: actor.sub,
      authorEmail: actor.email,
      body,
    });
    if (mentionSubs.length > 0) {
      await repo.createChatMentions(row.id, mentionSubs);
    }
    if (mentionSubs.length > 0) {
      const preview = body.trim().slice(0, 240);
      await repo.createMentionNotifications(
        mentionSubs
          .filter((sub) => sub !== actor.sub)
          .map((recipientSub) => ({
            projectId,
            messageId: row.id,
            channel,
            recipientSub,
            authorSub: actor.sub,
            authorEmail: actor.email,
            messagePreview: preview,
          }))
      );
    }
    await repo.markChatMessagesRead([{ messageId: row.id, userSub: actor.sub, readAt: new Date() }]);
    await repo.createAuditLog({
      actorSub: actor.sub,
      action: `chat_${channel}_message_created`,
      resourceType: "project_chat_message",
      resourceId: row.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Emit chat message event
    const eventType = channel === "internal" ? "chat.message.internal" : "chat.message.external";
    void collabEvents.emit(eventType, projectId, actor.sub, {
      messageId: row.id,
      channel,
      body,
    });

    // Emit mention events if any
    if (mentionSubs.length > 0) {
      void collabEvents.emit("chat.mention", projectId, actor.sub, {
        messageId: row.id,
        channel,
        mentionedSubs: mentionSubs,
        body,
      });
    }

    return row;
  },

  markChatAsRead: async (
    actor: Actor,
    projectId: string,
    channel: "internal" | "external",
    payload: { upToMessageId?: string; messageIds: string[] }
  ) => {
    const { member } = await assertProjectAccess(repo, actor, projectId);
    if (channel === "internal" && !canInternalChat(actor.role, member?.role)) {
      throw new ForbiddenError("No tienes acceso al chat interno");
    }

    const rowsToMark: string[] = [];

    if (payload.upToMessageId) {
      const target = await repo.findChatMessageByIdInChannel(projectId, channel, payload.upToMessageId);
      if (target) {
        const ids = await repo.listChatMessageIdsUpTo(projectId, channel, target.createdAt);
        rowsToMark.push(...ids);
      }
    }
    if (payload.messageIds.length > 0) {
      const { rows: messages } = await repo.listChatMessagesByChannel({
        projectId,
        channel,
        limit: 1000,
        offset: 0,
      });
      const idsInChannel = new Set(messages.map((m) => m.id));
      for (const id of payload.messageIds) {
        if (idsInChannel.has(id)) rowsToMark.push(id);
      }
    }

    const uniqueIds = [...new Set(rowsToMark)];
    if (!uniqueIds.length) return { marked: 0 };

    await repo.markChatMessagesRead(uniqueIds.map((id) => ({ messageId: id, userSub: actor.sub, readAt: new Date() })));
    await repo.markMentionNotificationsSeenByMessages(actor.sub, uniqueIds);
    return { marked: uniqueIds.length };
  },

  listUnreadMentionNotifications: async (actor: Actor) => {
    const rows = await repo.listUnreadMentionNotificationsByUser(actor.sub);
    const visibleRows = actor.role === "client"
      ? rows.filter((row) => row.channel !== "internal")
      : rows;
    const authorSubs = [...new Set(visibleRows.map((r) => r.authorSub).filter((v): v is string => Boolean(v)))];
    const { profiles: profileMap, enrichmentFailed } = await fetchUserProfiles(authorSubs, actor);
    if (enrichmentFailed) {
      console.warn("[collab] Nombres de autores en notificaciones pueden estar incompletos (mod-auth)");
    }
    return visibleRows.map((row) => {
      const profile = row.authorSub ? profileMap.get(row.authorSub) : undefined;
      const authorName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim();
      return {
        id: row.id,
        project_id: row.projectId,
        project_name: row.projectName,
        message_id: row.messageId,
        channel: row.channel,
        created_at: row.createdAt,
        message_preview: row.messagePreview,
        author_sub: row.authorSub,
        author_email: row.authorEmail,
        author_name: authorName || row.authorEmail || "Sistema",
      };
    });
  },

  countUnreadMentionNotifications: async (actor: Actor) => {
    return repo.countUnreadMentionNotificationsByUser(actor.sub);
  },

  markMentionNotificationSeen: async (actor: Actor, notificationId: string) => {
    const updated = await repo.markMentionNotificationSeen(notificationId, actor.sub);
    if (!updated) throw new NotFoundError("Notificacion no encontrada o ya vista");
    return { id: updated.id, is_seen: true, seen_at: updated.seenAt };
  },

  createMinorChangeRequest: async (
    actor: Actor,
    projectId: string,
    payload: { taskId: string; title: string; description: string },
    meta: RequestMeta
  ) => {
    const task = await repo.findTaskById(payload.taskId);
    if (!task || task.projectId !== projectId) throw new NotFoundError("Tarea no encontrada");
    if (actor.role !== "client") throw new ForbiddenError("Solo cliente solicita ajuste menor");
    const openMinor = await repo.listChangeRequestsByProject(projectId, "minor");
    if (openMinor.some((r) => r.taskId === payload.taskId && r.status === "open")) {
      throw new BadRequestError("Ya existe un ajuste menor abierto para esta tarea");
    }
    const request = await repo.createChangeRequest({
      projectId,
      taskId: payload.taskId,
      type: "minor",
      status: "open",
      requestedBySub: actor.sub,
      title: payload.title,
      description: payload.description,
      justification: null,
    });
    await repo.createChatMessage({
      projectId,
      channel: "external",
      messageType: "minor_request",
      authorSub: actor.sub,
      body: `Solicitud de ajuste menor: ${payload.title}`,
      metadata: { changeRequestId: request.id, taskId: payload.taskId },
    });
    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "minor_change_requested",
      resourceType: "project_change_request",
      resourceId: request.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Emit event
    void collabEvents.emit("change_request.minor.created", projectId, actor.sub, {
      changeRequestId: request.id,
      taskId: payload.taskId,
      taskTitle: task.title,
      requestedBySub: actor.sub,
      title: payload.title,
      description: payload.description,
    });

    return request;
  },

  createFormalChangeRequest: async (
    actor: Actor,
    projectId: string,
    payload: { taskId?: string; title: string; description: string; justification: string },
    meta: RequestMeta
  ) => {
    await assertProjectAccess(repo, actor, projectId);
    const request = await repo.createChangeRequest({
      projectId,
      taskId: payload.taskId ?? null,
      type: "formal",
      status: "open",
      requestedBySub: actor.sub,
      title: payload.title,
      description: payload.description,
      justification: payload.justification,
    });
    await repo.createChatMessage({
      projectId,
      channel: "external",
      messageType: "formal_request",
      authorSub: actor.sub,
      body: `Solicitud de cambio formal: ${payload.title}`,
      metadata: { changeRequestId: request.id },
    });
    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "formal_change_requested",
      resourceType: "project_change_request",
      resourceId: request.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Emit event
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
    const req = await repo.findChangeRequestById(changeRequestId);
    if (!req || req.projectId !== projectId) throw new NotFoundError("Solicitud no encontrada");
    const { member } = await assertProjectAccess(repo, actor, projectId);
    if (req.type === "minor") {
      const canResolveMinor =
        actor.role === "admin" || member.role === "worker" || member.role === "admin";
      if (!canResolveMinor) {
        throw new ForbiddenError("Solo worker o administrador del proyecto resuelven ajuste menor");
      }
    } else {
      // README: "Solo Admin" = rol global admin (no basta ser admin del proyecto).
      if (actor.role !== "admin") {
        throw new ForbiddenError(
          "Solo un administrador del sistema puede aprobar o rechazar un cambio formal"
        );
      }
    }
    const updated = await repo.updateChangeRequestById(changeRequestId, {
      status,
      resolvedBySub: actor.sub,
      escalatedByWorkerSub: status === "escalated" ? actor.sub : undefined,
    });
    if (!updated) throw new NotFoundError("Solicitud no encontrada");
    if (req.type === "formal" && status === "approved") {
      await repo.createBriefChangeLog({
        projectId,
        requestedBySub: req.requestedBySub,
        approvedBySub: actor.sub,
        description: req.description,
        sourceChangeRequestId: req.id,
      });
    }
    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "change_request_resolved",
      resourceType: "project_change_request",
      resourceId: req.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      details: { status, type: req.type },
    });

    // Emit resolved events
    if (req.type === "minor") {
      const eventType = 
        status === "accepted" ? "change_request.minor.accepted" : 
        status === "rejected" ? "change_request.minor.rejected" : 
        null;
      
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

  listFormalChangeLog: async (actor: Actor, projectId: string, query: { page: number; limit: number }) => {
    await assertProjectAccess(repo, actor, projectId);
    const { rows, total } = await repo.listBriefChangeLog({
      projectId,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
    
    const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);

    return {
      items: rows,
      page: query.page,
      limit: query.limit,
      total,
      total_pages: totalPages,
    };
  },

  listFiles: async (actor: Actor, projectId: string, query: { page: number; limit: number }) => {
    await assertProjectAccess(repo, actor, projectId);
    const { rows, total } = await repo.listFilesWithTaskInfo({
      projectId,
      isClientView: actor.role === "client",
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);

    return {
      items: rows,
      page: query.page,
      limit: query.limit,
      total,
      total_pages: totalPages,
    };
  },

  uploadFileMetadata: async (
    actor: Actor,
    projectId: string,
    payload: {
      fileName: string;
      title?: string;
      description?: string | null;
      storagePath: string;
      mimeType: string;
      sizeBytes: number;
      folder: "mockups" | "final_arts" | "briefs" | "contracts" | "shared_deliverables";
      isClientVisible: boolean;
      origin: "internal_chat" | "external_chat" | "manual_upload";
    },
    meta: RequestMeta
  ) => {
    const { member } = await assertProjectAccess(repo, actor, projectId);
    if (actor.role === "client" && payload.origin === "internal_chat") {
      throw new ForbiddenError("Cliente no puede subir archivos internos");
    }
    if (payload.origin === "internal_chat" && !canInternalChat(actor.role, member?.role)) {
      throw new ForbiddenError("No autorizado para archivos internos");
    }
    const fileName = sanitizeFileName(payload.fileName);
    assertAllowedUploadMime(payload.mimeType, fileName);
    await assertOciObjectRegistered(projectId, payload.storagePath);
    const latest = await repo.findLatestVersion(projectId, fileName);
    const row = await repo.createFile({
      projectId,
      title: payload.title ?? null,
      description: payload.description ?? null,
      origin: payload.origin,
      folder: payload.folder,
      fileName,
      storagePath: payload.storagePath,
      mimeType: payload.mimeType,
      sizeBytes: payload.sizeBytes,
      version: (latest?.version ?? 0) + 1,
      isActive: true,
      isClientVisible: payload.isClientVisible,
      createdBySub: actor.sub,
      createdByEmail: actor.email,
    });
    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "project_file_uploaded",
      resourceType: "project_file",
      resourceId: row.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      details: { folder: row.folder, version: row.version },
    });
    return row;
  },

  approveFile: async (actor: Actor, fileId: string, approve: boolean, meta: RequestMeta) => {
    if (!approve) throw new BadRequestError("Solo se permite aprobación positiva");
    if (actor.role !== "admin") throw new ForbiddenError("Solo admin marca archivo aprobado");
    const file = await repo.findFileById(fileId);
    if (!file) throw new NotFoundError("Archivo no encontrado");
    const updated = await repo.markFileApproved(fileId, actor.sub);
    if (!updated) throw new NotFoundError("Archivo no encontrado");
    await repo.updateProjectById(file.projectId, { latestApprovedFileId: fileId });
    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "project_file_approved",
      resourceType: "project_file",
      resourceId: fileId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Emit event
    void collabEvents.emit("file.approved", file.projectId, actor.sub, {
      fileId: file.id,
      fileName: file.fileName,
      folder: file.folder,
      approvedBySub: actor.sub,
    });

    return updated;
  },

  getBrief: async (actor: Actor, projectId: string) => {
    await assertProjectAccess(repo, actor, projectId);
    await repo.touchProjectMemberActivity(projectId, actor.sub);
    const brief = await repo.getBriefByProject(projectId);
    if (!brief) throw new NotFoundError("Brief no encontrado");
    return brief;
  },

  patchBrief: async (actor: Actor, projectId: string, body: string, meta: RequestMeta) => {
    const { member } = await assertProjectAccess(repo, actor, projectId);
    if (actor.role !== "admin") throw new ForbiddenError("Solo admin edita brief");
    if (!canManageProject(actor.role, member?.role)) throw new ForbiddenError("Solo admin edita brief");
    const brief = await repo.upsertBrief({ projectId, content: body, updatedBySub: actor.sub });
    await repo.createBriefChangeLog({
      projectId,
      requestedBySub: actor.sub,
      approvedBySub: actor.sub,
      description: "Actualización manual del brief",
      sourceChangeRequestId: null,
    });
    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "project_brief_updated",
      resourceType: "project_brief",
      resourceId: projectId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return brief;
  },

  // ─── Asignados de tarea ─────────────────────────────────────────────────

  listTaskAssignees: async (actor: Actor, taskId: string) => {
    const task = await repo.findTaskById(taskId);
    if (!task) throw new NotFoundError("Tarea no encontrada");
    await assertProjectAccess(repo, actor, task.projectId);
    return repo.listTaskAssignees(taskId);
  },

  // ─── Comentarios de tarea ───────────────────────────────────────────────

  listTaskComments: async (actor: Actor, taskId: string) => {
    const task = await repo.findTaskById(taskId);
    if (!task) throw new NotFoundError("Tarea no encontrada");
    await assertProjectAccess(repo, actor, task.projectId);
    return repo.listTaskComments(taskId);
  },

  createTaskComment: async (
    actor: Actor,
    taskId: string,
    content: string,
    authorEmail: string,
    meta: RequestMeta
  ) => {
    const task = await repo.findTaskById(taskId);
    if (!task) throw new NotFoundError("Tarea no encontrada");
    await assertProjectAccess(repo, actor, task.projectId);
    if (actor.role === "client" && !task.isClientVisible) {
      throw new ForbiddenError("No tienes acceso a esta tarea");
    }
    const comment = await repo.createTaskComment({
      taskId,
      authorSub: actor.sub,
      authorEmail,
      content,
    });
    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "task_comment_created",
      resourceType: "project_task_comment",
      resourceId: comment.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return comment;
  },

  // ─── Archivos de tarea ──────────────────────────────────────────────────

  listTaskFiles: async (actor: Actor, taskId: string) => {
    const task = await repo.findTaskById(taskId);
    if (!task) throw new NotFoundError("Tarea no encontrada");
    await assertProjectAccess(repo, actor, task.projectId);
    return repo.listTaskFiles(taskId);
  },

  uploadTaskFileMetadata: async (
    actor: Actor,
    projectId: string,
    taskId: string,
    payload: {
      title: string;
      description: string;
      fileName: string;
      storagePath: string;
      mimeType: string;
      sizeBytes: number;
      isClientVisible: boolean;
      authorEmail: string;
    },
    meta: RequestMeta
  ) => {
    const MAX_BYTES = 25 * 1024 * 1024;
    if (payload.sizeBytes > MAX_BYTES) throw new BadRequestError("El archivo supera el límite de 25 MB");
    const { member } = await assertProjectAccess(repo, actor, projectId);
    const task = await repo.findTaskById(taskId);
    if (!task || task.projectId !== projectId) throw new NotFoundError("Tarea no encontrada");
    if (actor.role === "client" && !canInternalChat(actor.role, member?.role)) {
      if (!task.isClientVisible) throw new ForbiddenError("No tienes acceso a esta tarea");
    }
    const fileName = sanitizeFileName(payload.fileName);
    assertAllowedUploadMime(payload.mimeType, fileName);
    await assertOciObjectRegistered(projectId, payload.storagePath, taskId);
    const file = await repo.createFileForTask({
      projectId,
      taskId,
      title: payload.title,
      description: payload.description,
      origin: "manual_upload",
      folder: "shared_deliverables",
      fileName,
      storagePath: payload.storagePath,
      mimeType: payload.mimeType,
      sizeBytes: payload.sizeBytes,
      isClientVisible: payload.isClientVisible,
      isActive: true,
      approvedByClient: false,
      version: 1,
      createdBySub: actor.sub,
      createdByEmail: payload.authorEmail,
    });
    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "task_file_uploaded",
      resourceType: "project_file",
      resourceId: file.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      details: { taskId, fileName: payload.fileName, sizeBytes: payload.sizeBytes },
    });
    return file;
  },


  listFilesWithTaskInfo: async (actor: Actor, projectId: string) => {
    await assertProjectAccess(repo, actor, projectId);
    return repo.listFilesWithTaskInfo({
      projectId,
      isClientView: actor.role === "client",
      limit: 1000,
      offset: 0,
    });
  },

  listProjectTimeline: async (actor: Actor, projectId: string) => {
    await assertProjectAccess(repo, actor, projectId);
    return repo.listProjectTimeline(projectId, actor.role === "client");
  },

  getFileAccess: async (actor: Actor, fileId: string, forceDownload: boolean) => {
    const file = await repo.findFileById(fileId);
    if (!file) throw new NotFoundError("Archivo no encontrado");
    await assertProjectAccess(repo, actor, file.projectId);
    if (actor.role === "client" && !file.isClientVisible) {
      throw new ForbiddenError("No tienes permiso para descargar este archivo");
    }
    if (isCollabManagedStoragePath(file.storagePath)) {
      const url = await ociStorage.createPresignedDownloadUrl(file.storagePath, file.mimeType, {
        forceDownload,
        fileName: file.fileName,
      });
      return { file, url, expiresInSeconds: 300 };
    }

    const access = await getMediaDocumentAccessUrl(actor, file.storagePath, forceDownload);
    return { file, ...access };
  },

  deleteFile: async (actor: Actor, fileId: string, meta: RequestMeta) => {
    const file = await repo.findFileById(fileId);
    if (!file) throw new NotFoundError("Archivo no encontrado");
    await assertProjectAccess(repo, actor, file.projectId);
    if (actor.role !== "admin" && file.createdBySub !== actor.sub) {
      throw new ForbiddenError("Solo el creador o un admin puede eliminar el archivo");
    }
    if (isCollabManagedStoragePath(file.storagePath)) {
      await ociStorage.deleteObject(file.storagePath);
    } else {
      await deleteDocumentInMedia(actor, file.storagePath);
    }
    await repo.deleteFileById(fileId);
    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "task_file_deleted",
      resourceType: "project_file",
      resourceId: fileId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      details: { fileName: file.fileName, storagePath: file.storagePath },
    });
    return { deleted: true };
  },

  updateProjectFile: async (
    actor: Actor,
    fileId: string,
    patch: { title?: string; description?: string | null; taskId?: string | null; isClientVisible?: boolean },
    meta: RequestMeta
  ) => {
    const file = await repo.findFileById(fileId);
    if (!file) throw new NotFoundError("Archivo no encontrado");
    const { member } = await assertProjectAccess(repo, actor, file.projectId);
    if (!canMoveTasks(actor.role, member?.role)) throw new ForbiddenError("No autorizado para editar archivos");

    let taskId = patch.taskId;
    if (patch.taskId) {
      const task = await repo.findTaskById(patch.taskId);
      if (!task || task.projectId !== file.projectId) throw new BadRequestError("La tarea no pertenece al proyecto");
      taskId = task.id;
    }

    const updated = await repo.updateFileById(fileId, {
      title: patch.title,
      description: patch.description,
      taskId,
      isClientVisible: patch.isClientVisible,
    });
    if (!updated) throw new NotFoundError("Archivo no encontrado");

    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "project_file_updated",
      resourceType: "project_file",
      resourceId: fileId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      details: { taskId: taskId ?? null },
    });
    return updated;
  },

  // ─── Pre-Signed URL Upload Flow ─────────────────────────────────────────────

  /**
   * Genera una URL prefirmada de escritura OCI para archivos de proyecto.
   * El frontend sube directamente a OCI; luego llama POST /projects/:id/files
   * (uploadFileMetadata) para registrar el archivo en DB.
   */
  generateProjectFileUploadUrl: async (
    actor: Actor,
    projectId: string,
    payload: { fileName: string; mimeType: string; sizeBytes: number }
  ) => {
    await assertProjectAccess(repo, actor, projectId);
    assertAllowedUploadMime(payload.mimeType, payload.fileName);
    const key = `projects/${projectId}/${uuidv4()}-${sanitizeFileName(payload.fileName)}`;
    const uploadUrl = await ociStorage.createPresignedUploadUrl(key, payload.mimeType, 300);
    return { uploadUrl, objectKey: key, expiresInSeconds: 300 };
  },

  /**
   * Genera una URL prefirmada de escritura OCI para archivos de tarea.
   * El frontend sube directamente a OCI; luego llama
   * POST /projects/:id/tasks/:taskId/files/metadata para registrar en DB.
   */
  generateTaskFileUploadUrl: async (
    actor: Actor,
    projectId: string,
    taskId: string,
    payload: { fileName: string; mimeType: string; sizeBytes: number }
  ) => {
    const { member } = await assertProjectAccess(repo, actor, projectId);
    const task = await repo.findTaskById(taskId);
    if (!task || task.projectId !== projectId) throw new NotFoundError("Tarea no encontrada");
    if (actor.role === "client" && !canInternalChat(actor.role, member?.role)) {
      if (!task.isClientVisible) throw new ForbiddenError("No tienes acceso a esta tarea");
    }
    assertAllowedUploadMime(payload.mimeType, payload.fileName);
    const key = `projects/${projectId}/tasks/${taskId}/${uuidv4()}-${sanitizeFileName(payload.fileName)}`;
    const uploadUrl = await ociStorage.createPresignedUploadUrl(key, payload.mimeType, 300);
    return { uploadUrl, objectKey: key, expiresInSeconds: 300 };
  },

  /**
   * Elimina un objeto subido a OCI que aún no tiene fila en `project_files`
   * (compensación si falla el paso de metadata tras el PUT prefirmado).
   */
  abortUnregisteredFileUpload: async (actor: Actor, projectId: string, objectKey: string) => {
    await assertProjectAccess(repo, actor, projectId);
    const prefix = `projects/${projectId}/`;
    if (!objectKey.startsWith(prefix)) {
      throw new ForbiddenError("La clave de almacenamiento no pertenece a este proyecto");
    }
    const existing = await repo.findFileByStoragePath(objectKey);
    if (existing) {
      throw new BadRequestError("El archivo ya está registrado");
    }
    if (await ociStorage.headObject(objectKey)) {
      await ociStorage.deleteObject(objectKey);
    }
    return { deleted: true as const };
  },

  /** Usado por mod-media para validar acceso a `storage_path` registrado en proyecto. */
  assertStoragePathAccess: async (actor: Actor, storagePath: string) => {
    const file = await repo.findFileByStoragePath(storagePath);
    if (!file) {
      throw new NotFoundError("Archivo no registrado en colaboración");
    }
    await assertProjectAccess(repo, actor, file.projectId);
    if (actor.role === "client" && !file.isClientVisible) {
      throw new ForbiddenError("No tienes permiso para este archivo");
    }
  },
});

export type CollabService = ReturnType<typeof createCollabService>;
