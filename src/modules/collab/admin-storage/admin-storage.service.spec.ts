import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAdminStorageService } from "./admin-storage.service";
import type { createAdminStorageRepository } from "./admin-storage.repository";

vi.mock("../../../shared/media-command-client", () => ({
  deleteDocumentInMedia: vi.fn().mockResolvedValue({ deleted: true }),
}));

vi.mock("../../../db/connection", () => {
  const fakeTx = {
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "mock-id" }]),
        }),
      }),
    }),
  };
  return {
    db: {
      transaction: vi.fn(async (cb: any) => cb(fakeTx)),
    },
  };
});

vi.mock("../repository/audit.repository", () => ({
  createAuditRepository: () => ({
    createAuditLog: vi.fn().mockResolvedValue({}),
  }),
}));

describe("adminStorageService", () => {
  const mockRepo = {
    findAllProjectsWithClients: vi.fn(),
    findAllFilesWithTaskAndContract: vi.fn(),
    findFileByIdWithDetails: vi.fn(),
    findCandidateFilesForPurge: vi.fn(),
    markFilesAsPurged: vi.fn(),
  };

  const service = createAdminStorageService(
    mockRepo as unknown as ReturnType<typeof createAdminStorageRepository>
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. getStorageTree agrupa clientes, proyectos y carpetas computando bytes correctamente", async () => {
    mockRepo.findAllProjectsWithClients.mockResolvedValue([
      {
        id: "proj-1",
        name: "Proyecto Alpha",
        clientSub: "client-1",
        clientName: "Cliente Uno",
        type: "campaign_service",
        status: "in_progress",
        isArchived: false,
      },
    ]);

    mockRepo.findAllFilesWithTaskAndContract.mockResolvedValue([
      {
        id: "file-1",
        projectId: "proj-1",
        taskId: null,
        taskTitle: null,
        title: "Propuesta",
        folder: "briefs",
        fileName: "propuesta.pdf",
        storagePath: "clients/client-1/projects/proj-1/briefs/propuesta.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1048576, // 1 MB
        version: 1,
        isClientVisible: true,
        isPurged: false,
        purgedAt: null,
        purgedReason: null,
        createdByEmail: "admin@cima.dev",
        createdAt: new Date(),
        contractStatus: null,
      },
      {
        id: "file-2",
        projectId: "proj-1",
        taskId: null,
        taskTitle: null,
        title: "Viejo",
        folder: "mockups",
        fileName: "boceto-viejo.png",
        storagePath: "clients/client-1/projects/proj-1/mockups/boceto-viejo.png",
        mimeType: "image/png",
        sizeBytes: 524288, // 0.5 MB
        version: 1,
        isClientVisible: false,
        isPurged: true,
        purgedAt: new Date(),
        purgedReason: "Espacio liberado",
        createdByEmail: "admin@cima.dev",
        createdAt: new Date(),
        contractStatus: null,
      },
    ]);

    const result = await service.getStorageTree();

    expect(result.summary.totalClients).toBe(1);
    expect(result.summary.totalProjects).toBe(1);
    expect(result.summary.totalFiles).toBe(1); // Archivo activo
    expect(result.summary.totalBytes).toBe(1048576);
    expect(result.summary.purgedFilesCount).toBe(1); // Archivo purgado
    expect(result.summary.purgedBytes).toBe(524288);

    const client = result.clients[0];
    expect(client.clientName).toBe("Cliente Uno");
    expect(client.totalFiles).toBe(1);
    expect(client.totalBytes).toBe(1048576);

    const project = client.projects[0];
    expect(project.folders.briefs.totalFiles).toBe(1);
    expect(project.folders.mockups.files).toHaveLength(1);
    expect(project.folders.mockups.files[0].isPurged).toBe(true);
  });

  it("2. purgeSingleFile bloquea purgado de contrato firmado sin autorizacion explicita", async () => {
    mockRepo.findFileByIdWithDetails.mockResolvedValue({
      id: "file-contract",
      projectId: "proj-1",
      folder: "contracts",
      fileName: "contrato.pdf",
      storagePath: "clients/client-1/projects/proj-1/contracts/contrato.pdf",
      sizeBytes: 2048,
      isPurged: false,
      contractStatus: "signed",
    });

    const actor = { sub: "admin-sub", userId: "admin-id", role: "admin", email: "admin@cima.dev" };
    const meta = { ipAddress: "127.0.0.1", userAgent: "vitest" };

    await expect(
      service.purgeSingleFile(actor, "file-contract", "Limpieza", false, meta)
    ).rejects.toThrow(/contrato firmado/i);
  });

  it("3. purgeSingleFile procede si forcePurgeSigned es true", async () => {
    mockRepo.findFileByIdWithDetails.mockResolvedValue({
      id: "file-contract",
      projectId: "proj-1",
      folder: "contracts",
      fileName: "contrato.pdf",
      storagePath: "clients/client-1/projects/proj-1/contracts/contrato.pdf",
      sizeBytes: 2048,
      isPurged: false,
      contractStatus: "signed",
    });

    const actor = { sub: "admin-sub", userId: "admin-id", role: "admin", email: "admin@cima.dev" };
    const meta = { ipAddress: "127.0.0.1", userAgent: "vitest" };

    const result = await service.purgeSingleFile(actor, "file-contract", "Limpieza legal", true, meta);
    expect(result.purged).toBe(true);
    expect(result.freedBytes).toBe(2048);
  });

  it("4. purgeBatch salta contratos firmados cuando forcePurgeSigned es false", async () => {
    mockRepo.findCandidateFilesForPurge.mockResolvedValue([
      {
        id: "f1",
        projectId: "p1",
        folder: "contracts",
        fileName: "firmado.pdf",
        storagePath: "clients/c1/projects/p1/contracts/firmado.pdf",
        sizeBytes: 1000,
        clientSub: "c1",
        projectStatus: "completed",
        contractStatus: "signed",
      },
      {
        id: "f2",
        projectId: "p1",
        folder: "mockups",
        fileName: "boceto.png",
        storagePath: "clients/c1/projects/p1/mockups/boceto.png",
        sizeBytes: 5000,
        clientSub: "c1",
        projectStatus: "completed",
        contractStatus: "signed",
      },
    ]);

    const actor = { sub: "admin-sub", userId: "admin-id", role: "admin", email: "admin@cima.dev" };
    const meta = { ipAddress: "127.0.0.1", userAgent: "vitest" };

    const result = await service.purgeBatch(
      actor,
      { projectId: "p1", forcePurgeSigned: false, reason: "Vaciar" },
      meta
    );

    expect(result.purgedCount).toBe(1); // Solo f2 purgado
    expect(result.freedBytes).toBe(5000);
    expect(result.skippedSignedContractsCount).toBe(1); // f1 saltado
  });
});
