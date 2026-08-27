import { and, count, desc, eq, ne } from "drizzle-orm";
import { projectActivityNotifications, projects } from "../../../db/schema";
import type { NewProjectActivityNotification } from "../collab.types";
import type { DbOrTx } from "../shared/db.types";

export const createActivityNotificationRepository = (conn: DbOrTx) => ({
  create: async (rows: NewProjectActivityNotification[]) => {
    if (!rows.length) return [];
    return conn.insert(projectActivityNotifications).values(rows).onConflictDoNothing().returning();
  },

  listUnreadByUser: async (recipientSub: string, options: { excludeInternal?: boolean } = {}) =>
    conn
      .select({
        id: projectActivityNotifications.id,
        projectId: projectActivityNotifications.projectId,
        projectName: projects.name,
        actorSub: projectActivityNotifications.actorSub,
        channel: projectActivityNotifications.channel,
        kind: projectActivityNotifications.kind,
        title: projectActivityNotifications.title,
        body: projectActivityNotifications.body,
        resourceType: projectActivityNotifications.resourceType,
        resourceId: projectActivityNotifications.resourceId,
        createdAt: projectActivityNotifications.createdAt,
      })
      .from(projectActivityNotifications)
      .innerJoin(projects, eq(projectActivityNotifications.projectId, projects.id))
      .where(
        and(
          eq(projectActivityNotifications.recipientSub, recipientSub),
          eq(projectActivityNotifications.isSeen, false),
          eq(projects.isArchived, false),
          ...(options.excludeInternal ? [ne(projectActivityNotifications.channel, "internal")] : [])
        )
      )
      .orderBy(desc(projectActivityNotifications.createdAt))
      .limit(100),

  countUnreadByUser: async (recipientSub: string, options: { excludeInternal?: boolean } = {}) => {
    const [row] = await conn
      .select({ count: count() })
      .from(projectActivityNotifications)
      .innerJoin(projects, eq(projectActivityNotifications.projectId, projects.id))
      .where(
        and(
          eq(projectActivityNotifications.recipientSub, recipientSub),
          eq(projectActivityNotifications.isSeen, false),
          eq(projects.isArchived, false),
          ...(options.excludeInternal ? [ne(projectActivityNotifications.channel, "internal")] : [])
        )
      );
    return Number(row?.count ?? 0);
  },

  markSeen: async (id: string, recipientSub: string) => {
    const [row] = await conn
      .update(projectActivityNotifications)
      .set({ isSeen: true, seenAt: new Date() })
      .where(
        and(
          eq(projectActivityNotifications.id, id),
          eq(projectActivityNotifications.recipientSub, recipientSub),
          eq(projectActivityNotifications.isSeen, false)
        )
      )
      .returning();
    return row ?? null;
  },
});
