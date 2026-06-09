export type CollabEventType =
  | "project.created"
  | "project.updated"
  | "project.completed"
  | "project.member.added"
  | "task.created"
  | "task.updated"
  | "task.moved"
  | "task.assigned"
  | "chat.message.internal"
  | "chat.message.external"
  | "chat.mention"
  | "change_request.minor.created"
  | "change_request.minor.accepted"
  | "change_request.minor.rejected"
  | "change_request.formal.created"
  | "change_request.formal.approved"
  | "change_request.formal.rejected"
  | "file.uploaded"
  | "file.approved"
  | "brief.updated";

export interface CollabEvent<T = unknown> {
  version: number;
  contractVersion: number;
  type: CollabEventType;
  projectId: string;
  actorSub: string;
  timestamp: Date;
  data: T;
  traceId?: string;
  correlationId?: string;
}

export interface ProjectCreatedEvent {
  projectId: string;
  projectName: string;
  projectType: "campaign_service" | "product_order";
  clientName: string;
  clientSub?: string;
  adminResponsibleSub: string;
}

export interface TaskMovedEvent {
  taskId: string;
  taskTitle: string;
  fromColumnKey: string;
  toColumnKey: string;
  assigneeSub?: string;
}

export interface TaskAssignedEvent {
  taskId: string;
  taskTitle: string;
  assigneeSub: string;
  previousAssigneeSub?: string;
}

export interface ChatMentionEvent {
  messageId: string;
  channel: "internal" | "external";
  mentionedSubs: string[];
  body: string;
}

export interface MinorChangeRequestCreatedEvent {
  changeRequestId: string;
  taskId: string;
  taskTitle: string;
  requestedBySub: string;
  title: string;
  description: string;
}

export interface MinorChangeRequestResolvedEvent {
  changeRequestId: string;
  taskId: string;
  status: "accepted" | "rejected" | "escalated";
  resolvedBySub: string;
}

export interface FormalChangeRequestCreatedEvent {
  changeRequestId: string;
  taskId?: string;
  requestedBySub: string;
  title: string;
  description: string;
  justification: string;
}

export interface FormalChangeRequestApprovedEvent {
  changeRequestId: string;
  approvedBySub: string;
  title: string;
  affectsScope: boolean;
}

export interface FileApprovedEvent {
  fileId: string;
  fileName: string;
  folder: string;
  approvedBySub: string;
}

export type CollabEventPayload =
  | ProjectCreatedEvent
  | TaskMovedEvent
  | TaskAssignedEvent
  | ChatMentionEvent
  | MinorChangeRequestCreatedEvent
  | MinorChangeRequestResolvedEvent
  | FormalChangeRequestCreatedEvent
  | FormalChangeRequestApprovedEvent
  | FileApprovedEvent
  | Record<string, unknown>;
