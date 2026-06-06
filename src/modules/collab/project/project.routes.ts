import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { db } from "../../../db/connection";
import { createProjectRepository } from "./project.repository";
import { createMemberRepository } from "../member/member.repository";
import { createBoardRepository } from "../board/board.repository";
import { createBriefRepository } from "../brief/brief.repository";
import { createChangeRequestRepository } from "../change-request/change-request.repository";
import { createProjectService } from "./project.service";
import { createProjectController } from "./project.controller";
import {
  ProjectFiltersQuerySchema,
  ProjectSearchQuerySchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  ProjectIdParamSchema,
  PaginationQuerySchema,
} from "../collab.schemas";

const projectRepository = createProjectRepository(db);
const memberRepository = createMemberRepository(db);
const boardRepository = createBoardRepository(db);
const briefRepository = createBriefRepository(db);
const changeRequestRepository = createChangeRequestRepository(db);

const projectService = createProjectService(
  projectRepository,
  memberRepository,
  boardRepository,
  briefRepository,
  changeRequestRepository
);
const projectController = createProjectController(projectService);

export const projectRoutes = new Hono<AppEnv>();

projectRoutes.get("/projects", zValidator("query", ProjectFiltersQuerySchema), projectController.listProjects);
projectRoutes.get("/projects/search", zValidator("query", ProjectSearchQuerySchema), projectController.searchProjects);
projectRoutes.post("/projects", zValidator("json", CreateProjectSchema), projectController.createProject);
projectRoutes.patch(
  "/projects/:projectId",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", UpdateProjectSchema),
  projectController.updateProject
);
projectRoutes.get(
  "/projects/:projectId/board",
  zValidator("param", ProjectIdParamSchema),
  projectController.getProjectBoard
);
projectRoutes.get(
  "/projects/:projectId/workspace",
  zValidator("param", ProjectIdParamSchema),
  projectController.getProjectWorkspace
);
projectRoutes.get(
  "/projects/:projectId/timeline",
  zValidator("param", ProjectIdParamSchema),
  zValidator("query", PaginationQuerySchema),
  projectController.listProjectTimeline
);
projectRoutes.get(
  "/projects/:projectId/files/timeline",
  zValidator("param", ProjectIdParamSchema),
  zValidator("query", PaginationQuerySchema),
  projectController.listFilesTimeline
);
