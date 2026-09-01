import { sql } from "drizzle-orm";
import { db } from "../db/connection";

const PRUNE_BATCH_SIZE = 1_000;

export async function pruneExpiredMediaAccessCache(now = new Date()): Promise<number> {
  let removed = 0;

  while (true) {
    const result = await db.execute(sql`
      WITH candidates AS (
        SELECT object_key, force_download
        FROM schema_collab.media_access_cache
        WHERE expires_at <= ${now}
        ORDER BY expires_at ASC
        LIMIT ${PRUNE_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM schema_collab.media_access_cache AS cache
      USING candidates
      WHERE cache.object_key = candidates.object_key
        AND cache.force_download = candidates.force_download
    `);
    const batchSize = result.rowCount ?? 0;
    removed += batchSize;
    if (batchSize < PRUNE_BATCH_SIZE) return removed;
  }
}
