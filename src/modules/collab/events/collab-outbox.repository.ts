import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { DbOrTx } from "../shared/db.types";
import { collabOutbox } from "../../../db/schema";
import { traceStorage } from "../../../shared/logger";

const RETRYABLE_STATUSES = ["pending", "failed"] as const;

function nextAvailableAt(attempts: number): Date {
  const delaySeconds = Math.min(300, 2 ** Math.max(0, attempts - 1) * 5);
  return new Date(Date.now() + delaySeconds * 1000);
}

function compactError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 1000);
  return String(error).slice(0, 1000);
}

export const createCollabOutboxRepository = (conn: DbOrTx) => ({
  createCollabOutboxEvent: async (
    eventType: string,
    projectId: string,
    payload: Record<string, unknown>
  ) => {
    const store = traceStorage.getStore();
    const finalPayload = {
      ...payload,
      traceId: payload.traceId ?? store?.traceId,
      correlationId: payload.correlationId ?? store?.correlationId,
    };

    await conn.insert(collabOutbox).values({
      eventType,
      projectId,
      payload: finalPayload as any,
    });
  },

  listPendingCollabOutboxEvents: async (limit: number, now = new Date()) => {
    return conn
      .select()
      .from(collabOutbox)
      .where(
        and(
          inArray(collabOutbox.status, [...RETRYABLE_STATUSES]),
          lte(collabOutbox.availableAt, now)
        )
      )
      .orderBy(asc(collabOutbox.createdAt))
      .limit(limit);
  },

  countPendingCollabOutboxEvents: async (now = new Date()) => {
    const [row] = await conn
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(collabOutbox)
      .where(
        and(
          inArray(collabOutbox.status, [...RETRYABLE_STATUSES]),
          lte(collabOutbox.availableAt, now)
        )
      );
    return row?.count ?? 0;
  },

  markCollabOutboxPublished: async (id: string) => {
    await conn
      .update(collabOutbox)
      .set({
        status: "published",
        publishedAt: new Date(),
        updatedAt: new Date(),
        lastError: null,
      })
      .where(eq(collabOutbox.id, id));
  },

  markCollabOutboxFailed: async (id: string, error: unknown) => {
    const [row] = await conn
      .update(collabOutbox)
      .set({
        status: "failed",
        attempts: sql`${collabOutbox.attempts} + 1`,
        updatedAt: new Date(),
        lastError: compactError(error),
      })
      .where(eq(collabOutbox.id, id))
      .returning({ attempts: collabOutbox.attempts });

    await conn
      .update(collabOutbox)
      .set({
        availableAt: nextAvailableAt(row?.attempts ?? 1),
        updatedAt: new Date(),
      })
      .where(eq(collabOutbox.id, id));
  },
});
