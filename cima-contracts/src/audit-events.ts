import { z } from "zod";

export const AUDIT_EVENT_CONTRACT_VERSION = 1 as const;

export const auditEventSchema = z.object({
  version: z.literal(1).default(1),
  contractVersion: z.literal(AUDIT_EVENT_CONTRACT_VERSION).default(AUDIT_EVENT_CONTRACT_VERSION),
  type: z.literal("audit.event-published"),
  actorSub: z.string().uuid().nullable(),
  actorEmail: z.string().email().nullable().optional(),
  actorRole: z.enum(["admin", "worker", "client"]).nullable().optional(),
  action: z.string().min(1).max(120),
  resourceType: z.string().min(1).max(80),
  resourceId: z.string().nullable().optional(),
  ipAddress: z.string().max(45).nullable().optional(),
  userAgent: z.string().max(500).nullable().optional(),
  correlationId: z.string().uuid().nullable().optional(),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
  timestamp: z.string().datetime({ offset: true }),
  traceId: z.string().optional(),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;

export const auditLogDbSchema = z.object({
  id: z.number().optional(),
  actorSub: z.string().uuid().nullable(),
  actorEmail: z.string().email().nullable().optional(),
  actorRole: z.enum(["admin", "worker", "client"]).nullable().optional(),
  action: z.string().min(1).max(120),
  resourceType: z.string().min(1).max(80),
  resourceId: z.string().nullable().optional(),
  ipAddress: z.string().max(45).nullable().optional(),
  userAgent: z.string().max(500).nullable().optional(),
  correlationId: z.string().uuid().nullable().optional(),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
});

export type AuditLogDb = z.infer<typeof auditLogDbSchema>;
