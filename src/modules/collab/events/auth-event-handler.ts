import { getRedisSubscriber } from "../../../shared/redis";
import { env } from "../../../config/env";
import {
  deleteUserIdentitySnapshot,
  upsertUserIdentitySnapshot,
} from "../../../shared/identity-snapshot-store";
import { authIdentityEventSchema } from "@sebascarvajal11/cima-contracts/auth-identity-events";
import {
  appendAuthEventToDlq,
  streamFieldsToObject,
} from "./auth-events-dlq";
import { getLogger } from "../../../shared/logger";

const logger = getLogger();

let running = false;
let readLoopPromise: Promise<void> | null = null;

class NonRetryableAuthEventError extends Error {
  constructor(
    message: string,
    readonly reason: string,
  ) {
    super(message);
    this.name = "NonRetryableAuthEventError";
  }
}

export async function startAuthEventConsumer(): Promise<void> {
  const redis = getRedisSubscriber();
  if (!redis) {
    logger.info(
      "[auth-event-consumer] Redis no disponible; omitiendo consumer de auth events"
    );
    return;
  }

  try {
    await redis.xgroup(
      "CREATE",
      env.AUTH_EVENTS_STREAM_KEY,
      env.AUTH_EVENTS_CONSUMER_GROUP,
      "0",
      "MKSTREAM"
    );
  } catch (err: any) {
    if (!err.message?.includes("already exists")) {
      logger.error({ err }, "[auth-event-consumer] XGROUP CREATE failed");
      throw err;
    }
  }

  running = true;
  logger.info(
    { consumerGroup: env.AUTH_EVENTS_CONSUMER_GROUP, streamKey: env.AUTH_EVENTS_STREAM_KEY },
    "[auth-event-consumer] Connected as consumer"
  );

  readLoopPromise = readLoop(redis);
}

export async function stopAuthEventConsumer(): Promise<void> {
  running = false;
  if (readLoopPromise) {
    try {
      const pub = getRedisSubscriber();
      if (pub) {
        await pub.xadd(env.AUTH_EVENTS_STREAM_KEY, "*", "__shutdown__", "1");
      }
    } catch {
      // ignore
    }
    await Promise.race([
      readLoopPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 3000)),
    ]);
  }
}

async function readLoop(redis: any): Promise<void> {
  const consumerId = `${env.HOSTNAME}-${process.pid}`;

  while (running) {
    try {
      await reclaimAndProcessPendingMessages(redis, consumerId);

      const results = (await redis.xreadgroup(
        "GROUP",
        env.AUTH_EVENTS_CONSUMER_GROUP,
        consumerId,
        "COUNT",
        25,
        "BLOCK",
        5000,
        "STREAMS",
        env.AUTH_EVENTS_STREAM_KEY,
        ">"
      )) as any[] | null;

      if (!results || !results.length) continue;

      await processReadResults(redis, consumerId, results);
    } catch (err) {
      if (!running) break;
      logger.error({ err }, "[auth-event-consumer] Read loop error");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function reclaimAndProcessPendingMessages(
  redis: any,
  consumerId: string,
): Promise<void> {
  const claimed = (await redis.xautoclaim(
    env.AUTH_EVENTS_STREAM_KEY,
    env.AUTH_EVENTS_CONSUMER_GROUP,
    consumerId,
    env.AUTH_EVENTS_PENDING_IDLE_MS,
    "0-0",
    "COUNT",
    25,
  )) as [string, [string, string[]][], string[]?] | null;

  const messages = claimed?.[1];
  if (!messages?.length) return;

  await processMessages(redis, consumerId, messages);
}

async function processReadResults(
  redis: any,
  consumerId: string,
  results: any[],
): Promise<void> {
  for (const [, messages] of results) {
    if (!messages || !messages.length) continue;
    await processMessages(redis, consumerId, messages);
  }
}

async function processMessages(
  redis: any,
  consumerId: string,
  messages: [string, string[]][],
): Promise<void> {
  for (const [messageId, fields] of messages) {
    const fieldMap = new Map(Object.entries(streamFieldsToObject(fields)));

    if (fieldMap.get("__shutdown__") === "1") {
      await ackMessage(redis, messageId);
      continue;
    }

    const payloadJson = fieldMap.get("payload");
    if (!payloadJson) {
      await moveMessageToDlq(redis, consumerId, messageId, fields, {
        error: new NonRetryableAuthEventError(
          "Mensaje de stream sin campo payload",
          "malformed_message",
        ),
        payloadJson,
        deliveryCount: await getDeliveryCount(redis, messageId),
      });
      await ackMessage(redis, messageId);
      continue;
    }

    let event: any;
    try {
      event = JSON.parse(payloadJson);
    } catch (err) {
      await moveMessageToDlq(redis, consumerId, messageId, fields, {
        error: new NonRetryableAuthEventError(
          "Payload JSON invalido",
          "invalid_json",
        ),
        payloadJson,
        deliveryCount: await getDeliveryCount(redis, messageId),
      });
      await ackMessage(redis, messageId);
      continue;
    }

    const deliveryCount = await getDeliveryCount(redis, messageId);

    try {
      await handleAuthEvent(event);
      await ackMessage(redis, messageId);
    } catch (err) {
      const retryable = !(err instanceof NonRetryableAuthEventError);
      const shouldRetry = retryable && deliveryCount < env.AUTH_EVENTS_MAX_RETRIES;

      if (shouldRetry) {
        logger.warn({ messageId, deliveryCount, maxRetries: env.AUTH_EVENTS_MAX_RETRIES, error: err instanceof Error ? err.message : String(err) }, "[auth-event-consumer] Error procesando evento; se reintentara");
        continue;
      }

      await moveMessageToDlq(redis, consumerId, messageId, fields, {
        error: err,
        payloadJson,
        deliveryCount,
      });
      await ackMessage(redis, messageId);
    }
  }
}

async function ackMessage(redis: any, messageId: string): Promise<void> {
  await redis.xack(
    env.AUTH_EVENTS_STREAM_KEY,
    env.AUTH_EVENTS_CONSUMER_GROUP,
    messageId,
  );
}

async function getDeliveryCount(redis: any, messageId: string): Promise<number> {
  try {
    const pending = (await redis.xpending(
      env.AUTH_EVENTS_STREAM_KEY,
      env.AUTH_EVENTS_CONSUMER_GROUP,
      messageId,
      messageId,
      1,
    )) as [string, string, number, number][] | null;

    const deliveryCount = pending?.[0]?.[3];
    return typeof deliveryCount === "number" && deliveryCount > 0
      ? deliveryCount
      : 1;
  } catch (err) {
    logger.warn({ messageId, error: err instanceof Error ? err.message : String(err) }, "[auth-event-consumer] No se pudo consultar XPENDING");
    return 1;
  }
}

async function moveMessageToDlq(
  redis: any,
  consumerId: string,
  messageId: string,
  fields: string[],
  context: {
    error: unknown;
    payloadJson?: string;
    deliveryCount: number;
  },
): Promise<void> {
  const error = normalizeError(context.error);
  const reason =
    context.error instanceof NonRetryableAuthEventError
      ? context.error.reason
      : "max_retries_exceeded";

  const dlqId = await appendAuthEventToDlq(redis, {
    sourceStream: env.AUTH_EVENTS_STREAM_KEY,
    sourceGroup: env.AUTH_EVENTS_CONSUMER_GROUP,
    sourceMessageId: messageId,
    consumerId,
    failedAt: new Date().toISOString(),
    deliveryCount: context.deliveryCount,
    reason,
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack,
    payload: context.payloadJson,
    rawFields: streamFieldsToObject(fields),
  });

  logger.error({ messageId, dlqId, reason, deliveryCount: context.deliveryCount }, "[auth-event-consumer] Evento movido a DLQ");
}

function normalizeError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}

async function handleAuthEvent(event: any): Promise<void> {
  const parsed = authIdentityEventSchema.safeParse(event);
  if (!parsed.success) {
    throw new NonRetryableAuthEventError(
      JSON.stringify({
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      }),
      "invalid_contract",
    );
  }

  const authEvent = parsed.data;

  if (authEvent.type === "user.deleted") {
    await deleteUserIdentitySnapshot(authEvent.userSub);
    logger.info(
      { userSub: authEvent.userSub },
      "[auth-event-consumer] Snapshot eliminado"
    );
    return;
  }

  await upsertUserIdentitySnapshot(authEvent);
  logger.info({ userSub: authEvent.userSub }, "[auth-event-consumer] Snapshot upsert");
}
