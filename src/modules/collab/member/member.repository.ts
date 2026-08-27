import type { DbOrTx } from "../shared/db.types";
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { projectMembers } from "../../../db/schema";
import type { NewProjectMember } from "../collab.types";

export const createMemberRepository = (conn: DbOrTx) => ({
  createProjectMember: async (payload: NewProjectMember) => {
    const [row] = await conn.insert(projectMembers).values(payload).returning();
    return row;
  },

  upsertProjectMember: async (payload: NewProjectMember) => {
    const [row] = await conn
      .insert(projectMembers)
      .values(payload)
      .onConflictDoUpdate({
        target: [projectMembers.projectId, projectMembers.userSub],
        set: { role: payload.role, userEmail: payload.userEmail ?? null, updatedAt: new Date() },
      })
      .returning();
    return row;
  },

  listProjectMembers: async (projectId: string) =>
    conn
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(asc(projectMembers.createdAt)),

  findProjectMember: async (projectId: string, userSub: string) => {
    const [row] = await conn
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userSub, userSub)))
      .limit(1);
    return row ?? null;
  },

  touchProjectMemberActivity: async (projectId: string, userSub: string) => {
    const now = new Date();
    const staleAt = new Date(now.getTime() - 5 * 60 * 1000);
    await conn
      .update(projectMembers)
      .set({ lastSeenAt: now, updatedAt: now })
      .where(and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userSub, userSub),
        or(isNull(projectMembers.lastSeenAt), lt(projectMembers.lastSeenAt, staleAt))
      ));
  },
});
