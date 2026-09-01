import type { DbOrTx } from "../shared/db.types";
import { and, desc, eq, sql } from "drizzle-orm";
import { projectFiles } from "../../../db/schema";
import type { NewProjectFile } from "../collab.types";

export const createFileRepository = (conn: DbOrTx) => ({
  lockFileVersionSequence: async (projectId: string, fileName: string) => {
    await conn.execute(sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${projectId} || ':' || ${fileName}, 0))
    `);
  },

  createFile: async (payload: NewProjectFile) => {
    const [row] = await conn.insert(projectFiles).values(payload).returning();
    return row;
  },

  findLatestVersion: async (projectId: string, fileName: string) => {
    const [row] = await conn
      .select()
      .from(projectFiles)
      .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.fileName, fileName)))
      .orderBy(desc(projectFiles.version))
      .limit(1);
    return row ?? null;
  },

  markFileApproved: async (fileId: string, approvedBySub: string) => {
    const [row] = await conn
      .update(projectFiles)
      .set({ approvedByClient: true, approvedBySub, approvedAt: new Date() })
      .where(eq(projectFiles.id, fileId))
      .returning();
    return row ?? null;
  },

  findFileById: async (fileId: string) => {
    const [row] = await conn.select().from(projectFiles).where(eq(projectFiles.id, fileId)).limit(1);
    return row ?? null;
  },

  findFileByStoragePath: async (storagePath: string) => {
    const [row] = await conn
      .select({
        projectId: projectFiles.projectId,
        isClientVisible: projectFiles.isClientVisible,
      })
      .from(projectFiles)
      .where(eq(projectFiles.storagePath, storagePath))
      .limit(1);
    return row ?? null;
  },

  deleteFileById: async (fileId: string) => {
    await conn.delete(projectFiles).where(eq(projectFiles.id, fileId));
  },

  updateFileById: async (
    fileId: string,
    patch: { title?: string; description?: string | null; taskId?: string | null; isClientVisible?: boolean }
  ) => {
    const [row] = await conn
      .update(projectFiles)
      .set({
        title: patch.title,
        description: patch.description,
        taskId: patch.taskId,
        isClientVisible: patch.isClientVisible,
      })
      .where(eq(projectFiles.id, fileId))
      .returning();
    return row ?? null;
  },

  listTaskFiles: async (taskId: string) =>
    conn
      .select()
      .from(projectFiles)
      .where(eq(projectFiles.taskId, taskId))
      .orderBy(desc(projectFiles.createdAt)),
});
