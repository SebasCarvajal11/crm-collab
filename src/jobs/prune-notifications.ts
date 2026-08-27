import { and, eq, lte } from "drizzle-orm";
import { db } from "../db/connection";
import { projectActivityNotifications, projectMentionNotifications } from "../db/schema";

export async function pruneReadNotifications(retentionDays: number, now = new Date()): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);

  const [activities, mentions] = await Promise.all([
    db
      .delete(projectActivityNotifications)
      .where(and(eq(projectActivityNotifications.isSeen, true), lte(projectActivityNotifications.seenAt, cutoff)))
      .returning({ id: projectActivityNotifications.id }),
    db
      .delete(projectMentionNotifications)
      .where(and(eq(projectMentionNotifications.isSeen, true), lte(projectMentionNotifications.seenAt, cutoff)))
      .returning({ id: projectMentionNotifications.id }),
  ]);

  return activities.length + mentions.length;
}
