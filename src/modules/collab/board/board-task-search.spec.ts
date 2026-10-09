import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockSearchTasksByProject,
  mockUpdateTaskById,
  mockFindTaskById,
  mockFindTaskColumnById,
  mockListTaskAssignees,
  mockUpsertSubtasks,
  mockUpsertTaskAssignees,
  mockEmitEvent,
  mockCreateAuditLog,
  mockCreateTaskComment,
} = vi.hoisted(() => ({
  mockSearchTasksByProject: vi.fn(),
  mockUpdateTaskById: vi.fn(),
  mockFindTaskById: vi.fn(),
  mockFindTaskColumnById: vi.fn(),
  mockListTaskAssignees: vi.fn(),
  mockUpsertSubtasks: vi.fn(),
  mockUpsertTaskAssignees: vi.fn(),
  mockEmitEvent: vi.fn().mockResolvedValue(undefined),
  mockCreateAuditLog: vi.fn().mockResolvedValue({}),
  mockCreateTaskComment: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../../db/connection", () => ({
  db: {
    transaction: vi.fn(async (cb) => cb({ execute: vi.fn().mockResolvedValue({ rows: [] }) })),
  },
}));
vi.mock("../events", () => ({ collabEvents: { emit: (...args: unknown[]) => mockEmitEvent(...args) } }));
vi.mock("../repository/audit.repository", () => ({
  createAuditRepository: () => ({ createAuditLog: mockCreateAuditLog }),
}));
vi.mock("./board.repository", () => ({
  createBoardRepository: () => ({
    searchTasksByProject: mockSearchTasksByProject,
    findTaskById: mockFindTaskById,
    findTaskColumnById: mockFindTaskColumnById,
    listTaskAssignees: mockListTaskAssignees,
    updateTaskById: mockUpdateTaskById,
    upsertSubtasks: mockUpsertSubtasks,
    upsertTaskAssignees: mockUpsertTaskAssignees,
    createTaskComment: mockCreateTaskComment,
  }),
}));

import { createBoardTaskService } from "./board-task.service";

describe("BoardTaskService - searchTasks and updateTask block handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const boardRepo = {
    searchTasksByProject: mockSearchTasksByProject,
    findTaskById: mockFindTaskById,
    findTaskColumnById: mockFindTaskColumnById,
    listTaskAssignees: mockListTaskAssignees,
    updateTaskById: mockUpdateTaskById,
    upsertSubtasks: mockUpsertSubtasks,
    upsertTaskAssignees: mockUpsertTaskAssignees,
  } as any;

  const projectRepo = {
    findProjectById: vi.fn().mockImplementation((id: string) =>
      id === "p-1" ? Promise.resolve({ id: "p-1", name: "Proyecto 1" }) : Promise.resolve(null)
    ),
    syncProjectStatusAndProgress: vi.fn().mockResolvedValue(undefined),
  } as any;

  const memberRepo = {
    findProjectMember: vi.fn().mockImplementation((_pId: string, sub: string) => {
      if (sub === "worker-sub") return Promise.resolve({ role: "worker", userSub: "worker-sub" });
      if (sub === "client-sub") return Promise.resolve({ role: "client", userSub: "client-sub" });
      return Promise.resolve(null);
    }),
    listProjectMembers: vi.fn().mockResolvedValue([
      { role: "worker", userSub: "worker-sub" },
    ]),
  } as any;

  const meta = { ipAddress: "127.0.0.1", userAgent: "vitest" };

  it("permite a trabajador buscar tareas y no restringe visibilidad de cliente", async () => {
    mockSearchTasksByProject.mockResolvedValueOnce([
      { id: "task-1", title: "Diseñar banners", description: "Banners campaña", subtasks: [] },
    ]);

    const service = createBoardTaskService(boardRepo, projectRepo, memberRepo);
    const workerActor = { sub: "worker-sub", userId: "worker-sub", role: "worker" as const, email: "w@c.dev" };

    const results = await service.searchTasks(workerActor, "p-1", { q: "banner", limit: 8 });

    expect(mockSearchTasksByProject).toHaveBeenCalledWith({
      projectId: "p-1",
      q: "banner",
      limit: 8,
      isClientVisible: undefined,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("Diseñar banners");
  });

  it("permite a cliente buscar tareas filtrando solo las visibles para cliente", async () => {
    mockSearchTasksByProject.mockResolvedValueOnce([]);

    const service = createBoardTaskService(boardRepo, projectRepo, memberRepo);
    const clientActor = { sub: "client-sub", userId: "client-sub", role: "client" as const, email: "c@c.dev" };

    await service.searchTasks(clientActor, "p-1", { q: "banner", limit: 5 });

    expect(mockSearchTasksByProject).toHaveBeenCalledWith({
      projectId: "p-1",
      q: "banner",
      limit: 5,
      isClientVisible: true,
    });
  });

  it("rechaza la búsqueda si el usuario no es miembro del proyecto", async () => {
    const service = createBoardTaskService(boardRepo, projectRepo, memberRepo);
    const strangerActor = { sub: "stranger-sub", userId: "stranger", role: "worker" as const, email: "s@c.dev" };

    await expect(service.searchTasks(strangerActor, "p-1", { q: "test", limit: 8 })).rejects.toThrow(
      "No eres miembro del proyecto"
    );
  });

  it("rechaza la búsqueda si el proyecto no existe", async () => {
    const service = createBoardTaskService(boardRepo, projectRepo, memberRepo);
    const adminActor = { sub: "admin-sub", userId: "admin", role: "admin" as const, email: "a@c.dev" };

    await expect(service.searchTasks(adminActor, "non-existent", { q: "test", limit: 8 })).rejects.toThrow(
      "Proyecto no encontrado"
    );
  });

  it("actualiza tarea hacia columna bloqueada preservando blockReason y blockType y emite evento correcto", async () => {
    mockFindTaskById.mockResolvedValue({
      id: "task-1",
      projectId: "p-1",
      columnId: "col-doing",
      title: "Tarea en progreso",
      assigneeSub: "worker-sub",
      checklistProgress: 25,
      subtasks: [],
      isClientVisible: true,
    });
    mockFindTaskColumnById.mockImplementation((colId: string) => {
      if (colId === "col-doing") return Promise.resolve({ id: "col-doing", projectId: "p-1", key: "doing" });
      if (colId === "col-blocked") return Promise.resolve({ id: "col-blocked", projectId: "p-1", key: "blocked" });
      return Promise.resolve(null);
    });
    mockListTaskAssignees.mockResolvedValue([{ taskId: "task-1", userSub: "worker-sub" }]);
    mockUpdateTaskById.mockResolvedValue({
      id: "task-1",
      projectId: "p-1",
      columnId: "col-blocked",
      title: "Tarea bloqueada",
      blockReason: "Falta feedback del cliente",
      blockType: "client_timeout",
      isClientVisible: true,
    });

    const service = createBoardTaskService(boardRepo, projectRepo, memberRepo);
    const workerActor = { sub: "worker-sub", userId: "worker-sub", role: "worker" as const, email: "w@c.dev" };

    await service.updateTask(
      workerActor,
      "task-1",
      {
        columnId: "col-blocked",
        blockReason: "Falta feedback del cliente",
        blockType: "client_timeout",
      },
      meta
    );

    expect(mockUpdateTaskById).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        columnId: "col-blocked",
        blockReason: "Falta feedback del cliente",
        blockType: "client_timeout",
      })
    );

    expect(mockEmitEvent).toHaveBeenCalledWith(
      "task.blocked",
      "p-1",
      "worker-sub",
      expect.objectContaining({
        taskId: "task-1",
        blockReason: "Falta feedback del cliente",
        blockType: "client_timeout",
      }),
      expect.anything()
    );
    expect(mockCreateAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "project_task_blocked", resourceId: "task-1" })
    );
  });

  it("actualiza blockReason y blockType en una tarea YA bloqueada sin cambiar de columna", async () => {
    mockFindTaskById.mockResolvedValue({
      id: "task-blocked-1",
      projectId: "p-1",
      columnId: "col-blocked",
      title: "Tarea ya bloqueada",
      assigneeSub: "worker-sub",
      checklistProgress: 50,
      subtasks: [],
      isClientVisible: true,
      blockReason: "Motivo anterior",
      blockType: "internal_impediment",
    });
    mockFindTaskColumnById.mockImplementation((colId: string) => {
      if (colId === "col-blocked") return Promise.resolve({ id: "col-blocked", projectId: "p-1", key: "blocked" });
      return Promise.resolve(null);
    });
    mockListTaskAssignees.mockResolvedValue([{ taskId: "task-blocked-1", userSub: "worker-sub" }]);
    mockUpdateTaskById.mockResolvedValue({
      id: "task-blocked-1",
      projectId: "p-1",
      columnId: "col-blocked",
      title: "Tarea ya bloqueada",
      blockReason: "Nuevo motivo actualizado",
      blockType: "client_timeout",
      isClientVisible: true,
    });

    const service = createBoardTaskService(boardRepo, projectRepo, memberRepo);
    const workerActor = { sub: "worker-sub", userId: "worker-sub", role: "worker" as const, email: "w@c.dev" };

    await service.updateTask(
      workerActor,
      "task-blocked-1",
      {
        blockReason: "Nuevo motivo actualizado",
        blockType: "client_timeout",
      },
      meta
    );

    expect(mockUpdateTaskById).toHaveBeenCalledWith(
      "task-blocked-1",
      expect.objectContaining({
        blockReason: "Nuevo motivo actualizado",
        blockType: "client_timeout",
      })
    );
  });

  it("rechaza si cliente intenta modificar tareas", async () => {
    mockFindTaskById.mockResolvedValue({
      id: "task-blocked-1",
      projectId: "p-1",
      columnId: "col-blocked",
      title: "Tarea bloqueada",
      assigneeSub: "worker-sub",
      checklistProgress: 0,
      subtasks: [],
      isClientVisible: true,
    });
    mockFindTaskColumnById.mockResolvedValue({ id: "col-blocked", projectId: "p-1", key: "blocked" });

    const service = createBoardTaskService(boardRepo, projectRepo, memberRepo);
    const clientActor = { sub: "client-sub", userId: "client-sub", role: "client" as const, email: "c@c.dev" };

    await expect(
      service.updateTask(
        clientActor,
        "task-blocked-1",
        { blockReason: "Intento de cliente" },
        meta
      )
    ).rejects.toThrow("No puedes editar/mover tareas");
  });
});
