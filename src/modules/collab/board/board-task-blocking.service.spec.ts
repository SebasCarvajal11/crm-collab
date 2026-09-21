import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockUpdateTaskById,
  mockFindTaskById,
  mockFindTaskColumnByKey,
  mockFindTaskColumnById,
  mockListTaskAssignees,
  mockCreateTaskComment,
  mockCreateAuditLog,
  mockEmit,
} = vi.hoisted(() => ({
  mockUpdateTaskById: vi.fn(),
  mockFindTaskById: vi.fn(),
  mockFindTaskColumnByKey: vi.fn(),
  mockFindTaskColumnById: vi.fn(),
  mockListTaskAssignees: vi.fn(),
  mockCreateTaskComment: vi.fn(),
  mockCreateAuditLog: vi.fn(),
  mockEmit: vi.fn(),
}));

vi.mock("../../../db/connection", () => ({
  db: {
    transaction: vi.fn(async (cb) => cb({})),
  },
}));

vi.mock("../events", () => ({
  collabEvents: { emit: mockEmit },
}));

vi.mock("./board.repository", () => ({
  createBoardRepository: () => ({
    findTaskById: mockFindTaskById,
    updateTaskById: mockUpdateTaskById,
    findTaskColumnByKey: mockFindTaskColumnByKey,
    findTaskColumnById: mockFindTaskColumnById,
    listTaskAssignees: mockListTaskAssignees,
    createTaskComment: mockCreateTaskComment,
  }),
}));

vi.mock("../repository/audit.repository", () => ({
  createAuditRepository: () => ({
    createAuditLog: mockCreateAuditLog,
  }),
}));

vi.mock("../project/project.repository", () => ({
  createProjectRepository: () => ({
    updateProject: vi.fn(),
  }),
}));

vi.mock("../application/project-summary-sync", () => ({
  syncProjectSummary: vi.fn(),
}));

import { createBoardTaskBlockingService } from "./board-task-blocking.service";

describe("BoardTaskBlockingService", () => {
  const projectRepo = {
    findProjectById: vi.fn().mockResolvedValue({ id: "p-1" }),
  } as any;
  const memberRepo = {
    findProjectMember: vi.fn(),
    listProjectMembers: vi.fn().mockResolvedValue([]),
  } as any;
  const boardRepo = {
    findTaskById: mockFindTaskById,
    findTaskColumnByKey: mockFindTaskColumnByKey,
    findTaskColumnById: mockFindTaskColumnById,
    listTaskAssignees: mockListTaskAssignees,
  } as any;

  const meta = { ipAddress: "127.0.0.1", userAgent: "vitest" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("permite a un trabajador bloquear una tarea con motivo obligatorio", async () => {
    const actor = { sub: "w-1", userId: "w-1", role: "worker" as const, email: "w@c.dev" };
    mockFindTaskById.mockResolvedValue({
      id: "t-1",
      projectId: "p-1",
      columnId: "col-doing",
      title: "Desarrollo de API",
      isClientVisible: true,
      assigneeSub: "w-1",
    });
    mockFindTaskColumnByKey.mockResolvedValue({ id: "col-blocked", key: "blocked" });
    mockFindTaskColumnById.mockResolvedValue({ id: "col-doing", key: "doing" });
    mockListTaskAssignees.mockResolvedValue([{ userSub: "w-1" }]);
    mockUpdateTaskById.mockResolvedValue({ id: "t-1", columnId: "col-blocked" });

    memberRepo.findProjectMember.mockResolvedValue({ role: "worker", userSub: "w-1" });

    const service = createBoardTaskBlockingService(boardRepo, projectRepo, memberRepo);
    await service.blockTask(actor, "t-1", { reason: "Falta acceso a servidor VPN" }, meta);

    expect(mockUpdateTaskById).toHaveBeenCalledWith(
      "t-1",
      expect.objectContaining({
        columnId: "col-blocked",
        blockReason: "Falta acceso a servidor VPN",
        blockType: "internal_impediment",
        blockedBySub: "w-1",
      }),
    );
    expect(mockEmit).toHaveBeenCalledWith(
      "task.blocked",
      "p-1",
      "w-1",
      expect.objectContaining({
        taskId: "t-1",
        blockReason: "Falta acceso a servidor VPN",
        blockType: "internal_impediment",
      }),
      expect.anything(),
    );
  });

  it("prohíbe al cliente bloquear una tarea directamente", async () => {
    const clientActor = { sub: "c-1", userId: "c-1", role: "client" as const, email: "c@c.dev" };
    mockFindTaskById.mockResolvedValue({
      id: "t-1",
      projectId: "p-1",
      columnId: "col-doing",
      isClientVisible: true,
    });
    memberRepo.findProjectMember.mockResolvedValue({ role: "client", userSub: "c-1" });

    const service = createBoardTaskBlockingService(boardRepo, projectRepo, memberRepo);
    await expect(
      service.blockTask(clientActor, "t-1", { reason: "No me gusta" }, meta),
    ).rejects.toThrow("No tienes permisos para bloquear tareas");
  });

  it("prohíbe al trabajador desbloquear si el bloqueo fue por timeout de cliente", async () => {
    const actor = { sub: "w-1", userId: "w-1", role: "worker" as const, email: "w@c.dev" };
    mockFindTaskById.mockResolvedValue({
      id: "t-1",
      projectId: "p-1",
      columnId: "col-blocked",
      blockType: "client_timeout",
      assigneeSub: "w-1",
    });
    memberRepo.findProjectMember.mockResolvedValue({ role: "worker", userSub: "w-1" });
    mockListTaskAssignees.mockResolvedValue([{ userSub: "w-1" }]);

    const service = createBoardTaskBlockingService(boardRepo, projectRepo, memberRepo);
    await expect(
      service.unblockTask(actor, "t-1", {}, meta),
    ).rejects.toThrow("No tienes permisos para desbloquear esta tarea");
  });

  it("permite al cliente desbloquear una tarea bloqueada por timeout de cliente", async () => {
    const clientActor = { sub: "c-1", userId: "c-1", role: "client" as const, email: "c@c.dev" };
    mockFindTaskById.mockResolvedValue({
      id: "t-1",
      projectId: "p-1",
      columnId: "col-blocked",
      title: "Revisión Final",
      blockType: "client_timeout",
      isClientVisible: true,
    });
    memberRepo.findProjectMember.mockResolvedValue({ role: "client", userSub: "c-1" });
    mockListTaskAssignees.mockResolvedValue([]);
    mockFindTaskColumnByKey.mockResolvedValue({ id: "col-doing", key: "doing" });
    mockUpdateTaskById.mockResolvedValue({ id: "t-1", columnId: "col-doing" });

    const service = createBoardTaskBlockingService(boardRepo, projectRepo, memberRepo);
    await service.unblockTask(
      clientActor,
      "t-1",
      { resolutionComment: "Aprobación concedida con observaciones mínimas" },
      meta,
    );

    expect(mockUpdateTaskById).toHaveBeenCalledWith(
      "t-1",
      expect.objectContaining({
        columnId: "col-doing",
        blockReason: null,
        blockType: null,
        blockedAt: null,
        blockedBySub: null,
      }),
    );
    expect(mockEmit).toHaveBeenCalledWith(
      "task.unblocked",
      "p-1",
      "c-1",
      expect.objectContaining({ taskId: "t-1", targetColumnKey: "doing" }),
      expect.anything(),
    );
  });
});
