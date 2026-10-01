import type { DbOrTx } from "../shared/db.types";
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import { projectMembers } from "../../../db/schema";
import type { NewProjectMember } from "../collab.types";

const recentActivityTouchMap = new Map<string, number>();

function pruneRecentActivityTouchMap(nowMs: number): void {
  const cutoff = nowMs - 5 * 60 * 1000;
  for (const [key, timestamp] of recentActivityTouchMap) {
    if (timestamp < cutoff) {
      recentActivityTouchMap.delete(key);
    }
  }
}

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
    const key = `${projectId}:${userSub}`;
    const lastTouched = recentActivityTouchMap.get(key) ?? 0;
    const nowMs = Date.now();
    if (nowMs - lastTouched < 5 * 60 * 1000) return;

    recentActivityTouchMap.set(key, nowMs);
    if (recentActivityTouchMap.size > 5000) {
      pruneRecentActivityTouchMap(nowMs);
    }

    const now = new Date(nowMs);
    const staleAt = new Date(nowMs - 5 * 60 * 1000);
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
