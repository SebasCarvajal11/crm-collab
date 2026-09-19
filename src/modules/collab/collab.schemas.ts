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
  "on_hold",
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
export const ChangeRequestStatusEnum = z.enum(["open", "accepted", "rejected", "escalated", "approved", "resolved"]);
export const ContractStatusEnum = z.enum(["draft", "pending_signature", "signed"]);
export const ContractProviderKindEnum = z.enum(["cima", "independent"]);
export const ContractClientKindEnum = z.enum(["natural", "juridical"]);

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

const FileRepositoryUrlSchema = z
  .url()
  .max(2_000)
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  }, "El enlace del repositorio debe usar HTTP o HTTPS");

export const CreateProjectSchema = z.object({
  name: z.string().min(3).max(140),
  description: z.string().max(2000).optional().default(""),
  client_name: z.string().min(2).max(160).optional().default("Cliente Test"),
  client_sub: z.string().uuid().optional(),
  worker_subs: z.array(z.string().uuid()).min(1).max(25),
  type: ProjectTypeEnum,
  estimated_due_date: z.coerce.date().optional(),
  brief: z.string().max(20000).optional().default(""),
  file_repository_url: FileRepositoryUrlSchema.optional(),
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(3).max(140).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: ParentProjectStatusEnum.optional(),
  estimated_due_date: z.coerce.date().nullable().optional(),
  progress_percent: z.coerce.number().int().min(0).max(100).optional(),
  file_repository_url: FileRepositoryUrlSchema.nullable().optional(),
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
  is_client_visible: z.boolean().optional(),
  client_visible: z.boolean().optional(),
}).transform((val) => ({
  key: val.key,
  title: val.title,
  position: val.position,
  is_client_visible: val.is_client_visible ?? val.client_visible ?? false,
}));

export const UpdateColumnSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  position: z.number().int().min(0).optional(),
  is_client_visible: z.boolean().optional(),
  client_visible: z.boolean().optional(),
}).transform((val) => ({
  title: val.title,
  position: val.position,
  is_client_visible: val.is_client_visible ?? val.client_visible,
}));

export const AssigneeSchema = z.object({
  user_sub: z.string().uuid(),
  user_email: z.string().email().max(255).optional(),
});

export const SubtaskSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(255),
  is_completed: z.boolean().optional().default(false),
  assignee_sub: z.string().uuid().nullable().optional(),
  position: z.number().int().min(0).optional(),
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

const MentionItemSchema = z.union([
  z.string().uuid(),
  z.object({
    user_sub: z.string().uuid(),
    user_email: z.string().email().optional(),
  }),
]);

export const CreateChatMessageSchema = z.object({
  body: z.string().trim().min(1).max(5_000).optional(),
  content: z.string().trim().min(1).max(5_000).optional(),
  mentions: z.array(MentionItemSchema).max(25).optional(),
}).refine((val) => Boolean(val.body || val.content), {
  message: "Debes enviar body o content",
}).transform((val) => ({
  body: val.body ?? val.content ?? "",
  mentions: val.mentions?.map((m) => (typeof m === "string" ? m : m.user_sub)),
}));

export const MarkChatReadSchema = z.object({
  up_to_message_id: z.string().uuid().optional(),
  last_message_id: z.string().uuid().optional(),
  message_ids: z.array(z.string().uuid()).max(200).optional(),
}).refine((v) => Boolean(v.up_to_message_id || v.last_message_id || (v.message_ids && v.message_ids.length > 0)), {
  message: "Debes enviar up_to_message_id, last_message_id o message_ids",
}).transform((v) => ({
  up_to_message_id: v.up_to_message_id ?? v.last_message_id,
  message_ids: v.message_ids,
}));

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

export const GenerateUploadUrlSchema = z.preprocess((val: any) => {
  if (val && typeof val === "object") {
    const copy = { ...val };
    if ("fileName" in copy && !("file_name" in copy)) {
      copy.file_name = copy.fileName;
    }
    if ("mimeType" in copy && !("mime_type" in copy)) {
      copy.mime_type = copy.mimeType;
    }
    if ("sizeBytes" in copy && !("size_bytes" in copy)) {
      copy.size_bytes = copy.sizeBytes;
    }
    return copy;
  }
  return val;
}, z.object({
  file_name: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(120),
  size_bytes: z.coerce.number().int().min(1).max(25 * 1024 * 1024, {
    message: "El archivo supera el límite de 25 MB",
  }),
}));

export const BriefPatchSchema = z.object({
  body: z.string().min(1).max(20000),
});

const ContractCommonSchema = z.object({
  provider_kind: ContractProviderKindEnum,
  provider_name: z.string().trim().min(2).max(200),
  provider_tax_id: z.string().trim().max(80).nullable().optional(),
  provider_representative: z.string().trim().max(200).nullable().optional(),
  provider_representative_document: z.string().trim().max(80).nullable().optional(),
  client_kind: ContractClientKindEnum,
  client_name: z.string().trim().min(2).max(200),
  client_document: z.string().trim().max(80).nullable().optional(),
  client_company_name: z.string().trim().max(200).nullable().optional(),
  client_tax_id: z.string().trim().max(80).nullable().optional(),
  client_representative: z.string().trim().max(200).nullable().optional(),
  client_representative_document: z.string().trim().max(80).nullable().optional(),
  client_email: z.string().trim().email().max(255),
  client_phone: z.string().trim().max(50).nullable().optional(),
  plan_name: z.string().trim().min(2).max(160),
  monthly_fee: z.coerce.number().int().min(0).max(9_999_999_999),
  currency: z.literal("COP").default("COP"),
  tax_included: z.boolean().default(true),
  term_months: z.coerce.number().int().min(1).max(120),
  service_scope: z.string().trim().min(10).max(10_000),
  additional_terms: z.string().trim().max(20_000).nullable().optional(),
  signature_city: z.string().trim().min(2).max(120).default("Bogotá, D.C."),
}).superRefine((value, ctx) => {
  if (value.provider_kind === "cima") {
    for (const field of ["provider_tax_id", "provider_representative", "provider_representative_document"] as const) {
      if (!value[field]?.trim()) ctx.addIssue({ code: "custom", path: [field], message: "Este dato es obligatorio para CIMA" });
    }
  }
  if (value.client_kind === "natural" && !value.client_document?.trim()) {
    ctx.addIssue({ code: "custom", path: ["client_document"], message: "El documento del cliente es obligatorio" });
  }
  if (value.client_kind === "juridical") {
    for (const field of ["client_company_name", "client_tax_id", "client_representative", "client_representative_document"] as const) {
      if (!value[field]?.trim()) ctx.addIssue({ code: "custom", path: [field], message: "Este dato es obligatorio para una persona jurídica" });
    }
  }
});

export const UpsertProjectContractSchema = ContractCommonSchema;
export const RequestContractSignatureSchema = z.object({});
export const SignProjectContractSchema = z.object({
  signer_name: z.string().trim().min(2).max(200),
  signature_data_url: z.string().regex(/^data:image\/png;base64,/, "La firma debe ser una imagen PNG").max(400_000),
  accept_terms: z.literal(true),
});

export const AmendmentIdParamSchema = z.object({
  projectId: z.string().uuid(),
  amendmentId: z.string().uuid(),
});

export const CreateAmendmentDraftSchema = z.object({
  title: z.string().trim().min(3).max(255),
  amendment_type: z.enum(["services", "economic", "extension", "mixed"]).default("services"),
  service_scope: z.string().trim().min(5).max(10_000),
  additional_fee: z.number().int().min(0).default(0),
  fee_payment_type: z.enum(["one_time", "monthly_recurring"]).default("one_time"),
  term_months_extension: z.number().int().min(0).max(120).default(0),
  additional_terms: z.string().trim().max(5000).optional().nullable(),
  signature_city: z.string().trim().min(2).max(120).default("Bogotá, D.C."),
  client_request_notes: z.string().trim().max(2000).optional().nullable(),
});

export const RequestClientAmendmentSchema = z.object({
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().min(5).max(3000),
});

export const SignAmendmentSchema = z.object({
  signer_name: z.string().trim().min(2).max(200),
  signature_data_url: z.string().regex(/^data:image\/png;base64,/, "La firma debe ser una imagen PNG").max(400_000),
  accept_terms: z.literal(true),
});
export const CreateMinorChangeRequestSchema = z.object({
  task_id: z.string().uuid().optional(),
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(1).max(300),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

export const CreateFormalChangeRequestSchema = z.object({
  task_id: z.string().uuid().optional(),
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(1).max(5000),
  justification: z.string().min(1).max(3000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

export const ResolveChangeRequestSchema = z.object({
  status: ChangeRequestStatusEnum.refine((s) => s !== "open", "El estado debe cerrar o escalar la solicitud"),
  comment: z.string().max(2000).optional(),
});

export const ListChangeRequestsQuerySchema = z.object({
  type: ChangeRequestTypeEnum.optional(),
  status: ChangeRequestStatusEnum.optional(),
});

export type ProjectFiltersQuery = z.infer<typeof ProjectFiltersQuerySchema>;
export type ProjectTasksQuery = z.infer<typeof ProjectTasksQuerySchema>;
export type ChatMessageQuery = z.infer<typeof ChatMessageQuerySchema>;
export type ProjectFilesQuery = z.infer<typeof ProjectFilesQuerySchema>;
export type FormalChangeLogQuery = z.infer<typeof FormalChangeLogQuerySchema>;
export type ListChangeRequestsQuery = z.infer<typeof ListChangeRequestsQuerySchema>;
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
export type UpsertProjectContractBody = z.infer<typeof UpsertProjectContractSchema>;
export type SignProjectContractBody = z.infer<typeof SignProjectContractSchema>;
export type CreateMinorChangeRequestBody = z.infer<typeof CreateMinorChangeRequestSchema>;
export type CreateFormalChangeRequestBody = z.infer<typeof CreateFormalChangeRequestSchema>;
export type ResolveChangeRequestBody = z.infer<typeof ResolveChangeRequestSchema>;
export type CreateTaskCommentBody = z.infer<typeof CreateTaskCommentSchema>;
export type GenerateUploadUrlBody = z.infer<typeof GenerateUploadUrlSchema>;
export type CreateAmendmentDraftBody = z.infer<typeof CreateAmendmentDraftSchema>;
export type RequestClientAmendmentBody = z.infer<typeof RequestClientAmendmentSchema>;
export type SignAmendmentBody = z.infer<typeof SignAmendmentSchema>;
