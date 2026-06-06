import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { db } from "../../../db/connection";
import { createNotificationRepository } from "./notification.repository";
import { createNotificationService } from "./notification.service";
import { createNotificationController } from "./notification.controller";
import { NotificationIdParamSchema } from "../collab.schemas";

const notificationRepository = createNotificationRepository(db);
const notificationService = createNotificationService(notificationRepository);
const notificationController = createNotificationController(notificationService);

export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.get("/notifications/chat-mentions/unread", notificationController.listUnreadMentionNotifications);
notificationRoutes.get("/notifications/chat-mentions/unread/count", notificationController.countUnreadMentionNotifications);
notificationRoutes.patch(
  "/notifications/chat-mentions/:notificationId/read",
  zValidator("param", NotificationIdParamSchema),
  notificationController.markMentionNotificationSeen
);
