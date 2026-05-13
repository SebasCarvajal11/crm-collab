import type { CollabRepository } from "./collab.repository";
import type { GlobalRole, ProjectMemberRole, ProjectType } from "./collab.types";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../shared/middlewares/error-handler.middleware";
import { collabEvents } from "./events";
import { ociStorage } from "../../shared/storage/oci-storage";
import { fetchUserProfiles } from "../../shared/auth-client";

type Actor = { sub: string; role: GlobalRole; email: string };
type RequestMeta = { ipAddress: string; userAgent: string };

const canManageProject = (globalRole: GlobalRole, memberRole?: ProjectMemberRole) =>
  globalRole === "admin" || memberRole === "admin";
const canMoveTasks = (globalRole: GlobalRole, memberRole?: ProjectMemberRole) =>
  globalRole === "admin" || memberRole === "admin" || memberRole === "worker";
const canInternalChat = (globalRole: GlobalRole, memberRole?: ProjectMemberRole) =>
  globalRole === "admin" || memberRole === "admin" || memberRole === "worker";
const canReceiveMentionInChannel = (channel: "internal" | "external", memberRole: ProjectMemberRole) =>
  channel === "internal" ? memberRole === "admin" || memberRole === "worker" : true;

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

const assertProjectAccess = async (repo: CollabRepository, actor: Actor, projectId: string) => {
  const project = await repo.findProjectById(projectId);
  if (!project) throw new NotFoundError("Proyecto no encontrado");
  if (actor.role === "admin") return { project, member: null };
  const member = await repo.findProjectMember(projectId, actor.sub);
  if (!member) throw new ForbiddenError("No eres miembro del proyecto");
  return { project, member };
};

const refreshParentProgress = async (repo: CollabRepository, projectId: string) => {
  const project = await repo.findProjectById(projectId);
  if (!project) return;
  const agg = await repo.getProjectProgressAggregate(projectId);
  if (!agg || !agg.total) {
    await repo.updateProjectById(projectId, { status: "todo", progressPercent: 0 });
    return;
  }
  const total = Number(agg.total ?? 0);
  const doneCount = Number(agg.doneCount ?? 0);
  const reviewCount = Number(agg.reviewCount ?? 0);
  const nonPendingCount = Number(agg.nonPendingCount ?? 0);
  const progressAvg = Number(agg.progressAvg ?? 0);
  const isCompleted = doneCount === total;
  const isReview = reviewCount > 0;
  const isInProgress = nonPendingCount > 0;
  const nextStatus: "todo" | "in_progress" | "in_review" | "completed" = isCompleted
    ? "completed"
    : isReview
      ? "in_review"
      : isInProgress
        ? "in_progress"
        : "todo";
  await repo.updateProjectById(projectId, {
    status: nextStatus,
    progressPercent: progressAvg,
  });
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
  members: Array<{
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
  const profileMap = await fetchUserProfiles(userSubs, actor);

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
    await repo.syncAllProjectsStatusAndProgress();
    const rows = await repo.listProjectsForUser({
      userSub: actor.sub,
      isAdminGlobal: actor.role === "admin",
      type: query.type,
      status: query.status,
      adminResponsibleSub: query.adminSub,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });
    if (query.clientName) {
      const needle = query.clientName.trim().toLowerCase();
      return rows.filter((p) => p.clientName.toLowerCase().includes(needle));
    }
    return rows;
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
    const project = await repo.createProject({
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
    await repo.createProjectMember({
      projectId: project.id,
      userSub: actor.sub,
      role: "admin",
      userEmail: actor.email,
    });
    const uniqueWorkerSubs = [...new Set(payload.workerSubs)].filter((sub) => sub !== actor.sub && sub !== payload.clientSub);
    for (const workerSub of uniqueWorkerSubs) {
      await repo.upsertProjectMember({ projectId: project.id, userSub: workerSub, role: "worker", userEmail: null });
    }
    if (payload.clientSub) {
      await repo.upsertProjectMember({ projectId: project.id, userSub: payload.clientSub, role: "client", userEmail: null });
    }
    for (const c of defaultColumnsByType(payload.type)) {
      await repo.createTaskColumn({
        projectId: project.id,
        key: c.key as never,
        title: c.title,
        position: c.position,
        isClientVisible: c.isClientVisible,
        isDefault: true,
      });
    }
    await repo.createBrief({ projectId: project.id, content: payload.brief, updatedBySub: actor.sub });
    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "project_created",
      resourceType: "project",
      resourceId: project.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      details: { type: project.type, client: project.clientName },
    });

    // Emit event
    await collabEvents.emit("project.created", project.id, actor.sub, {
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
      repo.listTasksByProject(projectId),
      repo.getBriefByProject(projectId),
      repo.listChangeRequestsByProject(projectId, "formal"),
      repo.listTaskAssigneesByProject(projectId),
    ]);

    const enrichedMembers = await enrichProjectMembersWithProfiles(members, actor, assignees, tasks);

    const isClient = actor.role === "client";
    const visibleColumns = isClient ? columns.filter((c) => c.isClientVisible) : columns;
    const visibleTasks = isClient ? tasks.filter((t) => t.isClientVisible) : tasks;

    return { project, members: enrichedMembers, board: { columns: visibleColumns, tasks: visibleTasks }, brief, formalChanges };
  },

  getProjectBoard: async (actor: Actor, projectId: string) => {
    const { project } = await assertProjectAccess(repo, actor, projectId);
    await repo.touchProjectMemberActivity(projectId, actor.sub);
    const [members, columns, tasks, assignees] = await Promise.all([
      repo.listProjectMembers(projectId),
      repo.listTaskColumnsByProject(projectId),
      repo.listTasksByProject(projectId),
      repo.listTaskAssigneesByProject(projectId),
    ]);

    const { assigneeEmailBySub, taskCountBySub } = buildMemberAssignmentMaps(assignees, tasks);

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
    const visibleTasks = isClient ? tasks.filter((t) => t.isClientVisible) : tasks;

    return { project, members: lightweightMembers, board: { columns: visibleColumns, tasks: visibleTasks } };
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
      repo.listTasksByProject(projectId),
    ]);
    return enrichProjectMembersWithProfiles(members, actor, assignees, tasks);
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
      assignees?: { userSub: string; userEmail: string }[];
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

    let calculatedProgress = payload.checklistProgress;
    if (payload.subtasks && payload.subtasks.length > 0) {
      const completed = payload.subtasks.filter((s) => s.isCompleted).length;
      calculatedProgress = Math.round((completed / payload.subtasks.length) * 100);
    }

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
      subtasks: payload.subtasks ?? [],
      blockedByTaskId: payload.blockedByTaskId ?? null,
      isClientVisible: payload.clientVisible,
      position: payload.position,
    });
    if (payload.assignees?.length) {
      await repo.upsertTaskAssignees(task.id, payload.assignees);
    }
    await refreshParentProgress(repo, projectId);
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

  listTasksByProject: async (actor: Actor, projectId: string) => {
    await assertProjectAccess(repo, actor, projectId);
    const tasks = await repo.listTasksByProject(projectId);
    return actor.role === "client" ? tasks.filter((t) => t.isClientVisible) : tasks;
  },

  updateTask: async (
    actor: Actor,
    taskId: string,
    patch: {
      columnId?: string;
      title?: string;
      description?: string | null;
      priority?: "low" | "medium" | "high" | "urgent";
      assignees?: { userSub: string; userEmail: string }[];
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
    if (patch.columnId) {
      const column = await repo.findTaskColumnById(patch.columnId);
      if (!column || column.projectId !== task.projectId) throw new BadRequestError("Columna destino inválida");
      if (actor.role === "client") throw new ForbiddenError("Cliente no puede mover tareas");
    }
    const primaryAssigneeSub = patch.assignees !== undefined
      ? (patch.assignees[0]?.userSub ?? null)
      : undefined;

    let calculatedProgress = patch.checklistProgress;
    if (patch.subtasks !== undefined) {
      if (patch.subtasks.length > 0) {
        const completed = patch.subtasks.filter((s) => s.isCompleted).length;
        calculatedProgress = Math.round((completed / patch.subtasks.length) * 100);
      } else {
        calculatedProgress = 0;
      }
    }

    const updated = await repo.updateTaskById(taskId, {
      columnId: patch.columnId,
      title: patch.title,
      description: patch.description,
      priority: patch.priority,
      assigneeSub: primaryAssigneeSub,
      deadline: patch.dueDate,
      checklistProgress: calculatedProgress,
      subtasks: patch.subtasks,
      blockedByTaskId: patch.blockedByTaskId,
      isClientVisible: patch.clientVisible,
      position: patch.position,
    });
    if (!updated) throw new NotFoundError("Tarea no encontrada");
    if (patch.assignees !== undefined) {
      await repo.upsertTaskAssignees(taskId, patch.assignees);
    }
    await refreshParentProgress(repo, task.projectId);
    await repo.createAuditLog({
      actorSub: actor.sub,
      action: "project_task_updated",
      resourceType: "project_task",
      resourceId: taskId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    // Emit task moved event if column changed
    if (patch.columnId && patch.columnId !== task.columnId) {
      const oldColumn = await repo.findTaskColumnById(task.columnId);
      const newColumn = await repo.findTaskColumnById(patch.columnId);
      if (oldColumn && newColumn) {
        await collabEvents.emit("task.moved", task.projectId, actor.sub, {
          taskId: task.id,
          taskTitle: updated.title,
          fromColumnKey: oldColumn.key,
          toColumnKey: newColumn.key,
          assigneeSub: updated.assigneeSub ?? undefined,
        });
      }
    }

    // Emit task assigned event if assignees changed
    if (patch.assignees !== undefined) {
      const newPrimary = patch.assignees[0]?.userSub;
      if (newPrimary && newPrimary !== task.assigneeSub) {
        await collabEvents.emit("task.assigned", task.projectId, actor.sub, {
          taskId: task.id,
          taskTitle: updated.title,
          assigneeSub: newPrimary,
          previousAssigneeSub: task.assigneeSub ?? undefined,
        });
      }
    }

    return updated;
  },

  listChatMessages: async (actor: Actor, projectId: string, channel: "internal" | "external") => {
    const { member } = await assertProjectAccess(repo, actor, projectId);
    await repo.touchProjectMemberActivity(projectId, actor.sub);
    if (channel === "internal" && !canInternalChat(actor.role, member?.role)) {
      throw new ForbiddenError("No tienes acceso al chat interno");
    }
    const [messages, members] = await Promise.all([
      repo.listChatMessagesByChannel(projectId, channel),
      repo.listProjectMembers(projectId),
    ]);
    const reads = await repo.listChatReadsByMessages(messages.map((m) => m.id));
    const readersByMessage = new Map<string, Set<string>>();
    for (const read of reads) {
      if (!readersByMessage.has(read.messageId)) readersByMessage.set(read.messageId, new Set());
      readersByMessage.get(read.messageId)!.add(read.userSub);
    }
    const memberSubs = new Set(members.map((m) => m.userSub));
    const memberBySub = new Map(members.map((m) => [m.userSub, m]));

    return messages.map((msg) => {
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
      mentionedSubs: mentionSubs,
    });
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
    await collabEvents.emit(eventType, projectId, actor.sub, {
      messageId: row.id,
      channel,
      body,
    });

    // Emit mention events if any
    if (mentionSubs.length > 0) {
      await collabEvents.emit("chat.mention", projectId, actor.sub, {
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
      const messages = await repo.listChatMessagesByChannel(projectId, channel);
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
    const profileMap = await fetchUserProfiles(authorSubs, actor);
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
    await collabEvents.emit("change_request.minor.created", projectId, actor.sub, {
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
    await collabEvents.emit("change_request.formal.created", projectId, actor.sub, {
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
      const canResolveMinor = actor.role === "admin" || member?.role === "worker" || member?.role === "admin";
      if (!canResolveMinor) throw new ForbiddenError("Solo worker/admin resuelven ajuste menor");
    } else {
      const canResolveFormal = actor.role === "admin" || member?.role === "admin";
      if (!canResolveFormal) throw new ForbiddenError("Solo admin resuelve cambio formal");
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
        await collabEvents.emit(eventType, projectId, actor.sub, {
          changeRequestId: req.id,
          taskId: req.taskId!,
          status: status as "accepted" | "rejected" | "escalated",
          resolvedBySub: actor.sub,
        });
      }
    } else if (req.type === "formal" && status === "approved") {
      await collabEvents.emit("change_request.formal.approved", projectId, actor.sub, {
        changeRequestId: req.id,
        approvedBySub: actor.sub,
        title: req.title,
        affectsScope: true,
      });
    }

    return updated;
  },

  listFormalChangeLog: async (actor: Actor, projectId: string) => {
    await assertProjectAccess(repo, actor, projectId);
    return repo.listBriefChangeLog(projectId);
  },

  listFiles: async (actor: Actor, projectId: string) => {
    await assertProjectAccess(repo, actor, projectId);
    return repo.listFilesByProject(projectId, actor.role === "client");
  },

  uploadFileMetadata: async (
    actor: Actor,
    projectId: string,
    payload: {
      fileName: string;
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
    const latest = await repo.findLatestVersion(projectId, payload.fileName);
    const row = await repo.createFile({
      projectId,
      origin: payload.origin,
      folder: payload.folder,
      fileName: payload.fileName,
      storagePath: payload.storagePath,
      mimeType: payload.mimeType,
      sizeBytes: payload.sizeBytes,
      version: (latest?.version ?? 0) + 1,
      isActive: true,
      isClientVisible: payload.isClientVisible,
      createdBySub: actor.sub,
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
    await collabEvents.emit("file.approved", file.projectId, actor.sub, {
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

  uploadTaskFile: async (
    actor: Actor,
    projectId: string,
    taskId: string,
    payload: {
      title: string;
      description: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      fileBuffer: Buffer;
      isClientVisible: boolean;
      authorEmail: string;
    },
    meta: RequestMeta
  ) => {
    const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
    if (payload.sizeBytes > MAX_BYTES) throw new BadRequestError("El archivo supera el límite de 25 MB");
    const { member } = await assertProjectAccess(repo, actor, projectId);
    const task = await repo.findTaskById(taskId);
    if (!task || task.projectId !== projectId) throw new NotFoundError("Tarea no encontrada");
    if (actor.role === "client" && !canInternalChat(actor.role, member?.role)) {
      if (!task.isClientVisible) throw new ForbiddenError("No tienes acceso a esta tarea");
    }
    const storagePath = `projects/${projectId}/tasks/${taskId}/${payload.fileName}`;
    await ociStorage.uploadObject(storagePath, payload.fileBuffer, payload.mimeType);
    const file = await repo.createFileForTask({
      projectId,
      taskId,
      title: payload.title,
      description: payload.description,
      origin: "manual_upload",
      folder: "shared_deliverables",
      fileName: payload.fileName,
      storagePath,
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

  uploadProjectFile: async (
    actor: Actor,
    projectId: string,
    payload: {
      taskId: string | null;
      title: string;
      description: string | null;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      fileBuffer: Buffer;
      isClientVisible: boolean;
      channel: "internal" | "external";
      authorEmail: string;
    },
    meta: RequestMeta
  ) => {
    const MAX_BYTES = 25 * 1024 * 1024;
    if (payload.sizeBytes > MAX_BYTES) throw new BadRequestError("El archivo supera el limite de 25 MB");
    const { member } = await assertProjectAccess(repo, actor, projectId);

    if (payload.channel === "internal" && !canInternalChat(actor.role, member?.role)) {
      throw new ForbiddenError("No tienes acceso al canal interno");
    }

    let taskId: string | null = null;
    if (payload.taskId) {
      const task = await repo.findTaskById(payload.taskId);
      if (!task || task.projectId !== projectId) throw new BadRequestError("La tarea no pertenece al proyecto");
      taskId = task.id;
    }

    const storagePath = taskId
      ? `projects/${projectId}/tasks/${taskId}/${payload.fileName}`
      : `projects/${projectId}/files/${payload.fileName}`;

    await ociStorage.uploadObject(storagePath, payload.fileBuffer, payload.mimeType);

    const file = await repo.createFileForTask({
      projectId,
      taskId,
      title: payload.title,
      description: payload.description,
      origin: payload.channel === "internal" ? "internal_chat" : "external_chat",
      folder: "shared_deliverables",
      fileName: payload.fileName,
      storagePath,
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
      action: "project_file_uploaded_from_conversation",
      resourceType: "project_file",
      resourceId: file.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      details: { taskId, channel: payload.channel, fileName: payload.fileName, sizeBytes: payload.sizeBytes },
    });

    return file;
  },

  listFilesWithTaskInfo: async (actor: Actor, projectId: string) => {
    await assertProjectAccess(repo, actor, projectId);
    return repo.listFilesWithTaskInfo(projectId, actor.role === "client");
  },

  downloadTaskFile: async (actor: Actor, fileId: string) => {
    const file = await repo.findFileById(fileId);
    if (!file) throw new NotFoundError("Archivo no encontrado");
    await assertProjectAccess(repo, actor, file.projectId);
    const result = await ociStorage.downloadObject(file.storagePath);
    return { file, stream: result.Body! };
  },

  deleteFile: async (actor: Actor, fileId: string, meta: RequestMeta) => {
    const file = await repo.findFileById(fileId);
    if (!file) throw new NotFoundError("Archivo no encontrado");
    await assertProjectAccess(repo, actor, file.projectId);
    if (actor.role !== "admin" && file.createdBySub !== actor.sub) {
      throw new ForbiddenError("Solo el creador o un admin puede eliminar el archivo");
    }
    await ociStorage.deleteObject(file.storagePath);
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
});

export type CollabService = ReturnType<typeof createCollabService>;
