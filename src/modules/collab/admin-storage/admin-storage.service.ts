import { AppError, BadRequestError, NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { deleteDocumentInMedia } from "../../../shared/media-command-client";
import { createAuditRepository } from "../repository/audit.repository";
import { db } from "../../../db/connection";
import { createAdminStorageRepository } from "./admin-storage.repository";
import type {
  PurgeBatchInput,
  PurgeResult,
  StorageClientSummary,
  StorageFileItem,
  StorageFolderSummary,
  StorageGlobalSummary,
  StorageProjectSummary,
  StorageTreeResponse,
  FileFolder,
} from "./admin-storage.types";

type Actor = { sub: string; userId: string; role: string; email: string };
type RequestMeta = { ipAddress: string; userAgent: string };

const FOLDER_LABELS: Record<FileFolder, string> = {
  contracts: "Contratos y Adendas",
  final_arts: "Entregables y Artes Finales",
  mockups: "Bocetos y Mockups",
  briefs: "Briefs y Requerimientos",
  shared_deliverables: "Archivos Compartidos",
};

const STANDARD_FOLDERS: FileFolder[] = [
  "contracts",
  "final_arts",
  "mockups",
  "briefs",
  "shared_deliverables",
];

export const createAdminStorageService = (
  repo: ReturnType<typeof createAdminStorageRepository>
) => {
  const buildInitialFolders = (): Record<string, StorageFolderSummary> => {
    const folders: Record<string, StorageFolderSummary> = {};
    for (const key of STANDARD_FOLDERS) {
      folders[key] = {
        folderKey: key,
        folderLabel: FOLDER_LABELS[key],
        totalFiles: 0,
        totalBytes: 0,
        files: [],
      };
    }
    return folders;
  };

  return {
    getStorageTree: async (): Promise<StorageTreeResponse> => {
      const [rawProjects, rawFiles] = await Promise.all([
        repo.findAllProjectsWithClients(),
        repo.findAllFilesWithTaskAndContract(),
      ]);

      const clientsMap = new Map<string, StorageClientSummary>();
      const projectsMap = new Map<string, StorageProjectSummary>();

      for (const p of rawProjects) {
        const clientKey = p.clientSub || "internal-cima";
        const clientName = p.clientName || "CIMA (Interno)";

        if (!clientsMap.has(clientKey)) {
          clientsMap.set(clientKey, {
            clientSub: clientKey,
            clientName,
            totalFiles: 0,
            totalBytes: 0,
            projectsCount: 0,
            projects: [],
          });
        }

        const projectSummary: StorageProjectSummary = {
          projectId: p.id,
          projectName: p.name,
          projectType: p.type,
          projectStatus: p.status,
          isArchived: p.isArchived,
          totalFiles: 0,
          totalBytes: 0,
          folders: buildInitialFolders(),
        };

        projectsMap.set(p.id, projectSummary);
        const client = clientsMap.get(clientKey)!;
        client.projects.push(projectSummary);
        client.projectsCount += 1;
      }

      let globalTotalFiles = 0;
      let globalTotalBytes = 0;
      let globalPurgedFiles = 0;
      let globalPurgedBytes = 0;

      for (const f of rawFiles) {
        const proj = projectsMap.get(f.projectId);
        if (!proj) continue;

        const isSignedContract =
          f.folder === "contracts" && f.contractStatus === "signed";

        const item: StorageFileItem = {
          id: f.id,
          projectId: f.projectId,
          projectName: proj.projectName,
          fileName: f.fileName,
          title: f.title,
          folder: f.folder as FileFolder,
          storagePath: f.storagePath,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          version: f.version,
          isClientVisible: f.isClientVisible,
          isPurged: f.isPurged,
          purgedAt: f.purgedAt,
          purgedReason: f.purgedReason,
          createdByEmail: f.createdByEmail,
          createdAt: f.createdAt,
          taskId: f.taskId,
          taskTitle: f.taskTitle,
          isSignedContract,
        };

        if (!proj.folders[f.folder]) {
          proj.folders[f.folder] = {
            folderKey: f.folder as FileFolder,
            folderLabel: FOLDER_LABELS[f.folder as FileFolder] || f.folder,
            totalFiles: 0,
            totalBytes: 0,
            files: [],
          };
        }

        const folderObj = proj.folders[f.folder];
        folderObj.files.push(item);

        if (f.isPurged) {
          globalPurgedFiles += 1;
          globalPurgedBytes += f.sizeBytes;
        } else {
          folderObj.totalFiles += 1;
          folderObj.totalBytes += f.sizeBytes;
          proj.totalFiles += 1;
          proj.totalBytes += f.sizeBytes;
          globalTotalFiles += 1;
          globalTotalBytes += f.sizeBytes;
        }
      }

      // Consolidar totales por cliente
      for (const client of clientsMap.values()) {
        client.totalFiles = client.projects.reduce((acc, p) => acc + p.totalFiles, 0);
        client.totalBytes = client.projects.reduce((acc, p) => acc + p.totalBytes, 0);
      }

      const summary: StorageGlobalSummary = {
        totalClients: clientsMap.size,
        totalProjects: rawProjects.length,
        totalFiles: globalTotalFiles,
        totalBytes: globalTotalBytes,
        purgedFilesCount: globalPurgedFiles,
        purgedBytes: globalPurgedBytes,
      };

      return {
        summary,
        clients: Array.from(clientsMap.values()),
      };
    },

    purgeSingleFile: async (
      actor: Actor,
      fileId: string,
      reason: string,
      forcePurgeSigned = false,
      meta: RequestMeta
    ) => {
      const file = await repo.findFileByIdWithDetails(fileId);
      if (!file) throw new NotFoundError("Archivo no encontrado");

      if (file.isPurged) {
        return { purged: false, freedBytes: 0, message: "El archivo ya fue depurado" };
      }

      const isSigned = file.folder === "contracts" && file.contractStatus === "signed";
      if (isSigned && !forcePurgeSigned) {
        throw new BadRequestError(
          "El archivo corresponde a un contrato firmado. Para depurarlo, confirma explícitamente la autorización legal."
        );
      }

      try {
        await deleteDocumentInMedia(actor, file.storagePath);
      } catch (err) {
        if (!(err instanceof AppError && err.statusCode === 404)) {
          throw err;
        }
      }

      await db.transaction(async (tx) => {
        await createAdminStorageRepository(tx).markFilesAsPurged(
          [fileId],
          actor.sub,
          reason || "Depurado por administración"
        );
        await createAuditRepository(tx).createAuditLog({
          actorSub: actor.sub,
          action: "admin_storage_file_purged",
          resourceType: "project_file",
          resourceId: fileId,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          details: { fileName: file.fileName, freedBytes: file.sizeBytes, reason },
        });
      });

      return { purged: true, freedBytes: file.sizeBytes, fileId };
    },

    purgeBatch: async (
      actor: Actor,
      input: PurgeBatchInput,
      meta: RequestMeta
    ): Promise<PurgeResult> => {
      const candidates = await repo.findCandidateFilesForPurge(input);

      let skippedSignedContractsCount = 0;
      const toPurge = candidates.filter((c) => {
        const isSigned = c.folder === "contracts" && c.contractStatus === "signed";
        if (isSigned && !input.forcePurgeSigned) {
          skippedSignedContractsCount += 1;
          return false;
        }
        return true;
      });

      if (toPurge.length === 0) {
        return { purgedCount: 0, freedBytes: 0, skippedSignedContractsCount };
      }

      // Eliminar binarios en OCI concurrentemente
      await Promise.allSettled(
        toPurge.map((f) => deleteDocumentInMedia(actor, f.storagePath).catch(() => null))
      );

      const purgeIds = toPurge.map((f) => f.id);
      const totalFreedBytes = toPurge.reduce((acc, f) => acc + f.sizeBytes, 0);

      await db.transaction(async (tx) => {
        await createAdminStorageRepository(tx).markFilesAsPurged(
          purgeIds,
          actor.sub,
          input.reason || "Vaciado de almacenamiento por administración"
        );
        await createAuditRepository(tx).createAuditLog({
          actorSub: actor.sub,
          action: "admin_storage_batch_purged",
          resourceType: "storage_batch",
          resourceId: input.projectId || input.clientSub || "batch",
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          details: {
            purgedCount: purgeIds.length,
            freedBytes: totalFreedBytes,
            reason: input.reason,
          },
        });
      });

      return {
        purgedCount: purgeIds.length,
        freedBytes: totalFreedBytes,
        skippedSignedContractsCount,
      };
    },
  };
};
