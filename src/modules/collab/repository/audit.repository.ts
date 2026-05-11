import { db } from "../../../db/connection";
import { auditLogs } from "../../../db/schema";
import type { AuditDetails } from "../collab.types";

export const auditRepository = {
  createAuditLog: async (params: {
    actorSub: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    ipAddress: string;
    userAgent: string;
    details?: AuditDetails;
  }) => {
    await db.insert(auditLogs).values({
      actorSub: params.actorSub,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      details: params.details ?? null,
    });
  },
};
