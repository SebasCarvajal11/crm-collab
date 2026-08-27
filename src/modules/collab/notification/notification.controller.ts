import type { Context } from "hono";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { actorFromContext } from "../actor";
import type { createNotificationService } from "./notification.service";

const requiredParam = (c: Context, key: string) => c.req.param(key) ?? "";

export const createNotificationController = (service: ReturnType<typeof createNotificationService>) => ({
  listUnreadNotifications: async (c: Context<AppEnv>) => {
    const data = await service.listUnreadNotifications(actorFromContext(c));
    return c.json({ data }, 200);
  },

  countUnreadNotifications: async (c: Context<AppEnv>) => {
    const count = await service.countUnreadNotifications(actorFromContext(c));
    return c.json({ data: { count: String(count), unread_count: count } }, 200);
  },

  markNotificationSeen: async (c: Context<AppEnv>) => {
    const data = await service.markNotificationSeen(actorFromContext(c), requiredParam(c, "notificationId"));
    return c.json({ data }, 200);
  },
});
