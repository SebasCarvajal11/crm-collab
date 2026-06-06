import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { db } from "../../../db/connection";
import { createBriefRepository } from "./brief.repository";
import { createProjectRepository } from "../project/project.repository";
import { createMemberRepository } from "../member/member.repository";
import { createBriefService } from "./brief.service";
import { createBriefController } from "./brief.controller";
import { ProjectIdParamSchema, BriefPatchSchema } from "../collab.schemas";

const briefRepository = createBriefRepository(db);
const projectRepository = createProjectRepository(db);
const memberRepository = createMemberRepository(db);

const briefService = createBriefService(briefRepository, projectRepository, memberRepository);
const briefController = createBriefController(briefService);

export const briefRoutes = new Hono<AppEnv>();

briefRoutes.get(
  "/projects/:projectId/brief",
  zValidator("param", ProjectIdParamSchema),
  briefController.getBrief
);
briefRoutes.patch(
  "/projects/:projectId/brief",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", BriefPatchSchema),
  briefController.patchBrief
);
