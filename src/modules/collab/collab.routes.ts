import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware, type AppEnv } from "../../shared/middlewares/auth.middleware";
import { collabRepository } from "./collab.repository";
import { createCollabService } from "./collab.service";
import { createCollabController } from "./collab.controller";
import {
  ApproveFileSchema,
  BriefPatchSchema,
  ChangeRequestIdParamSchema,
  ColumnIdParamSchema,
  CreateChatMessageSchema,
  MarkChatReadSchema,
  CreateColumnSchema,
  CreateFileSchema,
  CreateFormalChangeRequestSchema,
  CreateMinorChangeRequestSchema,
  CreateProjectSchema,
  CreateTaskSchema,
  CreateTaskCommentSchema,
  FileIdParamSchema,
  ProjectFiltersQuerySchema,
  ProjectIdParamSchema,
  ProjectTaskIdParamSchema,
  ResolveChangeRequestSchema,
  UpdateProjectFileSchema,
  TaskIdParamSchema,
  UpdateColumnSchema,
  UpdateProjectSchema,
  UpdateTaskSchema,
  UpsertProjectMemberSchema,
} from "./collab.schemas";

const collabService = createCollabService(collabRepository);
const collabController = createCollabController(collabService);

export const collabRoutes = new Hono<AppEnv>();

collabRoutes.use("*", authMiddleware);

collabRoutes.get("/projects", zValidator("query", ProjectFiltersQuerySchema), collabController.listProjects);
collabRoutes.post("/projects", zValidator("json", CreateProjectSchema), collabController.createProject);
collabRoutes.patch(
  "/projects/:projectId",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", UpdateProjectSchema),
  collabController.updateProject
);
collabRoutes.get(
  "/projects/:projectId/workspace",
  zValidator("param", ProjectIdParamSchema),
  collabController.getProjectWorkspace
);

collabRoutes.get(
  "/projects/:projectId/members",
  zValidator("param", ProjectIdParamSchema),
  collabController.listProjectMembers
);
collabRoutes.put(
  "/projects/:projectId/members",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", UpsertProjectMemberSchema),
  collabController.upsertProjectMember
);

collabRoutes.get(
  "/projects/:projectId/columns",
  zValidator("param", ProjectIdParamSchema),
  collabController.listTaskColumns
);
collabRoutes.post(
  "/projects/:projectId/columns",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", CreateColumnSchema),
  collabController.createTaskColumn
);
collabRoutes.patch(
  "/columns/:columnId",
  zValidator("param", ColumnIdParamSchema),
  zValidator("json", UpdateColumnSchema),
  collabController.updateTaskColumn
);

collabRoutes.get("/projects/:projectId/tasks", zValidator("param", ProjectIdParamSchema), collabController.listTasks);
collabRoutes.post(
  "/projects/:projectId/tasks",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", CreateTaskSchema),
  collabController.createTask
);
collabRoutes.patch(
  "/tasks/:taskId",
  zValidator("param", TaskIdParamSchema),
  zValidator("json", UpdateTaskSchema),
  collabController.updateTask
);

collabRoutes.get(
  "/projects/:projectId/chat/internal",
  zValidator("param", ProjectIdParamSchema),
  collabController.listInternalChat
);
collabRoutes.post(
  "/projects/:projectId/chat/internal",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", CreateChatMessageSchema),
  collabController.postInternalChat
);
collabRoutes.post(
  "/projects/:projectId/chat/internal/read",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", MarkChatReadSchema),
  collabController.markInternalChatRead
);
collabRoutes.get(
  "/projects/:projectId/chat/external",
  zValidator("param", ProjectIdParamSchema),
  collabController.listExternalChat
);
collabRoutes.post(
  "/projects/:projectId/chat/external",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", CreateChatMessageSchema),
  collabController.postExternalChat
);
collabRoutes.post(
  "/projects/:projectId/chat/external/read",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", MarkChatReadSchema),
  collabController.markExternalChatRead
);

collabRoutes.post(
  "/projects/:projectId/change-requests/minor",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", CreateMinorChangeRequestSchema),
  collabController.createMinorChangeRequest
);
collabRoutes.post(
  "/projects/:projectId/change-requests/formal",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", CreateFormalChangeRequestSchema),
  collabController.createFormalChangeRequest
);
collabRoutes.patch(
  "/projects/:projectId/change-requests/:changeRequestId",
  zValidator("param", ChangeRequestIdParamSchema.merge(ProjectIdParamSchema)),
  zValidator("json", ResolveChangeRequestSchema),
  collabController.resolveChangeRequest
);
collabRoutes.get(
  "/projects/:projectId/change-log/formal",
  zValidator("param", ProjectIdParamSchema),
  collabController.listFormalChangeLog
);

/** Lista archivos del proyecto enriquecidos con info de tarea y columna actual */
collabRoutes.get(
  "/projects/:projectId/files",
  zValidator("param", ProjectIdParamSchema),
  collabController.listFilesWithTaskInfo
);
collabRoutes.get(
  "/projects/:projectId/files/timeline",
  zValidator("param", ProjectIdParamSchema),
  collabController.listFilesTimeline
);
collabRoutes.post(
  "/projects/:projectId/files",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", CreateFileSchema),
  collabController.uploadFileMetadata
);
collabRoutes.post(
  "/projects/:projectId/files/upload",
  zValidator("param", ProjectIdParamSchema),
  collabController.uploadProjectFile
);
collabRoutes.patch(
  "/files/:fileId/approve",
  zValidator("param", FileIdParamSchema),
  zValidator("json", ApproveFileSchema),
  collabController.approveFile
);
/** Descarga binaria de archivo desde OCI */
collabRoutes.get(
  "/files/:fileId/download",
  zValidator("param", FileIdParamSchema),
  collabController.downloadFile
);
/** Elimina archivo de OCI + DB */
collabRoutes.delete(
  "/files/:fileId",
  zValidator("param", FileIdParamSchema),
  collabController.deleteFile
);
collabRoutes.patch(
  "/files/:fileId",
  zValidator("param", FileIdParamSchema),
  zValidator("json", UpdateProjectFileSchema),
  collabController.updateProjectFile
);

/** Comentarios de tarea */
collabRoutes.get(
  "/projects/:projectId/tasks/:taskId/comments",
  zValidator("param", ProjectTaskIdParamSchema),
  collabController.listTaskComments
);
collabRoutes.post(
  "/projects/:projectId/tasks/:taskId/comments",
  zValidator("param", ProjectTaskIdParamSchema),
  zValidator("json", CreateTaskCommentSchema),
  collabController.createTaskComment
);

/** Archivos de tarea (multipart upload) */
collabRoutes.post(
  "/projects/:projectId/tasks/:taskId/files",
  zValidator("param", ProjectTaskIdParamSchema),
  collabController.uploadTaskFile   // parsea multipart internamente
);
collabRoutes.get(
  "/projects/:projectId/tasks/:taskId/files",
  zValidator("param", ProjectTaskIdParamSchema),
  collabController.listTaskFiles
);

collabRoutes.get("/projects/:projectId/brief", zValidator("param", ProjectIdParamSchema), collabController.getBrief);
collabRoutes.patch(
  "/projects/:projectId/brief",
  zValidator("param", ProjectIdParamSchema),
  zValidator("json", BriefPatchSchema),
  collabController.patchBrief
);
