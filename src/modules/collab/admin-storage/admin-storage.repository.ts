import { and, desc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "../shared/db.types";
import {
  projects,
  projectFiles,
  projectTasks,
  projectContracts,
} from "../../../db/schema";
import type { PurgeBatchInput } from "./admin-storage.types";

export const createAdminStorageRepository = (conn: DbOrTx) => ({
  findAllProjectsWithClients: async () => {
    return conn
      .select({
        id: projects.id,
        name: projects.name,
        clientSub: projects.clientSub,
        clientName: projects.clientName,
        type: projects.type,
        status: projects.status,
        isArchived: projects.isArchived,
      })
      .from(projects)
      .orderBy(projects.clientName, projects.name);
  },

  findAllFilesWithTaskAndContract: async () => {
    return conn
      .select({
        id: projectFiles.id,
        projectId: projectFiles.projectId,
        taskId: projectFiles.taskId,
        taskTitle: projectTasks.title,
        title: projectFiles.title,
        folder: projectFiles.folder,
        fileName: projectFiles.fileName,
        storagePath: projectFiles.storagePath,
        mimeType: projectFiles.mimeType,
        sizeBytes: projectFiles.sizeBytes,
        version: projectFiles.version,
        isClientVisible: projectFiles.isClientVisible,
        isPurged: projectFiles.isPurged,
        purgedAt: projectFiles.purgedAt,
        purgedReason: projectFiles.purgedReason,
        createdByEmail: projectFiles.createdByEmail,
        createdAt: projectFiles.createdAt,
        contractStatus: projectContracts.status,
      })
      .from(projectFiles)
      .leftJoin(projectTasks, eq(projectFiles.taskId, projectTasks.id))
      .leftJoin(projectContracts, eq(projectFiles.projectId, projectContracts.projectId))
      .orderBy(desc(projectFiles.createdAt));
  },

  findFileByIdWithDetails: async (fileId: string) => {
    const [row] = await conn
      .select({
        id: projectFiles.id,
        projectId: projectFiles.projectId,
        folder: projectFiles.folder,
        fileName: projectFiles.fileName,
        storagePath: projectFiles.storagePath,
        sizeBytes: projectFiles.sizeBytes,
        isPurged: projectFiles.isPurged,
        contractStatus: projectContracts.status,
      })
      .from(projectFiles)
      .leftJoin(projectContracts, eq(projectFiles.projectId, projectContracts.projectId))
      .where(eq(projectFiles.id, fileId))
      .limit(1);

    return row ?? null;
  },

  findCandidateFilesForPurge: async (input: PurgeBatchInput) => {
    const conditions = [eq(projectFiles.isPurged, false)];

    if (input.fileIds && input.fileIds.length > 0) {
      conditions.push(inArray(projectFiles.id, input.fileIds));
    }
    if (input.projectId) {
      conditions.push(eq(projectFiles.projectId, input.projectId));
    }
    if (input.folder) {
      conditions.push(eq(projectFiles.folder, input.folder));
    }

    const rows = await conn
      .select({
        id: projectFiles.id,
        projectId: projectFiles.projectId,
        folder: projectFiles.folder,
        fileName: projectFiles.fileName,
        storagePath: projectFiles.storagePath,
        sizeBytes: projectFiles.sizeBytes,
        clientSub: projects.clientSub,
        projectStatus: projects.status,
        contractStatus: projectContracts.status,
      })
      .from(projectFiles)
      .innerJoin(projects, eq(projectFiles.projectId, projects.id))
      .leftJoin(projectContracts, eq(projectFiles.projectId, projectContracts.projectId))
      .where(and(...conditions));

    return rows.filter((r) => {
      if (input.clientSub && r.clientSub !== input.clientSub) return false;
      if (input.onlyFinishedProjects && r.projectStatus !== "completed") return false;
      return true;
    });
  },

  markFilesAsPurged: async (
    fileIds: string[],
    actorSub: string,
    reason: string
  ) => {
    if (fileIds.length === 0) return [];

    return conn
      .update(projectFiles)
      .set({
        isPurged: true,
        purgedAt: new Date(),
        purgedBySub: actorSub,
        purgedReason: reason,
      })
      .where(inArray(projectFiles.id, fileIds))
      .returning({ id: projectFiles.id });
  },
});
