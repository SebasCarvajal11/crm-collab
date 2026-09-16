import { describe, expect, it, vi } from "vitest";

const mockLockSequence = vi.fn().mockResolvedValue(undefined);
const mockFindLatestVersion = vi.fn();
const mockCreateFileForTask = vi.fn().mockImplementation((payload) => Promise.resolve({ id: "file-1", ...payload }));

vi.mock("../../../db/connection", () => ({
  db: {
    transaction: vi.fn(async (cb) => cb({})),
  },
}));
vi.mock("../events", () => ({ collabEvents: { emit: vi.fn().mockResolvedValue(undefined) } }));
vi.mock("../board/board.repository", () => ({
  createBoardRepository: () => ({
    findTaskById: vi.fn().mockResolvedValue({ id: "task-1", projectId: "p-1", title: "Task 1", isClientVisible: true }),
    createFileForTask: mockCreateFileForTask,
  }),
}));
vi.mock("../file/file.repository", () => ({
  createFileRepository: () => ({
    lockFileVersionSequence: mockLockSequence,
    findLatestVersion: mockFindLatestVersion,
  }),
}));
vi.mock("../repository/audit.repository", () => ({
  createAuditRepository: () => ({
    createAuditLog: vi.fn().mockResolvedValue({}),
  }),
}));
vi.mock("../shared/upload-helpers", () => ({
  assertProductionObjectRegistered: vi.fn().mockResolvedValue({
    mimeType: "application/pdf",
    sizeBytes: 1024,
  }),
  assertAllowedUploadMime: vi.fn(),
}));

import { createBoardService } from "./board.service";

describe("BoardService - createFileForTask", () => {
  const projectRepo = { findProjectById: vi.fn().mockResolvedValue({ id: "p-1" }) } as any;
  const memberRepo = {
    findProjectMember: vi.fn().mockResolvedValue({ role: "worker", userSub: "worker-sub" }),
    listProjectMembers: vi.fn().mockResolvedValue([]),
  } as any;
  const boardRepo = {
    findTaskById: vi.fn().mockResolvedValue({ id: "task-1", projectId: "p-1", isClientVisible: true }),
    createFileForTask: mockCreateFileForTask,
  } as any;
  const fileRepo = {} as any;

  const actor = {
    sub: "user-1",
    userId: "user-1",
    role: "worker" as const,
    email: "worker@cima.dev",
  };
  const meta = { ipAddress: "127.0.0.1", userAgent: "test" };

  it("asigna version 1 cuando no existen versiones previas del archivo", async () => {
    mockFindLatestVersion.mockResolvedValueOnce(null);

    const service = createBoardService(boardRepo, projectRepo, memberRepo, fileRepo);
    const result = await service.uploadTaskFileMetadata(
      actor,
      "p-1",
      "task-1",
      {
        fileName: "adjunto.pdf",
        title: "Adjunto",
        description: "Test desc",
        storagePath: "projects/p-1/tasks/task-1/adjunto.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        isClientVisible: true,
        authorEmail: "worker@cima.dev",
      },
      meta
    );

    expect(mockLockSequence).toHaveBeenCalledWith("p-1", "adjunto.pdf");
    expect(result.version).toBe(1);
    expect(mockCreateFileForTask).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
  });

  it("incrementa la version dinamicamente si ya existe una version previa", async () => {
    mockFindLatestVersion.mockResolvedValueOnce({ version: 2 });

    const service = createBoardService(boardRepo, projectRepo, memberRepo, fileRepo);
    const result = await service.uploadTaskFileMetadata(
      actor,
      "p-1",
      "task-1",
      {
        fileName: "adjunto.pdf",
        title: "Adjunto v3",
        description: "Test desc",
        storagePath: "projects/p-1/tasks/task-1/adjunto-v3.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024,
        isClientVisible: true,
        authorEmail: "worker@cima.dev",
      },
      meta
    );

    expect(mockLockSequence).toHaveBeenCalledWith("p-1", "adjunto.pdf");
    expect(result.version).toBe(3);
    expect(mockCreateFileForTask).toHaveBeenCalledWith(expect.objectContaining({ version: 3 }));
  });
});
