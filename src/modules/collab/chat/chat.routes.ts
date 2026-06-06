import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { db } from "../../../db/connection";
import { createChatRepository } from "./chat.repository";
import { createProjectRepository } from "../project/project.repository";
import { createMemberRepository } from "../member/member.repository";
import { createNotificationRepository } from "../notification/notification.repository";
import { createChatService } from "./chat.service";
import { createChatController } from "./chat.controller";
import {
  ProjectIdParamSchema,
  ChatMessageQuerySchema,
  CreateChatMessageSchema,
  MarkChatReadSchema,
} from "../collab.schemas";

const chatRepository = createChatRepository(db);
const projectRepository = createProjectRepository(db);
const memberRepository = createMemberRepository(db);
const notificationRepository = createNotificationRepository(db);

const chatService = createChatService(chatRepository, projectRepository, memberRepository, notificationRepository);
const chatController = createChatController(chatService);

export const chatRoutes = new Hono<AppEnv>();

chatRoutes.get(
  "/projects/:projectId/chat/internal",
  zValidator("param", ProjectIdParamSchema),
  zValidator("query", ChatMessageQuerySchema),
  chatController.listInternalChat
);
chatRoutes.post(
  "/projects/:projectId/chat/internal",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", CreateChatMessageSchema),
  chatController.postInternalChat
);
chatRoutes.post(
  "/projects/:projectId/chat/internal/read",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", MarkChatReadSchema),
  chatController.markInternalChatRead
);
chatRoutes.get(
  "/projects/:projectId/chat/external",
  zValidator("param", ProjectIdParamSchema),
  zValidator("query", ChatMessageQuerySchema),
  chatController.listExternalChat
);
chatRoutes.post(
  "/projects/:projectId/chat/external",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", CreateChatMessageSchema),
  chatController.postExternalChat
);
chatRoutes.post(
  "/projects/:projectId/chat/external/read",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", MarkChatReadSchema),
  chatController.markExternalChatRead
);
