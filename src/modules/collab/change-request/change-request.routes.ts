import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { db } from "../../../db/connection";
import { createChangeRequestRepository } from "./change-request.repository";
import { createProjectRepository } from "../project/project.repository";
import { createMemberRepository } from "../member/member.repository";
import { createChatRepository } from "../chat/chat.repository";
import { createBriefRepository } from "../brief/brief.repository";
import { createBoardRepository } from "../board/board.repository";
import { createChangeRequestService } from "./change-request.service";
import { createChangeRequestController } from "./change-request.controller";
import {
  ProjectIdParamSchema,
  ChangeRequestIdParamSchema,
  CreateMinorChangeRequestSchema,
  CreateFormalChangeRequestSchema,
  ResolveChangeRequestSchema,
  FormalChangeLogQuerySchema,
} from "../collab.schemas";

const changeRequestRepository = createChangeRequestRepository(db);
const projectRepository = createProjectRepository(db);
const memberRepository = createMemberRepository(db);
const chatRepository = createChatRepository(db);
const briefRepository = createBriefRepository(db);
const boardRepository = createBoardRepository(db);

const changeRequestService = createChangeRequestService(
  changeRequestRepository,
  projectRepository,
  memberRepository,
  chatRepository,
  briefRepository,
  boardRepository
);
const changeRequestController = createChangeRequestController(changeRequestService);

export const changeRequestRoutes = new Hono<AppEnv>();

changeRequestRoutes.post(
  "/projects/:projectId/change-requests/minor",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", CreateMinorChangeRequestSchema),
  changeRequestController.createMinorChangeRequest
);
changeRequestRoutes.post(
  "/projects/:projectId/change-requests/formal",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", CreateFormalChangeRequestSchema),
  changeRequestController.createFormalChangeRequest
);
changeRequestRoutes.patch(
  "/projects/:projectId/change-requests/:changeRequestId",
  zValidator("param", ChangeRequestIdParamSchema.merge(ProjectIdParamSchema)),
  zValidator("json", ResolveChangeRequestSchema),
  changeRequestController.resolveChangeRequest
);
changeRequestRoutes.get(
  "/projects/:projectId/change-log/formal",
  zValidator("param", ProjectIdParamSchema),
  zValidator("query", FormalChangeLogQuerySchema),
  changeRequestController.listFormalChangeLog
);
