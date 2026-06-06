import type { DbOrTx } from "../shared/db.types";
import { and, count, desc, eq } from "drizzle-orm";
import { projectBriefs, projectBriefChangeLog } from "../../../db/schema";
import type { NewProjectBrief, NewProjectBriefChangeLog } from "../collab.types";

export const createBriefRepository = (conn: DbOrTx) => ({
  createBrief: async (payload: NewProjectBrief) => {
    const [row] = await conn.insert(projectBriefs).values(payload).returning();
    return row;
  },

  upsertBrief: async (payload: NewProjectBrief) => {
    const [row] = await conn
      .insert(projectBriefs)
      .values(payload)
      .onConflictDoUpdate({
        target: [projectBriefs.projectId],
        set: { content: payload.content, updatedBySub: payload.updatedBySub, updatedAt: new Date() },
      })
      .returning();
    return row;
  },

  getBriefByProject: async (projectId: string) => {
    const [row] = await conn.select().from(projectBriefs).where(eq(projectBriefs.projectId, projectId)).limit(1);
    return row ?? null;
  },

  createBriefChangeLog: async (payload: NewProjectBriefChangeLog) => {
    const [row] = await conn.insert(projectBriefChangeLog).values(payload).returning();
    return row;
  },

  listBriefChangeLog: async (opts: { projectId: string; limit: number; offset: number }) => {
    const filters = eq(projectBriefChangeLog.projectId, opts.projectId);

    const [totalCount] = await conn
      .select({ count: count() })
      .from(projectBriefChangeLog)
      .where(filters);

    const rows = await conn
      .select()
      .from(projectBriefChangeLog)
      .where(filters)
      .orderBy(desc(projectBriefChangeLog.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    return { rows, total: totalCount?.count ?? 0 };
  },
});
