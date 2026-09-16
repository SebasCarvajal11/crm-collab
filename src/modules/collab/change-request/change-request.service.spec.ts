import { describe, expect, it, vi } from "vitest";

vi.mock("../../../db/connection", () => ({
  db: {
    transaction: vi.fn(async (cb) => cb({})),
  },
}));
vi.mock("../events", () => ({ collabEvents: { emit: vi.fn() } }));
vi.mock("../board/board.repository", () => ({
  createBoardRepository: () => ({
    listTasksByProject: vi.fn().mockResolvedValue({ rows: [{ id: "task-1", title: "Task 1" }] }),
    findTaskById: vi.fn().mockResolvedValue({ id: "task-1", projectId: "p-1", title: "Task 1" }),
  }),
}));
vi.mock("../chat/chat.repository", () => ({
  createChatRepository: () => ({
    createChatMessage: vi.fn().mockResolvedValue({ id: "msg-1" }),
  }),
}));
vi.mock("./change-request.repository", () => ({
  createChangeRequestRepository: () => ({
    createChangeRequest: vi.fn().mockResolvedValue({ id: "cr-1", title: "Cambio Test" }),
    findChangeRequestById: vi.fn().mockResolvedValue({ id: "cr-1", projectId: "p-1", title: "Cambio Test", type: "formal", requestedBySub: "client-sub" }),
    listChangeRequestsByProject: vi.fn().mockResolvedValue([]),
    updateChangeRequestById: vi.fn().mockResolvedValue({ id: "cr-1", status: "rejected" }),
  }),
}));
vi.mock("../brief/brief.repository", () => ({
  createBriefRepository: () => ({
    createBriefChangeLog: vi.fn().mockResolvedValue({}),
    listBriefChangeLog: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
  }),
}));
vi.mock("../repository/audit.repository", () => ({
  createAuditRepository: () => ({
    createAuditLog: vi.fn().mockResolvedValue({}),
  }),
}));

import { createChangeRequestService } from "./change-request.service";

describe("ChangeRequestService", () => {
  const projectRepo = { findProjectById: vi.fn().mockResolvedValue({ id: "p-1" }) };
  const memberRepo = {
    findProjectMember: vi.fn().mockResolvedValue({ role: "worker", userSub: "worker-sub" }),
    listProjectMembers: vi.fn().mockResolvedValue([]),
  };
  const changeRequestRepo = {
    findChangeRequestById: vi.fn().mockResolvedValue({
      id: "cr-1",
      projectId: "p-1",
      title: "Test",
      type: "formal",
      requestedBySub: "client-sub",
    }),
    listChangeRequestsByProject: vi.fn().mockResolvedValue([]),
    updateChangeRequestById: vi.fn().mockResolvedValue({ id: "cr-1" }),
    createChangeRequest: vi.fn().mockResolvedValue({ id: "cr-1" }),
  };

  const service = createChangeRequestService(
    changeRequestRepo as any,
    projectRepo as any,
    memberRepo as any,
    {} as any,
    {} as any
  );

  it("throws ForbiddenError when non-client tries to create minor change request", async () => {
    await expect(
      service.createMinorChangeRequest(
        { sub: "worker-sub", userId: "worker-sub", role: "worker", email: "worker@cima.com" },
        "p-1",
        { description: "ajuste" },
        { ipAddress: "127.0.0.1", userAgent: "vitest" }
      )
    ).rejects.toThrow("Solo el cliente puede solicitar cambios");
  });

  it("throws ForbiddenError when non-client tries to create formal change request", async () => {
    await expect(
      service.createFormalChangeRequest(
        { sub: "worker-sub", userId: "worker-sub", role: "worker", email: "worker@cima.com" },
        "p-1",
        { description: "formal", title: "Cambio" },
        { ipAddress: "127.0.0.1", userAgent: "vitest" }
      )
    ).rejects.toThrow("Solo el cliente puede solicitar cambios");
  });

  it("throws ForbiddenError when worker tries to resolve change request", async () => {
    await expect(
      service.resolveChangeRequest(
        { sub: "worker-sub", userId: "worker-sub", role: "worker", email: "worker@cima.com" },
        "p-1",
        "cr-1",
        "rejected",
        "Motivo rechazo",
        { ipAddress: "127.0.0.1", userAgent: "vitest" }
      )
    ).rejects.toThrow("Solo un administrador puede aceptar o rechazar solicitudes de cambio");
  });

  it("allows admin to resolve change request with a comment", async () => {
    const result = await service.resolveChangeRequest(
      { sub: "admin-sub", userId: "admin-sub", role: "admin", email: "admin@cima.com" },
      "p-1",
      "cr-1",
      "rejected",
      "No viable técnicamente",
      { ipAddress: "127.0.0.1", userAgent: "vitest" }
    );
    expect(result).toBeDefined();
  });

  it("throws ForbiddenError when non-admin calls listPendingChangeRequests", async () => {
    await expect(
      service.listPendingChangeRequests({
        sub: "worker-sub",
        userId: "worker-sub",
        role: "worker",
        email: "worker@cima.com",
      })
    ).rejects.toThrow("Solo los administradores pueden consultar las solicitudes pendientes globales");
  });

  it("allows admin to list pending change requests", async () => {
    (changeRequestRepo as any).listPendingChangeRequestsForAdmin = vi.fn().mockResolvedValue([
      { id: "cr-pending-1", title: "Cambio pendiente", projectName: "Proyecto 1" },
    ]);
    const result = await service.listPendingChangeRequests({
      sub: "admin-sub",
      userId: "admin-sub",
      role: "admin",
      email: "admin@cima.com",
    });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Cambio pendiente");
  });
});
