import { db } from "../db/connection";
import { getRedisConnection } from "../shared/redis";
import { env } from "../config/env";
import { getLogger, traceStorage } from "../shared/logger";
import { createCollabOutboxRepository } from "../modules/collab/events/collab-outbox.repository";
import { randomUUID } from "crypto";

const logger = getLogger();
const OUTBOX_CLAIM_TIMEOUT_MS = 60_000;

export async function runCollabOutbox(): Promise<{ processed: number; failed: number; pending: number }> {
  const redis = getRedisConnection();
  if (!redis) {
    logger.warn("[runCollabOutbox] Redis connection not available");
    return { processed: 0, failed: 0, pending: 0 };
  }

  const repository = createCollabOutboxRepository(db);
  const claimToken = randomUUID();
  const pending = await repository.claimPendingCollabOutboxEvents({
    limit: env.COLLAB_OUTBOX_BATCH_SIZE,
    claimToken,
    claimTimeoutMs: OUTBOX_CLAIM_TIMEOUT_MS,
  });
  if (pending.length === 0) {
    const remaining = await repository.countPendingCollabOutboxEvents();
    return { processed: 0, failed: 0, pending: remaining };
  }

  const publishPipeline = redis.pipeline();
  for (const event of pending) {
    publishPipeline.xadd(
      env.REDIS_STREAMS_KEY,
      "*",
      "payload",
      JSON.stringify(event.payload)
    );
  }

  let publishResults: Array<[Error | null, unknown]>;
  try {
    publishResults = (await publishPipeline.exec()) ?? [];
  } catch (err) {
    publishResults = pending.map(() => [err instanceof Error ? err : new Error(String(err)), null]);
  }

  const publishedIds: string[] = [];
  const failures: Promise<boolean>[] = [];
  const publishedEvents: typeof pending = [];
  for (const [index, event] of pending.entries()) {
    const [publishError] = publishResults[index] ?? [new Error("Redis no devolvió resultado de publicación")];
    if (publishError) {
      logger.error({ err: publishError, eventId: event.id }, "[runCollabOutbox] Failed to publish event");
      failures.push(repository.markCollabOutboxFailed(event.id, claimToken, publishError));
      continue;
    }
    publishedIds.push(event.id);
    publishedEvents.push(event);
  }

  const metricsPipeline = redis.pipeline();
  for (const event of publishedEvents) {
    const payload = event.payload as any;
    const eventType = event.eventType;
    const version = payload?.version ?? 1;
    metricsPipeline.hincrby("metrics:events:published", `${eventType}:v${version}`, 1);
  }
  const metricsResults = await metricsPipeline.exec().catch((err) => {
    logger.warn({ err }, "No se pudieron incrementar las metricas de eventos publicados");
    return null;
  });

  for (const [index, event] of publishedEvents.entries()) {
    const payload = event.payload as any;
    const traceId = payload?.traceId;
    const correlationId = payload?.correlationId;
    const eventType = event.eventType;
    const version = payload?.version ?? 1;
    const action = async () => {
      const [metricError] = metricsResults?.[index] ?? [];
      if (metricError) logger.warn({ err: metricError }, "No se pudo incrementar metrica de evento publicado en Redis");
      logger.info(
        { eventType, eventVersion: version, topic: "event-metrics" },
        `Métrica de evento publicado: ${eventType} v${version}`
      );
    };

    if (traceId) {
      await traceStorage.run({ traceId, correlationId }, action);
    } else {
      await action();
    }
  }

  const [published, failedRows] = await Promise.all([
    repository.markCollabOutboxPublished(publishedIds, claimToken),
    Promise.all(failures),
  ]);

  const remaining = await repository.countPendingCollabOutboxEvents();
  return { processed: published.length, failed: failedRows.filter(Boolean).length, pending: remaining };
}
