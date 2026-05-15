import { z } from "zod";

export const ProjectTypeEnum = z.enum(["campaign_service", "product_order"]);
export const ParentProjectStatusEnum = z.enum(["todo", "in_progress", "in_review", "completed"]);
export const ProjectMemberRoleEnum = z.enum(["admin", "worker", "client"]);
export const TaskPriorityEnum = z.enum(["low", "medium", "high", "urgent"]);
export const TaskColumnKeyEnum = z.enum([
  "pending",
  "doing",
  "internal_review",
  "client_approval",
  "blocked",
  "done",
  "art_approved",
  "in_production",
  "quality_control",
  "shipped",
  "completed",
  "waiting_material",
]);
export const ChatChannelEnum = z.enum(["internal", "external"]);
export const FileFolderEnum = z.enum([
  "mockups",
  "final_arts",
  "briefs",
  "contracts",
  "shared_deliverables",
]);
export const ChangeRequestTypeEnum = z.enum(["minor", "formal"]);
export const ChangeRequestStatusEnum = z.enum(["open", "accepted", "rejected", "escalated", "approved"]);

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ProjectIdParamSchema = z.object({ projectId: z.string().uuid() });
export const TaskIdParamSchema = z.object({ taskId: z.string().uuid() });
export const ColumnIdParamSchema = z.object({ columnId: z.string().uuid() });
export const FileIdParamSchema = z.object({ fileId: z.string().uuid() });
export const ChangeRequestIdParamSchema = z.object({ changeRequestId: z.string().uuid() });
export const NotificationIdParamSchema = z.object({ notificationId: z.string().uuid() });

export const ProjectFiltersQuerySchema = PaginationQuerySchema.extend({
  type: ProjectTypeEnum.optional(),
  status: ParentProjectStatusEnum.optional(),
  admin_sub: z.string().uuid().optional(),
  client_name: z.string().max(160).optional(),
});

export const ProjectTasksQuerySchema = PaginationQuerySchema.extend({
  column_id: z.string().uuid().optional(),
});

export const ChatMessageQuerySchema = PaginationQuerySchema.extend({});
export const ProjectFilesQuerySchema = PaginationQuerySchema.extend({});
export const FormalChangeLogQuerySchema = PaginationQuerySchema.extend({});


export const ProjectSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

export const CreateProjectSchema = z.object({
  name: z.string().min(3).max(140),
  description: z.string().max(2000).optional().default(""),
  client_name: z.string().min(2).max(160),
  client_sub: z.string().uuid().optional(),
  worker_subs: z.array(z.string().uuid()).min(1).max(25),
  type: ProjectTypeEnum,
  estimated_due_date: z.coerce.date().optional(),
  brief: z.string().max(20000).optional().default(""),
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(3).max(140).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: ParentProjectStatusEnum.optional(),
  estimated_due_date: z.coerce.date().nullable().optional(),
  progress_percent: z.coerce.number().int().min(0).max(100).optional(),
});

export const UpsertProjectMemberSchema = z.object({
  user_sub: z.string().uuid(),
  role: ProjectMemberRoleEnum,
  user_email: z.string().email().max(255).optional(),
});

export const CreateColumnSchema = z.object({
  key: TaskColumnKeyEnum,
  title: z.string().min(2).max(80),
  position: z.number().int().min(0).default(0),
  is_client_visible: z.boolean().default(false),
});

export const UpdateColumnSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  position: z.number().int().min(0).optional(),
  is_client_visible: z.boolean().optional(),
});

export const AssigneeSchema = z.object({
  user_sub: z.string().uuid(),
  user_email: z.string().email().max(255),
});

export const SubtaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(255),
  is_completed: z.boolean().default(false),
  assignee_sub: z.string().uuid().nullable().optional(),
});

export const CreateTaskSchema = z.object({
  column_id: z.string().uuid(),
  title: z.string().min(2).max(180),
  description: z.string().max(3000).optional(),
  priority: TaskPriorityEnum.default("medium"),
  assignees: z.array(AssigneeSchema).max(10).optional().default([]),
  due_date: z.coerce.date().optional().nullable(),
  checklist_progress: z.number().int().min(0).max(100).default(0),
  blocked_by_task_id: z.string().uuid().optional().nullable(),
  client_visible: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
  subtasks: z.array(SubtaskSchema).max(50).optional().default([]),
});

export const UpdateTaskSchema = z.object({
  column_id: z.string().uuid().optional(),
  title: z.string().min(2).max(180).optional(),
  description: z.string().max(3000).nullable().optional(),
  priority: TaskPriorityEnum.optional(),
  assignees: z.array(AssigneeSchema).max(10).optional(),
  due_date: z.coerce.date().nullable().optional(),
  checklist_progress: z.number().int().min(0).max(100).optional(),
  blocked_by_task_id: z.string().uuid().nullable().optional(),
  client_visible: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  subtasks: z.array(SubtaskSchema).max(50).optional(),
});

export const CreateTaskCommentSchema = z.object({
  content: z.string().min(1).max(5000),
});

export const ProjectTaskIdParamSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});

export const CreateChatMessageSchema = z.object({
  body: z.string().min(1).max(5000),
  mentions: z.array(z.string().uuid()).max(25).optional(),
});

export const MarkChatReadSchema = z.object({
  up_to_message_id: z.string().uuid().optional(),
  message_ids: z.array(z.string().uuid()).max(200).optional(),
}).refine((v) => Boolean(v.up_to_message_id || (v.message_ids && v.message_ids.length > 0)), {
  message: "Debes enviar up_to_message_id o message_ids",
});

export const CreateFileSchema = z.object({
  file_name: z.string().min(1).max(255),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  storage_path: z.string().min(1).max(5000),
  mime_type: z.string().min(1).max(120),
  size_bytes: z.coerce.number().int().min(0).default(0),
  folder: FileFolderEnum,
  is_client_visible: z.boolean().default(false),
  origin: z.enum(["internal_chat", "external_chat", "manual_upload"]).default("manual_upload"),
});

export const ApproveFileSchema = z.object({
  approve: z.boolean(),
});

export const UpdateProjectFileSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  task_id: z.string().uuid().nullable().optional(),
  is_client_visible: z.boolean().optional(),
});

export const CreateTaskFileMetadataSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  file_name: z.string().min(1).max(255),
  storage_path: z.string().min(1).max(5000),
  mime_type: z.string().min(1).max(120),
  size_bytes: z.coerce.number().int().min(0).default(0),
  is_client_visible: z.boolean().default(false),
});

export const GenerateUploadUrlSchema = z.object({
  file_name: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(120),
  size_bytes: z.coerce.number().int().min(1).max(25 * 1024 * 1024, {
    message: "El archivo supera el límite de 25 MB",
  }),
});

export const BriefPatchSchema = z.object({
  body: z.string().min(1).max(5000),
});

export const CreateMinorChangeRequestSchema = z.object({
  task_id: z.string().uuid(),
  title: z.string().min(3).max(200),
  description: z.string().min(1).max(300),
});

export const CreateFormalChangeRequestSchema = z.object({
  task_id: z.string().uuid().optional(),
  title: z.string().min(3).max(200),
  description: z.string().min(1).max(5000),
  justification: z.string().min(1).max(3000),
});

export const ResolveChangeRequestSchema = z.object({
  status: ChangeRequestStatusEnum.refine((s) => s !== "open", "El estado debe cerrar o escalar la solicitud"),
});

export type ProjectFiltersQuery = z.infer<typeof ProjectFiltersQuerySchema>;
export type ProjectTasksQuery = z.infer<typeof ProjectTasksQuerySchema>;
export type ChatMessageQuery = z.infer<typeof ChatMessageQuerySchema>;
export type ProjectFilesQuery = z.infer<typeof ProjectFilesQuerySchema>;
export type FormalChangeLogQuery = z.infer<typeof FormalChangeLogQuerySchema>;
export type ProjectSearchQuery = z.infer<typeof ProjectSearchQuerySchema>;
export type CreateProjectBody = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectBody = z.infer<typeof UpdateProjectSchema>;
export type UpsertProjectMemberBody = z.infer<typeof UpsertProjectMemberSchema>;
export type CreateColumnBody = z.infer<typeof CreateColumnSchema>;
export type UpdateColumnBody = z.infer<typeof UpdateColumnSchema>;
export type CreateTaskBody = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskBody = z.infer<typeof UpdateTaskSchema>;
export type CreateChatMessageBody = z.infer<typeof CreateChatMessageSchema>;
export type MarkChatReadBody = z.infer<typeof MarkChatReadSchema>;
export type CreateFileBody = z.infer<typeof CreateFileSchema>;
export type ApproveFileBody = z.infer<typeof ApproveFileSchema>;
export type UpdateProjectFileBody = z.infer<typeof UpdateProjectFileSchema>;
export type CreateTaskFileMetadataBody = z.infer<typeof CreateTaskFileMetadataSchema>;
export type BriefPatchBody = z.infer<typeof BriefPatchSchema>;
export type CreateMinorChangeRequestBody = z.infer<typeof CreateMinorChangeRequestSchema>;
export type CreateFormalChangeRequestBody = z.infer<typeof CreateFormalChangeRequestSchema>;
export type ResolveChangeRequestBody = z.infer<typeof ResolveChangeRequestSchema>;
export type CreateTaskCommentBody = z.infer<typeof CreateTaskCommentSchema>;
export type GenerateUploadUrlBody = z.infer<typeof GenerateUploadUrlSchema>;
