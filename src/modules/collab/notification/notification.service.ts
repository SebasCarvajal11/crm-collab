import { getUserProfilesFromSnapshots } from "../../../shared/identity-snapshot-store";
import { NotFoundError } from "../../../shared/middlewares/error-handler.middleware";
import { getLogger } from "../../../shared/logger";
import type { GlobalRole } from "../collab.types";
import type { createNotificationRepository } from "./notification.repository";

const logger = getLogger();

type Actor = {
  sub: string;
  userId: string;
  role: GlobalRole;
  email: string;
  bearerToken?: string;
};

export const createNotificationService = (
  notificationRepository: ReturnType<typeof createNotificationRepository>
) => ({
  listUnreadMentionNotifications: async (actor: Actor) => {
    const rows = await notificationRepository.listUnreadMentionNotificationsByUser(actor.sub);
    const visibleRows =
      actor.role === "client" ? rows.filter((row) => row.channel !== "internal") : rows;
    const authorSubs = [
      ...new Set(visibleRows.map((r) => r.authorSub).filter((v): v is string => Boolean(v))),
    ];
    const { profiles: profileMap, missingSubs, replicaUnavailable } =
      authorSubs.length > 0
        ? await getUserProfilesFromSnapshots(authorSubs)
        : { profiles: new Map(), missingSubs: [], replicaUnavailable: false };
    if (replicaUnavailable || missingSubs.length > 0) {
      logger.warn(
        { missing: missingSubs.length, replicaUnavailable },
        "[collab] Nombres de autores en notificaciones incompletos desde snapshots locales"
      );
    }
    return visibleRows.map((row) => {
      const profile = row.authorSub ? profileMap.get(row.authorSub) : undefined;
      const authorName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ").trim();
      return {
        id: row.id,
        project_id: row.projectId,
        project_name: row.projectName,
        message_id: row.messageId,
        channel: row.channel,
        created_at: row.createdAt,
        message_preview: row.messagePreview,
        author_sub: row.authorSub,
        author_email: row.authorEmail,
        author_name: authorName || row.authorEmail || "Sistema",
      };
    });
  },

  countUnreadMentionNotifications: async (actor: Actor) => {
    return notificationRepository.countUnreadMentionNotificationsByUser(actor.sub);
  },

  markMentionNotificationSeen: async (actor: Actor, notificationId: string) => {
    const updated = await notificationRepository.markMentionNotificationSeen(notificationId, actor.sub);
    if (!updated) throw new NotFoundError("Notificacion no encontrada o ya vista");
    return { id: updated.id, is_seen: true, seen_at: updated.seenAt };
  },
});
