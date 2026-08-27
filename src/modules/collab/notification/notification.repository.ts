import type { DbOrTx } from "../shared/db.types";
import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
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

  listUnreadMentionNotificationsByUser: async (
    recipientSub: string,
    options: { excludeInternal?: boolean } = {}
  ) =>
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
          eq(projects.isArchived, false),
          ...(options.excludeInternal ? [ne(projectMentionNotifications.channel, "internal")] : [])
        )
      )
      .orderBy(desc(projectMentionNotifications.createdAt))
      .limit(100),

  countUnreadMentionNotificationsByUser: async (
    recipientSub: string,
    options: { excludeInternal?: boolean } = {}
  ) => {
    const [row] = await conn
      .select({ count: count() })
      .from(projectMentionNotifications)
      .innerJoin(projects, eq(projectMentionNotifications.projectId, projects.id))
      .where(
        and(
          eq(projectMentionNotifications.recipientSub, recipientSub),
          eq(projectMentionNotifications.isSeen, false),
          eq(projects.isArchived, false),
          ...(options.excludeInternal ? [ne(projectMentionNotifications.channel, "internal")] : [])
        )
      );
    return Number(row?.count ?? 0);
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

  markMentionNotificationsSeenUpTo: async (
    recipientSub: string,
    projectId: string,
    channel: "internal" | "external",
    createdAt: Date,
  ) => {
    await conn.execute(sql`
      UPDATE schema_collab.project_mention_notifications AS notification
      SET is_seen = true, seen_at = NOW()
      WHERE notification.recipient_sub = ${recipientSub}::uuid
        AND notification.is_seen = false
        AND EXISTS (
          SELECT 1
          FROM schema_collab.project_chat_messages AS message
          WHERE message.id = notification.message_id
            AND message.project_id = ${projectId}::uuid
            AND message.channel = ${channel}::schema_collab.chat_channel
            AND message.created_at <= ${createdAt}
        )
    `);
  },
});
