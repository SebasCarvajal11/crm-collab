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
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const collabSchema = pgSchema("schema_collab");

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

export const projects = collabSchema.table(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    isArchived: boolean("is_archived").default(false).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("project_name_admin_uq").on(t.adminResponsibleSub, t.name)]
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
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.userSub] })]
);

export const projectTaskColumns = collabSchema.table(
  "project_task_columns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
  (t) => [index("idx_project_task_columns_project_id").on(t.projectId)]
);

export const projectTasks = collabSchema.table(
  "project_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    subtasks: jsonb("subtasks"),
    blockedByTaskId: uuid("blocked_by_task_id"),
    isClientVisible: boolean("is_client_visible").default(false).notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_project_tasks_project_id").on(t.projectId),
    index("idx_project_tasks_project_column_position").on(t.projectId, t.columnId, t.position, t.createdAt),
  ]
);

export const projectChatMessages = collabSchema.table(
  "project_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    channel: chatChannelEnum("channel").notNull(),
    messageType: chatMessageTypeEnum("message_type").default("text").notNull(),
    authorSub: uuid("author_sub"),
    authorEmail: varchar("author_email", { length: 255 }),
    body: text("body").notNull(),
    mentionedSubs: jsonb("mentioned_subs"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_project_chat_messages_project_id").on(t.projectId),
    index("idx_project_chat_messages_project_channel_created").on(t.projectId, t.channel, t.createdAt),
  ]
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
    id: uuid("id").primaryKey().defaultRandom(),
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
  ]
);

export const projectFiles = collabSchema.table(
  "project_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_project_files_project_id").on(t.projectId),
    index("idx_project_files_task_id").on(t.taskId),
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
  ]
);

// ─── Comentarios de tarea ──────────────────────────────────────────────────

export const projectTaskComments = collabSchema.table(
  "project_task_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    authorSub: uuid("author_sub").notNull(),
    authorEmail: varchar("author_email", { length: 255 }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [index("idx_task_comments_task_id").on(t.taskId)]
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
    id: uuid("id").primaryKey().defaultRandom(),
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
    channelMessageId: uuid("channel_message_id"),
    escalatedByWorkerSub: uuid("escalated_by_worker_sub"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { mode: "date" }),
  },
  (t) => [index("idx_project_change_requests_project_id").on(t.projectId)]
);

export const projectBriefChangeLog = collabSchema.table(
  "project_brief_change_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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

export const auditLogs = collabSchema.table(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).notNull(),
    actorSub: uuid("actor_sub"),
    action: varchar("action", { length: 120 }).notNull(),
    resourceType: varchar("resource_type", { length: 80 }).notNull(),
    resourceId: uuid("resource_id"),
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: varchar("user_agent", { length: 500 }),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.id, t.createdAt] })]
);

export const projectsRelations = relations(projects, ({ many }) => ({
  members: many(projectMembers),
  columns: many(projectTaskColumns),
  tasks: many(projectTasks),
  chatMessages: many(projectChatMessages),
  files: many(projectFiles),
  changeRequests: many(projectChangeRequests),
  briefChanges: many(projectBriefChangeLog),
}));

export const projectColumnsRelations = relations(projectTaskColumns, ({ one, many }) => ({
  project: one(projects, { fields: [projectTaskColumns.projectId], references: [projects.id] }),
  tasks: many(projectTasks),
}));

export const projectTasksRelations = relations(projectTasks, ({ one, many }) => ({
  project: one(projects, { fields: [projectTasks.projectId], references: [projects.id] }),
  column: one(projectTaskColumns, { fields: [projectTasks.columnId], references: [projectTaskColumns.id] }),
  assignees: many(projectTaskAssignees),
  comments: many(projectTaskComments),
  files: many(projectFiles),
}));

export const projectTaskAssigneesRelations = relations(projectTaskAssignees, ({ one }) => ({
  task: one(projectTasks, { fields: [projectTaskAssignees.taskId], references: [projectTasks.id] }),
}));

export const projectTaskCommentsRelations = relations(projectTaskComments, ({ one }) => ({
  task: one(projectTasks, { fields: [projectTaskComments.taskId], references: [projectTasks.id] }),
}));
