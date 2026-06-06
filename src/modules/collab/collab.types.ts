import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type {
  projects,
  projectMembers,
  projectTaskColumns,
  projectTasks,
  projectChatMessages,
  projectFiles,
  projectBriefs,
  projectChangeRequests,
  projectBriefChangeLog,
  projectTaskAssignees,
  projectTaskComments,
  projectChatMessageReads,
  projectMentionNotifications,
  userIdentitySnapshots,
} from "../../db/schema";

export type Project = InferSelectModel<typeof projects>;
export type NewProject = InferInsertModel<typeof projects>;
export type ProjectMember = InferSelectModel<typeof projectMembers>;
export type NewProjectMember = InferInsertModel<typeof projectMembers>;
export type ProjectTaskColumn = InferSelectModel<typeof projectTaskColumns>;
export type NewProjectTaskColumn = InferInsertModel<typeof projectTaskColumns>;
export type ProjectTask = InferSelectModel<typeof projectTasks>;
export type NewProjectTask = InferInsertModel<typeof projectTasks>;
export type ProjectChatMessage = InferSelectModel<typeof projectChatMessages>;
export type NewProjectChatMessage = InferInsertModel<typeof projectChatMessages>;
export type ProjectFile = InferSelectModel<typeof projectFiles>;
export type NewProjectFile = InferInsertModel<typeof projectFiles>;
export type ProjectBrief = InferSelectModel<typeof projectBriefs>;
export type NewProjectBrief = InferInsertModel<typeof projectBriefs>;
export type ProjectChangeRequest = InferSelectModel<typeof projectChangeRequests>;
export type NewProjectChangeRequest = InferInsertModel<typeof projectChangeRequests>;
export type ProjectBriefChangeLog = InferSelectModel<typeof projectBriefChangeLog>;
export type NewProjectBriefChangeLog = InferInsertModel<typeof projectBriefChangeLog>;

export type ProjectTaskAssignee = InferSelectModel<typeof projectTaskAssignees>;
export type NewProjectTaskAssignee = InferInsertModel<typeof projectTaskAssignees>;
export type ProjectTaskComment = InferSelectModel<typeof projectTaskComments>;
export type NewProjectTaskComment = InferInsertModel<typeof projectTaskComments>;
export type ProjectChatMessageRead = InferSelectModel<typeof projectChatMessageReads>;
export type NewProjectChatMessageRead = InferInsertModel<typeof projectChatMessageReads>;
export type ProjectMentionNotification = InferSelectModel<typeof projectMentionNotifications>;
export type NewProjectMentionNotification = InferInsertModel<typeof projectMentionNotifications>;
export type UserIdentitySnapshot = InferSelectModel<typeof userIdentitySnapshots>;
export type NewUserIdentitySnapshot = InferInsertModel<typeof userIdentitySnapshots>;

export type AuditDetails = Record<string, unknown>;
export type ProjectType = "campaign_service" | "product_order";
export type ParentProjectStatus = "todo" | "in_progress" | "in_review" | "completed";
export type ProjectMemberRole = "admin" | "worker" | "client";
export type GlobalRole = "admin" | "worker" | "client";

/** Archivo del proyecto enriquecido con info de tarea y columna actual (para el tab de archivos) */
export type ProjectFileEnriched = ProjectFile & {
  taskTitle?: string | null;
  currentColumnTitle?: string | null;
};
