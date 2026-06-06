import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { AppEnv } from "../../../shared/middlewares/auth.middleware";
import { db } from "../../../db/connection";
import { createFileRepository } from "./file.repository";
import { createProjectRepository } from "../project/project.repository";
import { createMemberRepository } from "../member/member.repository";
import { createBoardRepository } from "../board/board.repository";
import { createFileUploadService } from "./file-upload.service";
import { createFileManagementService } from "./file-management.service";
import { createFileController } from "./file.controller";
import {
  ProjectIdParamSchema,
  ProjectTaskIdParamSchema,
  PaginationQuerySchema,
  CreateFileSchema,
  GenerateUploadUrlSchema,
  FileIdParamSchema,
  ApproveFileSchema,
  UpdateProjectFileSchema,
} from "../collab.schemas";

const fileRepository = createFileRepository(db);
const projectRepository = createProjectRepository(db);
const memberRepository = createMemberRepository(db);
const boardRepository = createBoardRepository(db);

const uploadService = createFileUploadService(fileRepository, projectRepository, memberRepository, boardRepository);
const managementService = createFileManagementService(fileRepository, projectRepository, memberRepository, boardRepository);

const fileController = createFileController(uploadService, managementService);

export const fileRoutes = new Hono<AppEnv>();

fileRoutes.get("/internal/storage-access", fileController.assertStoragePathAccess);

fileRoutes.get(
  "/projects/:projectId/files",
  zValidator("param", ProjectIdParamSchema),
  fileController.listFilesWithTaskInfo
);
fileRoutes.post(
  "/projects/:projectId/files",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", CreateFileSchema),
  fileController.uploadFileMetadata
);
fileRoutes.post(
  "/projects/:projectId/files/upload-url",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", GenerateUploadUrlSchema),
  fileController.generateProjectFileUploadUrl
);
fileRoutes.delete(
  "/projects/:projectId/files/uploaded-object",
  zValidator("param", ProjectIdParamSchema),
  fileController.abortUploadedFileObject
);
fileRoutes.patch(
  "/files/:fileId/approve",
  zValidator("param", FileIdParamSchema),
  zValidator("json", ApproveFileSchema),
  fileController.approveFile
);
fileRoutes.get(
  "/files/:fileId/download",
  zValidator("param", FileIdParamSchema),
  fileController.downloadFile
);
fileRoutes.get(
  "/files/:fileId/access",
  zValidator("param", FileIdParamSchema),
  fileController.getFileAccess
);
fileRoutes.delete(
  "/files/:fileId",
  zValidator("param", FileIdParamSchema),
  fileController.deleteFile
);
fileRoutes.patch(
  "/files/:fileId",
  zValidator("param", FileIdParamSchema),
  zValidator("json", UpdateProjectFileSchema),
  fileController.updateProjectFile
);
fileRoutes.post(
  "/projects/:projectId/tasks/:taskId/files/upload-url",
  zValidator("param", ProjectTaskIdParamSchema),
  zValidator("json", GenerateUploadUrlSchema),
  fileController.generateTaskFileUploadUrl
);
