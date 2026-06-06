import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { db } from "../../../db/connection";
import { createBoardRepository } from "./board.repository";
import { createProjectRepository } from "../project/project.repository";
import { createMemberRepository } from "../member/member.repository";
import { createFileRepository } from "../file/file.repository";
import { createBoardService } from "./board.service";
import { createBoardController } from "./board.controller";
import {
  ProjectIdParamSchema,
  ColumnIdParamSchema,
  CreateColumnSchema,
  UpdateColumnSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  ProjectTasksQuerySchema,
  TaskIdParamSchema,
  ProjectTaskIdParamSchema,
  CreateTaskCommentSchema,
  CreateTaskFileMetadataSchema,
} from "../collab.schemas";

const boardRepository = createBoardRepository(db);
const projectRepository = createProjectRepository(db);
const memberRepository = createMemberRepository(db);
const fileRepository = createFileRepository(db);

const boardService = createBoardService(boardRepository, projectRepository, memberRepository, fileRepository);
const boardController = createBoardController(boardService);

export const boardRoutes = new Hono<AppEnv>();

boardRoutes.get(
  "/projects/:projectId/columns",
  zValidator("param", ProjectIdParamSchema),
  boardController.listTaskColumns
);
boardRoutes.post(
  "/projects/:projectId/columns",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", CreateColumnSchema),
  boardController.createTaskColumn
);
boardRoutes.patch(
  "/columns/:columnId",
  zValidator("param", ColumnIdParamSchema),
  zValidator("json", UpdateColumnSchema),
  boardController.updateTaskColumn
);

boardRoutes.get(
  "/projects/:projectId/tasks",
  zValidator("param", ProjectIdParamSchema),
  zValidator("query", ProjectTasksQuerySchema),
  boardController.listTasks
);
boardRoutes.post(
  "/projects/:projectId/tasks",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", CreateTaskSchema),
  boardController.createTask
);
boardRoutes.patch(
  "/tasks/:taskId",
  zValidator("param", TaskIdParamSchema),
  zValidator("json", UpdateTaskSchema),
  boardController.updateTask
);

boardRoutes.get(
  "/projects/:projectId/tasks/:taskId/comments",
  zValidator("param", ProjectTaskIdParamSchema),
  boardController.listTaskComments
);
boardRoutes.post(
  "/projects/:projectId/tasks/:taskId/comments",
  zValidator("param", ProjectTaskIdParamSchema),
  zValidator("json", CreateTaskCommentSchema),
  boardController.createTaskComment
);

boardRoutes.post(
  "/projects/:projectId/tasks/:taskId/files/metadata",
  zValidator("param", ProjectTaskIdParamSchema),
  zValidator("json", CreateTaskFileMetadataSchema),
  boardController.uploadTaskFileMetadata
);
boardRoutes.get(
  "/projects/:projectId/tasks/:taskId/files",
  zValidator("param", ProjectTaskIdParamSchema),
  boardController.listTaskFiles
);
