import { sql } from "drizzle-orm";
import { db } from "../db/connection";

const DEFAULT_PRUNE_BATCH_SIZE = 500;

export interface PruneCollabOutboxOptions {
  retentionDays?: number;
  now?: Date;
  batchSize?: number;
}

/**
 * Purga en micro-lotes registros en estado 'published' que hayan superado el período de retención.
 */
export async function prunePublishedCollabOutbox(
  options: PruneCollabOutboxOptions = {}
): Promise<number> {
  const {
    retentionDays = 7,
    now = new Date(),
    batchSize = DEFAULT_PRUNE_BATCH_SIZE,
  } = options;

  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);

  let totalRemoved = 0;

  while (true) {
    const result = await db.execute(sql`
      WITH candidates AS (
        SELECT id
        FROM schema_collab.collab_outbox
        WHERE status = 'published'
          AND published_at <= ${cutoff}
        ORDER BY published_at ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM schema_collab.collab_outbox AS outbox
      USING candidates
      WHERE outbox.id = candidates.id
    `);

    const batchCount = result.rowCount ?? 0;
    totalRemoved += batchCount;

    if (batchCount < batchSize) {
      break;
    }
  }

  return totalRemoved;
}
