import type { DbOrTx } from "../shared/db.types";
import { and, desc, eq, inArray } from "drizzle-orm";
import { projectMentionNotifications, projects } from "../../../db/schema";
import type { NewProjectMentionNotification } from "../collab.types";

export const createNotificationRepository = (conn: DbOrTx) => ({
  createMentionNotifications: async (rows: NewProjectMentionNotification[]) => {
    if (!rows.length) return [];
    return conn
      .insert(projectMentionNotifications)
      .values(rows)
      .onConflictDoNothing()
      .returning();
  },

  listUnreadMentionNotificationsByUser: async (recipientSub: string) =>
    conn
      .select({
        id: projectMentionNotifications.id,
        projectId: projectMentionNotifications.projectId,
        messageId: projectMentionNotifications.messageId,
        channel: projectMentionNotifications.channel,
        recipientSub: projectMentionNotifications.recipientSub,
        authorSub: projectMentionNotifications.authorSub,
        authorEmail: projectMentionNotifications.authorEmail,
        messagePreview: projectMentionNotifications.messagePreview,
        createdAt: projectMentionNotifications.createdAt,
        projectName: projects.name,
      })
      .from(projectMentionNotifications)
      .innerJoin(projects, eq(projectMentionNotifications.projectId, projects.id))
      .where(
        and(
          eq(projectMentionNotifications.recipientSub, recipientSub),
          eq(projectMentionNotifications.isSeen, false),
          eq(projects.isArchived, false)
        )
      )
      .orderBy(desc(projectMentionNotifications.createdAt))
      .limit(100),

  countUnreadMentionNotificationsByUser: async (recipientSub: string) => {
    const rows = await conn
      .select({ id: projectMentionNotifications.id })
      .from(projectMentionNotifications)
      .innerJoin(projects, eq(projectMentionNotifications.projectId, projects.id))
      .where(
        and(
          eq(projectMentionNotifications.recipientSub, recipientSub),
          eq(projectMentionNotifications.isSeen, false),
          eq(projects.isArchived, false)
        )
      );
    return rows.length;
  },

  markMentionNotificationSeen: async (id: string, recipientSub: string) => {
    const [row] = await conn
      .update(projectMentionNotifications)
      .set({ isSeen: true, seenAt: new Date() })
      .where(
        and(
          eq(projectMentionNotifications.id, id),
          eq(projectMentionNotifications.recipientSub, recipientSub),
          eq(projectMentionNotifications.isSeen, false)
        )
      )
      .returning();
    return row ?? null;
  },

  markMentionNotificationsSeenByMessages: async (recipientSub: string, messageIds: string[]) => {
    if (!messageIds.length) return [];
    return conn
      .update(projectMentionNotifications)
      .set({ isSeen: true, seenAt: new Date() })
      .where(
        and(
          eq(projectMentionNotifications.recipientSub, recipientSub),
          eq(projectMentionNotifications.isSeen, false),
          inArray(projectMentionNotifications.messageId, messageIds)
        )
      )
      .returning();
  },
});
