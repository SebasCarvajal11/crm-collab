import { z } from "zod";

/** v2 añade una instantánea suficiente para construir proyecciones externas. */
export const COLLAB_EVENT_CONTRACT_VERSION = 2 as const;

export const collabEventTypeSchema = z.enum([
  "project.created",
  "project.updated",
  "project.completed",
  "project.member.added",
  "task.created",
  "task.updated",
  "task.moved",
  "task.assigned",
  "chat.message.internal",
  "chat.message.external",
  "chat.mention",
  "change_request.minor.created",
  "change_request.minor.accepted",
  "change_request.minor.rejected",
  "change_request.formal.created",
  "change_request.formal.approved",
  "change_request.formal.rejected",
  "file.uploaded",
  "file.approved",
  "brief.updated",
]);

export const projectCreatedEventSchema = z.object({
  projectId: z.string().uuid(),
  projectName: z.string().min(1),
  projectType: z.enum(["campaign_service", "product_order"]),
  clientName: z.string().min(1),
  clientSub: z.string().uuid().optional(),
  adminResponsibleSub: z.string().uuid(),
});

/**
 * Contrato de integración para consumidores que no poseen el agregado
 * Project. Evita consultas cruzadas a la base de datos de Collab.
 */
export const projectProjectionEventSchema = z.object({
  projectId: z.string().uuid(),
  projectName: z.string().min(1),
  projectType: z.enum(["campaign_service", "product_order"]),
  clientName: z.string().min(1),
  clientSub: z.string().uuid().optional(),
  adminResponsibleSub: z.string().uuid(),
  status: z.enum(["todo", "in_progress", "in_review", "completed"]),
  description: z.string().nullable(),
  progressPercent: z.number().int().min(0).max(100),
  isArchived: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const taskMovedEventSchema = z.object({
  taskId: z.string().uuid(),
  taskTitle: z.string().min(1),
  fromColumnKey: z.string().min(1),
  toColumnKey: z.string().min(1),
  assigneeSub: z.string().uuid().optional(),
});

export const taskAssignedEventSchema = z.object({
  taskId: z.string().uuid(),
  taskTitle: z.string().min(1),
  assigneeSub: z.string().uuid(),
  previousAssigneeSub: z.string().uuid().optional(),
});

export const chatMentionEventSchema = z.object({
  messageId: z.string().uuid(),
  channel: z.enum(["internal", "external"]),
  mentionedSubs: z.array(z.string().uuid()),
  body: z.string().min(1),
});

export const minorChangeRequestCreatedEventSchema = z.object({
  changeRequestId: z.string().uuid(),
  taskId: z.string().uuid(),
  taskTitle: z.string().min(1),
  requestedBySub: z.string().uuid(),
  title: z.string().min(1),
  description: z.string(),
});

export const minorChangeRequestResolvedEventSchema = z.object({
  changeRequestId: z.string().uuid(),
  taskId: z.string().uuid(),
  status: z.enum(["accepted", "rejected", "escalated"]),
  resolvedBySub: z.string().uuid(),
});

export const formalChangeRequestCreatedEventSchema = z.object({
  changeRequestId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  requestedBySub: z.string().uuid(),
  title: z.string().min(1),
  description: z.string(),
  justification: z.string(),
});

export const formalChangeRequestApprovedEventSchema = z.object({
  changeRequestId: z.string().uuid(),
  approvedBySub: z.string().uuid(),
  title: z.string().min(1),
  affectsScope: z.boolean(),
});

export const fileApprovedEventSchema = z.object({
  fileId: z.string().uuid(),
  fileName: z.string().min(1),
  folder: z.string().min(1),
  approvedBySub: z.string().uuid(),
});

export const collabEventSchema = z.object({
  version: z.literal(1).default(1),
  contractVersion: z.union([z.literal(1), z.literal(COLLAB_EVENT_CONTRACT_VERSION)]).default(COLLAB_EVENT_CONTRACT_VERSION),
  type: collabEventTypeSchema,
  projectId: z.string().uuid(),
  actorSub: z.string().uuid(),
  timestamp: z.string().datetime({ offset: true }),
  traceId: z.string().optional(),
  correlationId: z.string().uuid().optional(),
  data: z.union([
    projectCreatedEventSchema,
    projectProjectionEventSchema,
    taskMovedEventSchema,
    taskAssignedEventSchema,
    chatMentionEventSchema,
    minorChangeRequestCreatedEventSchema,
    minorChangeRequestResolvedEventSchema,
    formalChangeRequestCreatedEventSchema,
    formalChangeRequestApprovedEventSchema,
    fileApprovedEventSchema,
    z.record(z.string(), z.unknown()),
  ]),
});

export type CollabEventType = z.infer<typeof collabEventTypeSchema>;
export type CollabEvent = z.infer<typeof collabEventSchema>;
export type ProjectCreatedEvent = z.infer<typeof projectCreatedEventSchema>;
export type ProjectProjectionEvent = z.infer<typeof projectProjectionEventSchema>;
export type TaskMovedEvent = z.infer<typeof taskMovedEventSchema>;
export type TaskAssignedEvent = z.infer<typeof taskAssignedEventSchema>;
export type ChatMentionEvent = z.infer<typeof chatMentionEventSchema>;
export type MinorChangeRequestCreatedEvent = z.infer<typeof minorChangeRequestCreatedEventSchema>;
export type MinorChangeRequestResolvedEvent = z.infer<typeof minorChangeRequestResolvedEventSchema>;
export type FormalChangeRequestCreatedEvent = z.infer<typeof formalChangeRequestCreatedEventSchema>;
export type FormalChangeRequestApprovedEvent = z.infer<typeof formalChangeRequestApprovedEventSchema>;
export type FileApprovedEvent = z.infer<typeof fileApprovedEventSchema>;
