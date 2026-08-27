import { NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import type { GlobalRole } from "../collab.types";
import type { createNotificationRepository } from "./notification.repository";
import type { createActivityNotificationRepository } from "./activity-notification.repository";

type Actor = {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
  bearerToken?: string;
};

export const createNotificationService = (
  notificationRepository: ReturnType<typeof createNotificationRepository>,
  activityRepository: ReturnType<typeof createActivityNotificationRepository>
) => ({
  listUnreadNotifications: async (actor: Actor) => {
    const options = { excludeInternal: actor.role === "client" };
    const [mentions, activities] = await Promise.all([
      notificationRepository.listUnreadMentionNotificationsByUser(actor.sub, options),
      activityRepository.listUnreadByUser(actor.sub, options),
    ]);
    const mentionItems = mentions.map((row) => ({
      id: row.id, source: "mention" as const, project_id: row.projectId, project_name: row.projectName,
      channel: row.channel, created_at: row.createdAt, title: "Mención en chat", body: row.messagePreview,
      resource_type: "chat_message", resource_id: row.messageId, message_id: row.messageId,
      author_sub: row.authorSub, author_email: row.authorEmail,
    }));
    const activityItems = activities.map((row) => ({
      id: row.id, source: "activity" as const, project_id: row.projectId, project_name: row.projectName,
      channel: row.channel, created_at: row.createdAt, title: row.title, body: row.body,
      resource_type: row.resourceType, resource_id: row.resourceId, message_id: null,
      author_sub: row.actorSub, author_email: null,
    }));
    return [...mentionItems, ...activityItems].sort((a, b) => b.created_at.getTime() - a.created_at.getTime()).slice(0, 100);
  },

  countUnreadNotifications: async (actor: Actor) => {
    const options = { excludeInternal: actor.role === "client" };
    const [mentions, activities] = await Promise.all([
      notificationRepository.countUnreadMentionNotificationsByUser(actor.sub, options),
      activityRepository.countUnreadByUser(actor.sub, options),
    ]);
    return mentions + activities;
  },

  markNotificationSeen: async (actor: Actor, notificationId: string) => {
    const activity = await activityRepository.markSeen(notificationId, actor.sub);
    if (activity) return { id: activity.id, is_seen: true, seen_at: activity.seenAt };
    const mention = await notificationRepository.markMentionNotificationSeen(notificationId, actor.sub);
    if (!mention) throw new NotFoundError("Notificacion no encontrada o ya vista");
    return { id: mention.id, is_seen: true, seen_at: mention.seenAt };
  },
});
