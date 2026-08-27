import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { db } from "../../../db/connection";
import { createNotificationRepository } from "./notification.repository";
import { createActivityNotificationRepository } from "./activity-notification.repository";
import { createNotificationService } from "./notification.service";
import { createNotificationController } from "./notification.controller";
import { NotificationIdParamSchema } from "../collab.schemas";

const notificationRepository = createNotificationRepository(db);
const notificationService = createNotificationService(notificationRepository, createActivityNotificationRepository(db));
const notificationController = createNotificationController(notificationService);

export const notificationRoutes = new Hono<AppEnv>();

notificationRoutes.get("/notifications/unread", notificationController.listUnreadNotifications);
notificationRoutes.get("/notifications/unread/count", notificationController.countUnreadNotifications);
notificationRoutes.patch("/notifications/:notificationId/read", zValidator("param", NotificationIdParamSchema), notificationController.markNotificationSeen);
