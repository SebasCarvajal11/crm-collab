import type { Context } from "hono";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { actorFromContext } from "../actor";
import type { createNotificationService } from "./notification.service";

const requiredParam = (c: Context, key: string) => c.req.param(key) ?? "";

export const createNotificationController = (service: ReturnType<typeof createNotificationService>) => ({
  listUnreadMentionNotifications: async (c: Context<AppEnv>) => {
    const data = await service.listUnreadMentionNotifications(actorFromContext(c));
    return c.json({ data }, 200);
  },

  countUnreadMentionNotifications: async (c: Context<AppEnv>) => {
    const count = await service.countUnreadMentionNotifications(actorFromContext(c));
    return c.json({ data: { unread_count: count } }, 200);
  },

  markMentionNotificationSeen: async (c: Context<AppEnv>) => {
    const data = await service.markMentionNotificationSeen(actorFromContext(c), requiredParam(c, "notificationId"));
    return c.json({ data }, 200);
  },
});
