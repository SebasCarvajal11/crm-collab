import type { DbOrTx } from "../shared/db.types";
import { and, desc, eq } from "drizzle-orm";
import { projectChangeRequests } from "../../../db/schema";
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

  listChangeRequestsByProject: async (projectId: string, type?: "minor" | "formal") =>
    conn
      .select()
      .from(projectChangeRequests)
      .where(
        and(eq(projectChangeRequests.projectId, projectId), type ? eq(projectChangeRequests.type, type) : undefined)
      )
      .orderBy(desc(projectChangeRequests.createdAt)),

  updateChangeRequestById: async (
    changeRequestId: string,
    patch: Partial<
      Pick<
        NewProjectChangeRequest,
        "status" | "resolvedBySub" | "escalatedByWorkerSub" | "description" | "justification" | "title"
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
});
