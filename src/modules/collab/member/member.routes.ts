import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { db } from "../../../db/connection";
import { createMemberRepository } from "./member.repository";
import { createProjectRepository } from "../project/project.repository";
import { createBoardRepository } from "../board/board.repository";
import { createMemberService } from "./member.service";
import { createMemberController } from "./member.controller";
import { ProjectIdParamSchema, UpsertProjectMemberSchema } from "../collab.schemas";

const memberRepository = createMemberRepository(db);
const projectRepository = createProjectRepository(db);
const boardRepository = createBoardRepository(db);

const memberService = createMemberService(memberRepository, projectRepository, boardRepository);
const memberController = createMemberController(memberService);

export const memberRoutes = new Hono<AppEnv>();

memberRoutes.get(
  "/projects/:projectId/members",
  zValidator("param", ProjectIdParamSchema),
  memberController.listProjectMembers
);
memberRoutes.put(
  "/projects/:projectId/members",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", UpsertProjectMemberSchema),
  memberController.upsertProjectMember
);
