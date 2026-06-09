import { db } from "../db/connection";
import { getRedisConnection } from "../shared/redis";
import { env } from "../config/env";
import { getLogger, traceStorage } from "../shared/logger";
import { createCollabOutboxRepository } from "../modules/collab/events/collab-outbox.repository";

const logger = getLogger();

export async function runCollabOutbox(): Promise<{ processed: number; failed: number; pending: number }> {
  const redis = getRedisConnection();
  if (!redis) {
    logger.warn("[runCollabOutbox] Redis connection not available");
    return { processed: 0, failed: 0, pending: 0 };
  }

  const repository = createCollabOutboxRepository(db);
  const pending = await repository.listPendingCollabOutboxEvents(env.COLLAB_OUTBOX_BATCH_SIZE);
  if (pending.length === 0) {
    const remaining = await repository.countPendingCollabOutboxEvents();
    return { processed: 0, failed: 0, pending: remaining };
  }

  let processed = 0;
  let failed = 0;

  for (const event of pending) {
    const payload = event.payload as any;
    const traceId = payload?.traceId;
    const correlationId = payload?.correlationId;
    const eventType = event.eventType;
    const version = payload?.version ?? 1;

    const action = async () => {
      try {
        await redis.xadd(
          env.REDIS_STREAMS_KEY,
          "*",
          "payload",
          JSON.stringify(event.payload)
        );
        await redis.hincrby("metrics:events:published", `${eventType}:v${version}`, 1)
          .catch((err) => logger.warn({ err }, "No se pudo incrementar metrica de evento publicado en Redis"));
        logger.info(
          { eventType, eventVersion: version, topic: "event-metrics" },
          `Métrica de evento publicado: ${eventType} v${version}`
        );
        await repository.markCollabOutboxPublished(event.id);
        processed++;
      } catch (err) {
        logger.error({ err, eventId: event.id }, "[runCollabOutbox] Failed to publish event");
        await repository.markCollabOutboxFailed(event.id, err);
        failed++;
      }
    };

    if (traceId) {
      await traceStorage.run({ traceId, correlationId }, action);
    } else {
      await action();
    }
  }

  const remaining = await repository.countPendingCollabOutboxEvents();
  return { processed, failed, pending: remaining };
}
