import {
  pgSchema,
  uuid,
  varchar,
  timestamp,
  text,
  integer,
  boolean,
  jsonb,
  bigserial,
  primaryKey,
  uniqueIndex,
  index,
  bigint,
  serial,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

export const collabSchema = pgSchema("schema_collab");

export const schemaVersion = collabSchema.table("schema_version", {
  id: serial("id").primaryKey(),
  version: varchar("version", { length: 50 }).notNull(),
  appliedBy: varchar("applied_by", { length: 100 }).notNull(),
  appliedAt: timestamp("applied_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  source: varchar("source", { length: 255 }).notNull(),
});

export const projectTypeEnum = collabSchema.enum("project_type", ["campaign_service", "product_order"]);

export const parentProjectStatusEnum = collabSchema.enum("parent_project_status", [
  "todo",
  "in_progress",
  "in_review",
  "completed",
]);

export const projectMemberRoleEnum = collabSchema.enum("project_member_role", [
  "admin",
  "worker",
  "client",
]);

export const taskPriorityEnum = collabSchema.enum("task_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);

export const taskColumnKeyEnum = collabSchema.enum("task_column_key", [
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

export const chatChannelEnum = collabSchema.enum("chat_channel", ["internal", "external", "system"]);

export const chatMessageTypeEnum = collabSchema.enum("chat_message_type", [
  "text",
  "minor_request",
  "formal_request",
  "milestone",
]);

export const changeRequestTypeEnum = collabSchema.enum("change_request_type", ["minor", "formal"]);
export const changeRequestStatusEnum = collabSchema.enum("change_request_status", [
  "open",
  "accepted",
  "rejected",
  "escalated",
  "approved",
]);

export const fileOriginEnum = collabSchema.enum("file_origin", ["internal_chat", "external_chat", "manual_upload"]);
export const fileFolderEnum = collabSchema.enum("file_folder", [
  "mockups",
  "final_arts",
  "briefs",
  "contracts",
  "shared_deliverables",
]);

export const contractStatusEnum = collabSchema.enum("contract_status", ["draft", "pending_signature", "signed"]);
export const contractProviderKindEnum = collabSchema.enum("contract_provider_kind", ["cima", "independent"]);
export const contractClientKindEnum = collabSchema.enum("contract_client_kind", ["natural", "juridical"]);
export const amendmentTypeEnum = collabSchema.enum("amendment_type", [
  "services",
  "economic",
  "extension",
  "mixed",
]);
export const amendmentFeePaymentTypeEnum = collabSchema.enum("amendment_fee_payment_type", [
  "one_time",
  "monthly_recurring",
]);

export const projects = collabSchema.table(
  "projects",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    name: varchar("name", { length: 140 }).notNull(),
    description: text("description"),
    clientName: varchar("client_name", { length: 160 }).notNull(),
    clientSub: uuid("client_sub"),
    type: projectTypeEnum("type").notNull(),
    status: parentProjectStatusEnum("status").default("todo").notNull(),
    progressPercent: integer("progress_percent").default(0).notNull(),
    adminResponsibleSub: uuid("admin_responsible_sub").notNull(),
    estimatedDueDate: timestamp("estimated_due_date", { mode: "date" }),
    unreadNotifications: integer("unread_notifications").default(0).notNull(),
    latestApprovedFileId: uuid("latest_approved_file_id"),
    /** Enlace a Drive, OneDrive u otro repositorio externo de archivos pesados. */
    fileRepositoryUrl: text("file_repository_url"),
    isArchived: boolean("is_archived").default(false).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("project_name_admin_uq").on(t.adminResponsibleSub, t.name),
    index("idx_projects_active_updated").on(t.isArchived, t.updatedAt),
  ]
);

export const projectMembers = collabSchema.table(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userSub: uuid("user_sub").notNull(),
    role: projectMemberRoleEnum("role").notNull(),
    userEmail: varchar("user_email", { length: 255 }),
    lastSeenAt: timestamp("last_seen_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userSub] }),
    index("idx_project_members_user_project").on(t.userSub, t.projectId),
  ]
);

export const projectTaskColumns = collabSchema.table(
  "project_task_columns",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: taskColumnKeyEnum("key").notNull(),
    title: varchar("title", { length: 80 }).notNull(),
    position: integer("position").notNull(),
    isClientVisible: boolean("is_client_visible").default(false).notNull(),
    isDefault: boolean("is_default").default(true).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_project_task_columns_project_id").on(t.projectId),
    uniqueIndex("uq_project_task_columns_project_key").on(t.projectId, t.key),
  ]
);

export const projectTasks = collabSchema.table(
  "project_tasks",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    columnId: uuid("column_id")
      .notNull()
      .references(() => projectTaskColumns.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    priority: taskPriorityEnum("priority").default("medium").notNull(),
    assigneeSub: uuid("assignee_sub"),
    reporterSub: uuid("reporter_sub").notNull(),
    deadline: timestamp("deadline", { mode: "date" }),
    checklistProgress: integer("checklist_progress").default(0).notNull(),
    blockedByTaskId: uuid("blocked_by_task_id"),
    blockReason: text("block_reason"),
    blockType: varchar("block_type", { length: 30 }),
    blockedAt: timestamp("blocked_at", { mode: "date", withTimezone: true }),
    blockedBySub: uuid("blocked_by_sub"),
    clientApprovalRequestedAt: timestamp("client_approval_requested_at", { mode: "date", withTimezone: true }),
    isClientVisible: boolean("is_client_visible").default(false).notNull(),
    position: integer("position").notNull(),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_project_tasks_project_id").on(t.projectId),
    index("idx_project_tasks_project_column_position").on(t.projectId, t.columnId, t.position, t.createdAt),
    index("idx_project_tasks_project_position_created").on(t.projectId, t.position, t.createdAt),
    index("idx_project_tasks_project_client_position").on(t.projectId, t.isClientVisible, t.position, t.createdAt),
  ]
);

export const projectSubtasks = collabSchema.table(
  "project_subtasks",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    taskId: uuid("task_id")
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    isCompleted: boolean("is_completed").default(false).notNull(),
    assigneeSub: uuid("assignee_sub"),
    position: integer("position").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("idx_project_subtasks_task_id").on(t.taskId)]
);

export const projectChatMessages = collabSchema.table(
  "project_chat_messages",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    channel: chatChannelEnum("channel").notNull(),
    messageType: chatMessageTypeEnum("message_type").default("text").notNull(),
    authorSub: uuid("author_sub"),
    authorEmail: varchar("author_email", { length: 255 }),
    body: text("body").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_project_chat_messages_project_id").on(t.projectId),
    index("idx_project_chat_messages_project_channel_created").on(t.projectId, t.channel, t.createdAt),
    index("idx_project_chat_messages_author_sub").on(t.authorSub),
  ]
);

export const projectChatMentions = collabSchema.table(
  "project_chat_mentions",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => projectChatMessages.id, { onDelete: "cascade" }),
    userSub: uuid("user_sub").notNull(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userSub] })]
);

export const projectChatMessageReads = collabSchema.table(
  "project_chat_message_reads",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => projectChatMessages.id, { onDelete: "cascade" }),
    userSub: uuid("user_sub").notNull(),
    readAt: timestamp("read_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.userSub] }),
    index("idx_project_chat_message_reads_user_sub").on(t.userSub),
  ]
);

export const projectMentionNotifications = collabSchema.table(
  "project_mention_notifications",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => projectChatMessages.id, { onDelete: "cascade" }),
    channel: chatChannelEnum("channel").notNull(),
    recipientSub: uuid("recipient_sub").notNull(),
    authorSub: uuid("author_sub"),
    authorEmail: varchar("author_email", { length: 255 }),
    messagePreview: varchar("message_preview", { length: 240 }).notNull(),
    isSeen: boolean("is_seen").default(false).notNull(),
    seenAt: timestamp("seen_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_mention_notification_message_recipient").on(t.messageId, t.recipientSub),
    index("idx_mention_notification_recipient_seen").on(t.recipientSub, t.isSeen),
    index("idx_mention_notification_created_at").on(t.createdAt),
    index("idx_mention_notification_author_sub").on(t.authorSub),
    index("idx_mention_notification_seen_at").on(t.isSeen, t.seenAt),
  ]
);

/**
 * Inbox persistente de actividad de proyecto. A diferencia de las menciones,
 * no depende de un mensaje de chat y conserva la visibilidad que tenía el
 * recurso cuando se generó el evento.
 */
export const projectActivityNotifications = collabSchema.table(
  "project_activity_notifications",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    eventId: uuid("event_id").notNull(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    recipientSub: uuid("recipient_sub").notNull(),
    actorSub: uuid("actor_sub"),
    channel: chatChannelEnum("channel").notNull(),
    kind: varchar("kind", { length: 80 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: varchar("body", { length: 300 }).notNull(),
    resourceType: varchar("resource_type", { length: 80 }).notNull(),
    resourceId: varchar("resource_id", { length: 255 }),
    isSeen: boolean("is_seen").default(false).notNull(),
    seenAt: timestamp("seen_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_activity_notification_event_recipient").on(t.eventId, t.recipientSub),
    index("idx_activity_notification_recipient_seen_created").on(t.recipientSub, t.isSeen, t.createdAt),
    index("idx_activity_notification_project_created").on(t.projectId, t.createdAt),
    index("idx_activity_notification_seen_at").on(t.isSeen, t.seenAt),
  ]
);

export const projectFiles = collabSchema.table(
  "project_files",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** FK opcional a la tarea que originó este archivo (carga desde tarea). */
    taskId: uuid("task_id").references(() => projectTasks.id, { onDelete: "set null" }),
    /** Título legible del archivo (obligatorio cuando se sube desde una tarea). */
    title: varchar("title", { length: 200 }),
    /** Descripción del archivo (obligatorio cuando se sube desde una tarea). */
    description: text("description"),
    origin: fileOriginEnum("origin").notNull(),
    folder: fileFolderEnum("folder").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    storagePath: text("storage_path").notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).default(0).notNull(),
    version: integer("version").default(1).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    isClientVisible: boolean("is_client_visible").default(false).notNull(),
    approvedByClient: boolean("approved_by_client").default(false).notNull(),
    approvedBySub: uuid("approved_by_sub"),
    approvedAt: timestamp("approved_at", { mode: "date" }),
    createdBySub: uuid("created_by_sub").notNull(),
    createdByEmail: varchar("created_by_email", { length: 255 }),
    isPurged: boolean("is_purged").default(false).notNull(),
    purgedAt: timestamp("purged_at", { mode: "date" }),
    purgedBySub: uuid("purged_by_sub"),
    purgedReason: varchar("purged_reason", { length: 255 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_project_files_storage_path").on(t.storagePath),
    index("idx_project_files_project_id").on(t.projectId),
    index("idx_project_files_project_client_created").on(t.projectId, t.isClientVisible, t.createdAt),
    index("idx_project_files_task_id").on(t.taskId),
    index("idx_project_files_created_by_sub").on(t.createdBySub),
    uniqueIndex("uq_project_files_project_name_version").on(t.projectId, t.fileName, t.version),
    index("idx_project_files_purged").on(t.isPurged, t.sizeBytes),
    index("idx_project_files_project_folder").on(t.projectId, t.folder, t.isPurged),
  ]
);

// ─── Asignados de tarea (múltiples trabajadores por tarea) ─────────────────

export const projectTaskAssignees = collabSchema.table(
  "project_task_assignees",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    userSub: uuid("user_sub").notNull(),
    userEmail: varchar("user_email", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.userSub] }),
    index("idx_task_assignees_task_id").on(t.taskId),
    index("idx_task_assignees_user_sub").on(t.userSub),
  ]
);

// ─── Comentarios de tarea ──────────────────────────────────────────────────

export const projectTaskComments = collabSchema.table(
  "project_task_comments",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    taskId: uuid("task_id")
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    authorSub: uuid("author_sub").notNull(),
    authorEmail: varchar("author_email", { length: 255 }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_task_comments_task_id").on(t.taskId),
    index("idx_task_comments_author_sub").on(t.authorSub),
  ]
);

export const projectBriefs = collabSchema.table("project_briefs", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  content: text("content").notNull().default(""),
  updatedBySub: uuid("updated_by_sub").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const projectChangeRequests = collabSchema.table(
  "project_change_requests",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => projectTasks.id, { onDelete: "set null" }),
    type: changeRequestTypeEnum("type").notNull(),
    status: changeRequestStatusEnum("status").default("open").notNull(),
    requestedBySub: uuid("requested_by_sub").notNull(),
    resolvedBySub: uuid("resolved_by_sub"),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    justification: text("justification"),
    priority: varchar("priority", { length: 20 }).default("medium").notNull(),
    resolutionComment: text("resolution_comment"),
    channelMessageId: uuid("channel_message_id"),
    escalatedByWorkerSub: uuid("escalated_by_worker_sub"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { mode: "date" }),
  },
  (t) => [
    index("idx_project_change_requests_project_id").on(t.projectId),
    index("idx_project_change_requests_project_type_created").on(t.projectId, t.type, t.createdAt),
    index("idx_project_change_requests_timeline").on(t.projectId, t.status, t.resolvedAt),
  ]
);

export const projectBriefChangeLog = collabSchema.table(
  "project_brief_change_log",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    requestedBySub: uuid("requested_by_sub").notNull(),
    approvedBySub: uuid("approved_by_sub"),
    description: text("description").notNull(),
    sourceChangeRequestId: uuid("source_change_request_id").references(() => projectChangeRequests.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("idx_project_brief_change_log_project_id").on(t.projectId)]
);

/**
 * Un contrato por proyecto. La configuración editable vive en el borrador;
 * al solicitar firma se guarda un snapshot inmutable que se firma y audita.
 */
export const projectContracts = collabSchema.table(
  "project_contracts",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: contractStatusEnum("status").default("draft").notNull(),
    providerKind: contractProviderKindEnum("provider_kind").default("cima").notNull(),
    providerName: varchar("provider_name", { length: 200 }).notNull(),
    providerTaxId: varchar("provider_tax_id", { length: 80 }),
    providerRepresentative: varchar("provider_representative", { length: 200 }),
    providerRepresentativeDocument: varchar("provider_representative_document", { length: 80 }),
    clientKind: contractClientKindEnum("client_kind").notNull(),
    clientName: varchar("client_name", { length: 200 }).notNull(),
    clientDocument: varchar("client_document", { length: 80 }),
    clientCompanyName: varchar("client_company_name", { length: 200 }),
    clientTaxId: varchar("client_tax_id", { length: 80 }),
    clientRepresentative: varchar("client_representative", { length: 200 }),
    clientRepresentativeDocument: varchar("client_representative_document", { length: 80 }),
    clientEmail: varchar("client_email", { length: 255 }).notNull(),
    clientPhone: varchar("client_phone", { length: 50 }),
    planName: varchar("plan_name", { length: 160 }).notNull(),
    monthlyFee: integer("monthly_fee").notNull(),
    currency: varchar("currency", { length: 3 }).default("COP").notNull(),
    taxIncluded: boolean("tax_included").default(true).notNull(),
    termMonths: integer("term_months").notNull(),
    serviceScope: text("service_scope").notNull(),
    additionalTerms: text("additional_terms"),
    contentSnapshot: text("content_snapshot"),
    contentHash: varchar("content_hash", { length: 64 }),
    preparedBySub: uuid("prepared_by_sub").notNull(),
    requestedSignatureAt: timestamp("requested_signature_at", { mode: "date" }),
    signedAt: timestamp("signed_at", { mode: "date" }),
    signedBySub: uuid("signed_by_sub"),
    signerName: varchar("signer_name", { length: 200 }),
    signatureDataUrl: text("signature_data_url"),
    consentAcceptedAt: timestamp("consent_accepted_at", { mode: "date" }),
    signedIpAddress: varchar("signed_ip_address", { length: 45 }),
    signedUserAgent: varchar("signed_user_agent", { length: 500 }),
    signatureCity: varchar("signature_city", { length: 120 }).default("Bogotá, D.C.").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_project_contracts_project_id").on(t.projectId),
    index("idx_project_contracts_status").on(t.status),
  ]
);

export const projectContractAmendments = collabSchema.table(
  "project_contract_amendments",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    contractId: uuid("contract_id")
      .notNull()
      .references(() => projectContracts.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    amendmentNumber: integer("amendment_number").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    amendmentType: amendmentTypeEnum("amendment_type").default("services").notNull(),
    status: contractStatusEnum("status").default("draft").notNull(),
    serviceScope: text("service_scope").notNull(),
    additionalFee: integer("additional_fee").default(0).notNull(),
    feePaymentType: amendmentFeePaymentTypeEnum("fee_payment_type").default("one_time").notNull(),
    termMonthsExtension: integer("term_months_extension").default(0).notNull(),
    additionalTerms: text("additional_terms"),
    clientRequestNotes: text("client_request_notes"),
    contentSnapshot: text("content_snapshot"),
    contentHash: varchar("content_hash", { length: 64 }),
    preparedBySub: uuid("prepared_by_sub").notNull(),
    requestedSignatureAt: timestamp("requested_signature_at", { mode: "date" }),
    signedAt: timestamp("signed_at", { mode: "date" }),
    signedBySub: uuid("signed_by_sub"),
    signerName: varchar("signer_name", { length: 200 }),
    signatureDataUrl: text("signature_data_url"),
    consentAcceptedAt: timestamp("consent_accepted_at", { mode: "date" }),
    signedIpAddress: varchar("signed_ip_address", { length: 45 }),
    signedUserAgent: varchar("signed_user_agent", { length: 500 }),
    signatureCity: varchar("signature_city", { length: 120 }).default("Bogotá, D.C.").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_project_amendment_number").on(t.contractId, t.amendmentNumber),
    index("idx_project_amendments_contract_id").on(t.contractId),
    index("idx_project_amendments_project_id").on(t.projectId),
    index("idx_project_amendments_status").on(t.status),
  ]
);

export const auditLogs = collabSchema.table(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).notNull(),
    actorSub: uuid("actor_sub"),
    actorEmail: varchar("actor_email", { length: 255 }),
    actorRole: varchar("actor_role", { length: 20 }),
    action: varchar("action", { length: 120 }).notNull(),
    resourceType: varchar("resource_type", { length: 80 }).notNull(),
    resourceId: varchar("resource_id", { length: 255 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: varchar("user_agent", { length: 500 }),
    correlationId: uuid("correlation_id"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.id, t.createdAt] })]
);

/**
 * userIdentitySnapshots es una réplica local de solo lectura y consistencia eventual
 * que almacena información de identidad del servicio crm-auth.
 *
 * Al estar desacoplado a nivel de base de datos, el consumidor de eventos que
 * actualiza esta tabla está diseñado para tolerar la presencia de nuevos campos
 * adicionales en los contratos de eventos de identidad, ignorándolos y mapeando
 * solo las columnas definidas aquí.
 */
export const userIdentitySnapshots = collabSchema.table(
  "user_identity_snapshots",
  {
    userSub: uuid("user_sub").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    role: varchar("role", { length: 20 }).notNull(),
    firstName: varchar("first_name", { length: 120 }),
    lastName: varchar("last_name", { length: 120 }),
    clientKind: varchar("client_kind", { length: 20 }),
    companyName: varchar("company_name", { length: 160 }),
    profession: varchar("profession", { length: 160 }),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("idx_user_identity_snapshots_email").on(t.email)]
);

export const mediaAccessCache = collabSchema.table(
  "media_access_cache",
  {
    objectKey: text("object_key").notNull(),
    forceDownload: boolean("force_download").notNull(),
    url: text("url").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.objectKey, t.forceDownload] }),
    index("idx_media_access_cache_expires_at").on(t.expiresAt),
  ],
);

export const collabOutbox = collabSchema.table(
  "collab_outbox",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    projectId: uuid("project_id").notNull(),
    payload: jsonb("payload").notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    availableAt: timestamp("available_at", { mode: "date" }).defaultNow().notNull(),
    claimToken: uuid("claim_token"),
    claimedAt: timestamp("claimed_at", { mode: "date" }),
    publishedAt: timestamp("published_at", { mode: "date" }),
    lastError: varchar("last_error", { length: 1000 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("collab_outbox_status_available_idx").on(t.status, t.availableAt),
    index("collab_outbox_status_claimed_idx").on(t.status, t.claimedAt),
    index("collab_outbox_project_idx").on(t.projectId),
  ]
);

export const projectsRelations = relations(projects, ({ many }) => ({
  members: many(projectMembers),
  columns: many(projectTaskColumns),
  tasks: many(projectTasks),
  chatMessages: many(projectChatMessages),
  files: many(projectFiles),
  changeRequests: many(projectChangeRequests),
  briefChanges: many(projectBriefChangeLog),
  contracts: many(projectContracts),
}));

export const projectColumnsRelations = relations(projectTaskColumns, ({ one, many }) => ({
  project: one(projects, { fields: [projectTaskColumns.projectId], references: [projects.id] }),
  tasks: many(projectTasks),
}));

export const projectTasksRelations = relations(projectTasks, ({ one, many }) => ({
  project: one(projects, { fields: [projectTasks.projectId], references: [projects.id] }),
  column: one(projectTaskColumns, { fields: [projectTasks.columnId], references: [projectTaskColumns.id] }),
  subtasks: many(projectSubtasks),
  assignees: many(projectTaskAssignees),
  comments: many(projectTaskComments),
  files: many(projectFiles),
}));

export const projectSubtasksRelations = relations(projectSubtasks, ({ one }) => ({
  task: one(projectTasks, { fields: [projectSubtasks.taskId], references: [projectTasks.id] }),
}));

export const projectChatMessagesRelations = relations(projectChatMessages, ({ one, many }) => ({
  project: one(projects, { fields: [projectChatMessages.projectId], references: [projects.id] }),
  mentions: many(projectChatMentions),
}));

export const projectChatMentionsRelations = relations(projectChatMentions, ({ one }) => ({
  message: one(projectChatMessages, { fields: [projectChatMentions.messageId], references: [projectChatMessages.id] }),
}));

export const projectTaskAssigneesRelations = relations(projectTaskAssignees, ({ one }) => ({
  task: one(projectTasks, { fields: [projectTaskAssignees.taskId], references: [projectTasks.id] }),
}));

export const projectTaskCommentsRelations = relations(projectTaskComments, ({ one }) => ({
  task: one(projectTasks, { fields: [projectTaskComments.taskId], references: [projectTasks.id] }),
}));
