import { sql } from "drizzle-orm";
import { db } from "../db/connection";

const PRUNE_BATCH_SIZE = 1_000;

async function pruneTableInBatches(tableName: "project_activity_notifications" | "project_mention_notifications", cutoff: Date) {
  let removed = 0;

  while (true) {
    const result = await db.execute(sql`
      WITH candidates AS (
        SELECT id
        FROM schema_collab.${sql.identifier(tableName)}
        WHERE is_seen = true
          AND seen_at <= ${cutoff}
        ORDER BY seen_at ASC
        LIMIT ${PRUNE_BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM schema_collab.${sql.identifier(tableName)} AS notification
      USING candidates
      WHERE notification.id = candidates.id
    `);
    const batchSize = result.rowCount ?? 0;
    removed += batchSize;
    if (batchSize < PRUNE_BATCH_SIZE) return removed;
  }
}

export async function pruneReadNotifications(retentionDays: number, now = new Date()): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);

  const [activities, mentions] = await Promise.all([
    pruneTableInBatches("project_activity_notifications", cutoff),
    pruneTableInBatches("project_mention_notifications", cutoff),
  ]);

  return activities + mentions;
}
