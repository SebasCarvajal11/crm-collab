import { and, eq, inArray, sql } from "drizzle-orm";
import type { DbOrTx } from "../shared/db.types";
import { collabOutbox } from "../../../db/schema";
import { traceStorage } from "../../../shared/logger";

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

  claimPendingCollabOutboxEvents: async (opts: {
    limit: number;
    claimToken: string;
    now?: Date;
    claimTimeoutMs: number;
  }) => {
    const now = opts.now ?? new Date();
    const expiredClaimAt = new Date(now.getTime() - opts.claimTimeoutMs);
    const result = await conn.execute(sql`
      WITH candidates AS (
        SELECT id, created_at
        FROM schema_collab.collab_outbox
        WHERE (
          (status IN ('pending', 'failed') AND available_at <= ${now})
          OR (status = 'processing' AND claimed_at <= ${expiredClaimAt})
        )
        ORDER BY created_at ASC
        LIMIT ${opts.limit}
        FOR UPDATE SKIP LOCKED
      )
      ), claimed AS (
        UPDATE schema_collab.collab_outbox AS outbox
        SET
          status = 'processing',
          claim_token = ${opts.claimToken}::uuid,
          claimed_at = ${now},
          updated_at = ${now}
        FROM candidates
        WHERE outbox.id = candidates.id
        RETURNING outbox.*
      )
      SELECT claimed.*
      FROM claimed
      INNER JOIN candidates ON candidates.id = claimed.id
      ORDER BY candidates.created_at ASC
    `);
    return (result.rows ?? []) as Array<typeof collabOutbox.$inferSelect>;
  },

  countPendingCollabOutboxEvents: async (now = new Date()) => {
    const [row] = await conn
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(collabOutbox)
      .where(sql`
        (${collabOutbox.status} IN ('pending', 'failed') AND ${collabOutbox.availableAt} <= ${now})
        OR ${collabOutbox.status} = 'processing'
      `);
    return row?.count ?? 0;
  },

  markCollabOutboxPublished: async (ids: string[], claimToken: string) => {
    if (!ids.length) return [];
    return conn
      .update(collabOutbox)
      .set({
        status: "published",
        publishedAt: new Date(),
        updatedAt: new Date(),
        lastError: null,
        claimToken: null,
        claimedAt: null,
      })
      .where(and(
        inArray(collabOutbox.id, ids),
        eq(collabOutbox.status, "processing"),
        eq(collabOutbox.claimToken, claimToken),
      ))
      .returning({ id: collabOutbox.id });
  },

  markCollabOutboxFailed: async (id: string, claimToken: string, error: unknown) => {
    const [row] = await conn
      .update(collabOutbox)
      .set({
        status: "failed",
        attempts: sql`${collabOutbox.attempts} + 1`,
        availableAt: sql`NOW() + (LEAST(300, POWER(2, GREATEST(0, ${collabOutbox.attempts})) * 5) * INTERVAL '1 second')`,
        updatedAt: new Date(),
        lastError: compactError(error),
        claimToken: null,
        claimedAt: null,
      })
      .where(and(
        eq(collabOutbox.id, id),
        eq(collabOutbox.status, "processing"),
        eq(collabOutbox.claimToken, claimToken),
      ))
      .returning({ id: collabOutbox.id });
    return Boolean(row);
  },
});
