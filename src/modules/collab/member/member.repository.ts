import type { DbOrTx } from "../shared/db.types";
import { and, asc, eq } from "drizzle-orm";
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
    await conn
      .update(projectMembers)
      .set({ lastSeenAt: new Date(), updatedAt: new Date() })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userSub, userSub)));
  },
});
