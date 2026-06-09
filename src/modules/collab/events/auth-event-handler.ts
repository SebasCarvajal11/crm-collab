import { z } from "zod";
import { getRedisSubscriber, getRedisConnection } from "../../../shared/redis";

import { env } from "../../../config/env";
import { db } from "../../../db/connection";
import { userIdentitySnapshots } from "../../../db/schema";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  deleteUserIdentitySnapshot,
  upsertUserIdentitySnapshot,
  anonymizeUserPII,
} from "../../../shared/identity-snapshot-store";
import {
  authIdentityEventV1Schema,
  authIdentityEventV2Schema,
  type AuthIdentityEvent,
} from "@sebascarvajal11/cima-contracts/auth-identity-events";
import {
  RedisStreamConsumer,
  NonRetryableStreamError,
  type DlqContext,
  type VersionedSchemas,
} from "@sebascarvajal11/cima-contracts/event-consumer";
import { appendAuthEventToDlq } from "./auth-events-dlq";
import { getLogger, traceStorage } from "../../../shared/logger";
import { SimpleCircuitBreaker } from "../../../shared/media-command-client";

const logger = getLogger();

const authConsumerCircuitBreaker = new SimpleCircuitBreaker(
  0.5,   // thresholdRate
  60000, // windowMs
  30000, // cooldownMs
  3      // minRequests
);

// ── Versioned schemas accepted by this consumer ───────────────────────────────
//
// This map is the single source of truth for which versions are accepted.
// Adding a new version only requires updating this map and providing a handler
// branch in `handleAuthEvent`. The DLQ routing for unsupported versions is
// handled automatically by RedisStreamConsumer.

const versionedSchemas: VersionedSchemas<AuthIdentityEvent> = new Map([
  [1, authIdentityEventV1Schema as z.ZodType<AuthIdentityEvent>],
  [2, authIdentityEventV2Schema as z.ZodType<AuthIdentityEvent>],
]);

// ── Consumer instance ─────────────────────────────────────────────────────────

let consumer: RedisStreamConsumer<AuthIdentityEvent> | null = null;

export async function startAuthEventConsumer(): Promise<void> {
  const redis = getRedisSubscriber();
  if (!redis) {
    logger.info("[auth-event-consumer] Redis no disponible; omitiendo consumer de auth events");
    return;
  }

  consumer = new RedisStreamConsumer<AuthIdentityEvent>({
    streamKey:        env.AUTH_EVENTS_STREAM_KEY,
    groupName:        env.AUTH_EVENTS_CONSUMER_GROUP,
    consumerId:       `${env.HOSTNAME}-${process.pid}`,
    versionedSchemas,
    handler:          handleAuthEvent,
    onDlq:            handleDlq,
    maxRetries:       env.AUTH_EVENTS_MAX_RETRIES,
    pendingIdleMs:    env.AUTH_EVENTS_PENDING_IDLE_MS,
    batchSize:        25,
    blockMs:          5000,
    errorDelayMs:     1000,
  });

  // Wrap start() with the circuit breaker so read errors open the circuit.
  const wrappedStart = async () => {
    try {
      await consumer!.start(redis);
    } catch (err) {
      authConsumerCircuitBreaker.recordFailure();
      throw err;
    }
  };

  if (!authConsumerCircuitBreaker.checkCall()) {
    logger.warn("[auth-event-consumer] Circuito abierto al intentar iniciar; se reintentará más tarde.");
    return;
  }

  await wrappedStart();
  logger.info(
    { consumerGroup: env.AUTH_EVENTS_CONSUMER_GROUP, streamKey: env.AUTH_EVENTS_STREAM_KEY },
    "[auth-event-consumer] Connected as consumer",
  );

  checkAndTriggerReplay().catch((err) => {
    logger.error({ err }, "[auth-event-consumer] Failed to check snapshots or request replay");
  });
}

export async function stopAuthEventConsumer(): Promise<void> {
  const pub = getRedisSubscriber();
  if (consumer && pub) {
    await consumer.stop(pub);
    consumer = null;
  }
}

// ── DLQ handler ───────────────────────────────────────────────────────────────

async function handleDlq(ctx: DlqContext): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) {
    logger.error({ ctx }, "[auth-event-consumer] Redis no disponible para escribir en DLQ");
    return;
  }

  const dlqId = await appendAuthEventToDlq(redis, {
    sourceStream:    ctx.sourceStream,
    sourceGroup:     ctx.sourceGroup,
    sourceMessageId: ctx.sourceMessageId,
    consumerId:      ctx.consumerId,
    failedAt:        ctx.failedAt,
    deliveryCount:   ctx.deliveryCount,
    reason:          ctx.reason,
    errorName:       ctx.errorName,
    errorMessage:    ctx.errorMessage,
    errorStack:      ctx.errorStack,
    payload:         ctx.payload,
    rawFields:       ctx.rawFields,
  });

  logger.error(
    { messageId: ctx.sourceMessageId, dlqId, reason: ctx.reason, deliveryCount: ctx.deliveryCount },
    "[auth-event-consumer] Evento movido a DLQ",
  );
}

// ── Replay trigger ────────────────────────────────────────────────────────────

async function checkAndTriggerReplay(): Promise<void> {
  const [countRow] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(userIdentitySnapshots);

  if (!countRow || countRow.count === 0) {
    logger.info("[auth-event-consumer] user_identity_snapshots is empty. Requesting replay...");
    const pub = getRedisConnection();
    if (pub) {
      const replayRequest = {
        type: "identity.replay-requested",
        timestamp: new Date().toISOString(),
        correlationId: randomUUID(),
      };
      await pub.xadd(env.AUTH_REQUESTS_STREAM_KEY, "*", "payload", JSON.stringify(replayRequest));
      logger.info(
        { streamKey: env.AUTH_REQUESTS_STREAM_KEY },
        "[auth-event-consumer] Replay request published successfully",
      );
    }
  }
}

// ── Business handler ──────────────────────────────────────────────────────────

/**
 * Handler principal para los eventos de identidad de auth.
 * Recibe el evento ya parseado y validado por RedisStreamConsumer.
 * Lanza NonRetryableStreamError para bypass inmediato a DLQ.
 */
export async function handleAuthEvent(event: AuthIdentityEvent | unknown): Promise<void> {
  const evt = event as AuthIdentityEvent;
  const version = (evt as any).version ?? 1;
  const traceId = (evt as any).traceId;
  const correlationId = (evt as any).correlationId;

  // Registrar métrica de procesamiento
  const conn = getRedisConnection();
  if (conn) {
    await conn
      .hincrby("metrics:events:processed", `${evt.type}:v${version}`, 1)
      .catch((err) => logger.warn({ err }, "No se pudo incrementar métrica de evento en Redis"));
  }
  logger.info(
    { eventType: evt.type, eventVersion: version, topic: "event-metrics" },
    `Métrica de evento procesado: ${evt.type} v${version}`,
  );

  const action = async () => {
    if (version === 1) {
      authIdentityEventV1Schema.parse({ version: 1, ...(evt as any) });
      await handleAuthEventV1(evt);
    } else if (version === 2) {
      authIdentityEventV2Schema.parse(evt);
      await handleAuthEventV2(evt);
    } else {
      // Unreachable: versionedSchemas guards this above, but kept for safety.
      throw new NonRetryableStreamError(`Unsupported event version: ${version}`, "unsupported_version");
    }
  };

  if (traceId) {
    await traceStorage.run({ traceId, correlationId }, action);
  } else {
    await action();
  }
}

async function handleAuthEventV1(event: AuthIdentityEvent): Promise<void> {
  // At this point the event is already validated as V1 by versionedSchemas.
  const anyEvent = event as any;
  if (anyEvent.type === "user.deleted") {
    await anonymizeUserPII(anyEvent.userSub);
    logger.info({ userSub: anyEvent.userSub, version: 1 }, "[auth-event-consumer] Snapshot V1 PII anonimizada");
    return;
  }
  await upsertUserIdentitySnapshot(anyEvent);
  logger.info({ userSub: anyEvent.userSub, version: 1 }, "[auth-event-consumer] Snapshot V1 upsert");
}

async function handleAuthEventV2(event: AuthIdentityEvent): Promise<void> {
  const anyEvent = event as any;
  if (anyEvent.type === "user.deleted") {
    await anonymizeUserPII(anyEvent.userSub);
    logger.info({ userSub: anyEvent.userSub, version: 2 }, "[auth-event-consumer] Snapshot V2 PII anonimizada");
    return;
  }
  // Mapeamos sólo los campos compatibles con el snapshot (tolerancia a campos extra).
  await upsertUserIdentitySnapshot({
    userSub:      anyEvent.userSub,
    email:        anyEvent.email,
    role:         anyEvent.role,
    firstName:    anyEvent.firstName ?? null,
    lastName:     anyEvent.lastName ?? null,
    clientKind:   anyEvent.clientKind ?? null,
    companyName:  anyEvent.companyName ?? null,
    profession:   anyEvent.profession ?? null,
  });
  logger.info({ userSub: anyEvent.userSub, version: 2 }, "[auth-event-consumer] Snapshot V2 upsert");
}
