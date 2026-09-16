import type { DbOrTx } from "../shared/db.types";
import { and, desc, eq } from "drizzle-orm";
import { projectChangeRequests, projects } from "../../../db/schema";
import type { NewProjectChangeRequest } from "../collab.types";

export const createChangeRequestRepository = (conn: DbOrTx) => ({
  createChangeRequest: async (payload: NewProjectChangeRequest) => {
    const [row] = await conn.insert(projectChangeRequests).values(payload).returning();
    return row;
  },

  findChangeRequestById: async (changeRequestId: string) => {
    const [row] = await conn
      .select()
      .from(projectChangeRequests)
      .where(eq(projectChangeRequests.id, changeRequestId))
      .limit(1);
    return row ?? null;
  },

  listChangeRequestsByProject: async (
    projectId: string,
    filters?: "minor" | "formal" | { type?: "minor" | "formal"; status?: "open" | "accepted" | "rejected" | "escalated" | "approved" }
  ) => {
    const typeFilter = typeof filters === "string" ? filters : filters?.type;
    const statusFilter = typeof filters === "object" ? filters?.status : undefined;
    return conn
      .select()
      .from(projectChangeRequests)
      .where(
        and(
          eq(projectChangeRequests.projectId, projectId),
          typeFilter ? eq(projectChangeRequests.type, typeFilter) : undefined,
          statusFilter ? eq(projectChangeRequests.status, statusFilter) : undefined
        )
      )
      .orderBy(desc(projectChangeRequests.createdAt));
  },

  updateChangeRequestById: async (
    changeRequestId: string,
    patch: Partial<
      Pick<
        NewProjectChangeRequest,
        | "status"
        | "resolvedBySub"
        | "escalatedByWorkerSub"
        | "description"
        | "justification"
        | "title"
        | "resolutionComment"
      >
    >
  ) => {
    const [row] = await conn
      .update(projectChangeRequests)
      .set({
        ...patch,
        ...(patch.status && patch.status !== "open" ? { resolvedAt: new Date() } : {}),
      })
      .where(eq(projectChangeRequests.id, changeRequestId))
      .returning();
    return row ?? null;
  },

  listPendingChangeRequestsForAdmin: async () => {
    return conn
      .select({
        id: projectChangeRequests.id,
        projectId: projectChangeRequests.projectId,
        taskId: projectChangeRequests.taskId,
        type: projectChangeRequests.type,
        status: projectChangeRequests.status,
        priority: projectChangeRequests.priority,
        requestedBySub: projectChangeRequests.requestedBySub,
        resolvedBySub: projectChangeRequests.resolvedBySub,
        title: projectChangeRequests.title,
        description: projectChangeRequests.description,
        justification: projectChangeRequests.justification,
        resolutionComment: projectChangeRequests.resolutionComment,
        createdAt: projectChangeRequests.createdAt,
        resolvedAt: projectChangeRequests.resolvedAt,
        projectName: projects.name,
        clientName: projects.clientName,
      })
      .from(projectChangeRequests)
      .innerJoin(projects, eq(projectChangeRequests.projectId, projects.id))
      .where(eq(projectChangeRequests.status, "open"))
      .orderBy(desc(projectChangeRequests.createdAt));
  },
});
