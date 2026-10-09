import { describe, expect, it, vi, beforeEach } from "vitest";

const mockClearLatestApprovedFile = vi.fn().mockResolvedValue(undefined);
const mockDeleteFileById = vi.fn().mockResolvedValue(undefined);
const mockCreateAuditLog = vi.fn().mockResolvedValue({});
const mockDeleteDocumentInMedia = vi.fn().mockResolvedValue({ deleted: true });

vi.mock("../../../db/connection", () => ({
  db: {
    transaction: vi.fn(async (cb) => cb({})),
  },
}));

vi.mock("../../../shared/media-command-client", () => ({
  getMediaDocumentAccessUrl: vi.fn(),
  deleteDocumentInMedia: (...args: unknown[]) => mockDeleteDocumentInMedia(...args),
}));

vi.mock("./file.repository", () => ({
  createFileRepository: () => ({
    deleteFileById: mockDeleteFileById,
  }),
}));

vi.mock("../project/project.repository", () => ({
  createProjectRepository: () => ({
    clearLatestApprovedFileIfMatches: mockClearLatestApprovedFile,
  }),
}));

vi.mock("../repository/audit.repository", () => ({
  createAuditRepository: () => ({
    createAuditLog: mockCreateAuditLog,
  }),
}));

import { createFileManagementService } from "./file-management.service";

describe("FileManagementService - deleteFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fileRepo = {
    findFileById: vi.fn(),
    deleteFileById: mockDeleteFileById,
  };
  const projectRepo = {
    findProjectById: vi.fn().mockResolvedValue({ id: "proj-1" }),
    clearLatestApprovedFileIfMatches: mockClearLatestApprovedFile,
  };
  const memberRepo = {
    findProjectMember: vi.fn().mockResolvedValue({ role: "admin", userSub: "admin-sub" }),
    listProjectMembers: vi.fn().mockResolvedValue([]),
  };
  const boardRepo = {
    findTaskById: vi.fn(),
    listFilesWithTaskInfo: vi.fn(),
  };

  it("elimina el archivo y resetea latestApprovedFileId de forma atómica en el proyecto", async () => {
    fileRepo.findFileById.mockResolvedValue({
      id: "file-123",
      projectId: "proj-1",
      fileName: "logo.png",
      storagePath: "projects/proj-1/files/logo.png",
      createdBySub: "creator-sub",
    });

    const service = createFileManagementService(
      fileRepo as any,
      projectRepo as any,
      memberRepo as any,
      boardRepo as any
    );

    const actor = {
      sub: "admin-sub",
      userId: "u-1",
      role: "admin" as const,
      email: "admin@cima.co",
    };

    const res = await service.deleteFile(actor, "file-123", {
      ipAddress: "127.0.0.1",
      userAgent: "vitest",
    });

    expect(res).toEqual({ deleted: true });
    expect(mockDeleteDocumentInMedia).toHaveBeenCalledWith(actor, "projects/proj-1/files/logo.png");
    expect(mockClearLatestApprovedFile).toHaveBeenCalledWith("proj-1", "file-123");
    expect(mockDeleteFileById).toHaveBeenCalledWith("file-123");
    expect(mockCreateAuditLog).toHaveBeenCalled();
  });

  it("rechaza la eliminación si el usuario no es creador ni admin del proyecto", async () => {
    fileRepo.findFileById.mockResolvedValue({
      id: "file-123",
      projectId: "proj-1",
      fileName: "logo.png",
      storagePath: "projects/proj-1/files/logo.png",
      createdBySub: "other-user",
    });
    memberRepo.findProjectMember.mockResolvedValue({ role: "worker", userSub: "worker-sub" });

    const service = createFileManagementService(
      fileRepo as any,
      projectRepo as any,
      memberRepo as any,
      boardRepo as any
    );

    const actor = {
      sub: "worker-sub",
      userId: "u-2",
      role: "worker" as const,
      email: "worker@cima.co",
    };

    await expect(
      service.deleteFile(actor, "file-123", { ipAddress: "127.0.0.1", userAgent: "vitest" })
    ).rejects.toThrow("Solo el creador, un administrador del proyecto o un admin global puede eliminar el archivo");
  });
});
