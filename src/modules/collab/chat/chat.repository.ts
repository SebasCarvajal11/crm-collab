import type { DbOrTx } from "../shared/db.types";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { projectChatMessages, projectChatMentions, projectChatMessageReads } from "../../../db/schema";
import type { NewProjectChatMessage, NewProjectChatMessageRead } from "../collab.types";

export const createChatRepository = (conn: DbOrTx) => ({
  createChatMessage: async (payload: NewProjectChatMessage) => {
    const [row] = await conn.insert(projectChatMessages).values(payload).returning();
    return { ...row, mentions: [] };
  },

  createChatMentions: async (messageId: string, userSubs: string[]) => {
    if (!userSubs.length) return [];
    return conn
      .insert(projectChatMentions)
      .values(userSubs.map(sub => ({ messageId, userSub: sub })))
      .returning();
  },

  listChatMessagesByChannel: async (opts: {
    projectId: string;
    channel: "internal" | "external" | "system";
    limit: number;
    offset: number;
  }) => {
    const filters = and(
      eq(projectChatMessages.projectId, opts.projectId),
      eq(projectChatMessages.channel, opts.channel)
    );

    const [totalCount] = await conn
      .select({ count: count() })
      .from(projectChatMessages)
      .where(filters);

    const messages = await conn
      .select()
      .from(projectChatMessages)
      .where(filters)
      .orderBy(desc(projectChatMessages.createdAt))
      .limit(opts.limit)
      .offset(opts.offset);

    if (!messages.length) return { rows: [], total: totalCount?.count ?? 0 };

    const mentions = await conn
      .select()
      .from(projectChatMentions)
      .where(inArray(projectChatMentions.messageId, messages.map(m => m.id)));
    
    const mentionsByMessage = new Map<string, string[]>();
    for (const m of mentions) {
      if (!mentionsByMessage.has(m.messageId)) mentionsByMessage.set(m.messageId, []);
      mentionsByMessage.get(m.messageId)!.push(m.userSub);
    }

    return {
      rows: [...messages].reverse().map((msg) => ({
        ...msg,
        mentionedSubs: mentionsByMessage.get(msg.id) ?? [],
      })),
      total: totalCount?.count ?? 0,
    };
  },

  findChatMessageByIdInChannel: async (projectId: string, channel: "internal" | "external" | "system", messageId: string) => {
    const [row] = await conn
      .select({ id: projectChatMessages.id, createdAt: projectChatMessages.createdAt })
      .from(projectChatMessages)
      .where(
        and(
          eq(projectChatMessages.id, messageId),
          eq(projectChatMessages.projectId, projectId),
          eq(projectChatMessages.channel, channel)
        )
      )
      .limit(1);
    return row ?? null;
  },

  listChatMessageIdsUpTo: async (projectId: string, channel: "internal" | "external" | "system", createdAt: Date) => {
    const rows = await conn
      .select({ id: projectChatMessages.id })
      .from(projectChatMessages)
      .where(
        and(
          eq(projectChatMessages.projectId, projectId),
          eq(projectChatMessages.channel, channel),
          sql`${projectChatMessages.createdAt} <= ${createdAt}`
        )
      );
    return rows.map((r) => r.id);
  },

  markChatMessagesRead: async (rows: NewProjectChatMessageRead[]) => {
    if (!rows.length) return [];
    return conn
      .insert(projectChatMessageReads)
      .values(rows)
      .onConflictDoUpdate({
        target: [projectChatMessageReads.messageId, projectChatMessageReads.userSub],
        set: { readAt: new Date() },
      })
      .returning();
  },

  listChatReadsByMessages: async (messageIds: string[]) => {
    if (!messageIds.length) return [];
    return conn
      .select()
      .from(projectChatMessageReads)
      .where(inArray(projectChatMessageReads.messageId, messageIds));
  },
});
