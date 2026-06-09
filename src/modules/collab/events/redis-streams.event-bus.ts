import type Redis from "ioredis";
import type { CollabEvent, CollabEventType, CollabEventPayload } from "./event.types";
import type { EventBus, EventHandler } from "./event-bus.port";
import { COLLAB_EVENT_CONTRACT_VERSION } from "@sebascarvajal11/cima-contracts/collab-project-events";
import { env } from "../../../config/env";
import { getLogger, traceStorage } from "../../../shared/logger";
import { db } from "../../../db/connection";
import { createCollabOutboxRepository } from "./collab-outbox.repository";
import { getRedisConnection } from "../../../shared/redis";

const logger = getLogger();

interface StreamMessage {
  id: string;
  payload: CollabEvent<CollabEventPayload>;
}

export class RedisStreamsEventBus implements EventBus {
  private handlers: Map<CollabEventType, EventHandler[]> = new Map();
  private globalHandlers: EventHandler[] = [];
  private running = false;
  private readLoopPromise: Promise<void> | null = null;
  private publisher: Redis;
  private subscriber: Redis;
  private streamKey: string;
  private group: string;
  private consumerId: string;

  constructor(publisher: Redis, subscriber: Redis) {
    this.publisher = publisher;
    this.subscriber = subscriber;
    this.streamKey = env.REDIS_STREAMS_KEY;
    this.group = env.REDIS_CONSUMER_GROUP;
    this.consumerId = `${env.HOSTNAME}-${process.pid}`;
  }

  on(eventType: CollabEventType, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) || [];
    this.handlers.set(eventType, [...existing, handler]);
  }

  onAny(handler: EventHandler): void {
    this.globalHandlers.push(handler);
  }

  async emit<T = CollabEventPayload>(
    eventType: CollabEventType,
    projectId: string,
    actorSub: string,
    data: T,
    tx?: any
  ): Promise<void> {
    const store = traceStorage.getStore();
    const event: CollabEvent<T> = {
      version: 1,
      contractVersion: COLLAB_EVENT_CONTRACT_VERSION,
      type: eventType,
      projectId,
      actorSub,
      timestamp: new Date(),
      data,
      traceId: store?.traceId,
      correlationId: store?.correlationId,
    };

    try {
      const conn = tx || db;
      const repository = createCollabOutboxRepository(conn);
      await repository.createCollabOutboxEvent(eventType, projectId, event as any);
    } catch (err) {
      logger.error({ err, eventType }, `[RedisStreamsEventBus] Failed to save outbox event ${eventType}`);
      throw err;
    }

    await this.dispatchLocal(event as CollabEvent<CollabEventPayload>);
  }

  off(eventType: CollabEventType, handler: EventHandler): void {
    const existing = this.handlers.get(eventType);
    if (existing) {
      this.handlers.set(
        eventType,
        existing.filter((h) => h !== handler)
      );
    }
  }

  clear(): void {
    this.handlers.clear();
    this.globalHandlers = [];
  }

  async connect(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      // Ensure consumer group exists (MKSTREAM creates stream if absent)
      await this.subscriber.xgroup(
        "CREATE",
        this.streamKey,
        this.group,
        "$",
        "MKSTREAM"
      );
    } catch (err: any) {
      if (!err.message?.includes("already exists")) {
        logger.error({ err }, "[RedisStreamsEventBus] XGROUP CREATE failed");
        throw err;
      }
    }

    this.readLoopPromise = this.readLoop();
    logger.info(
      { consumerId: this.consumerId, group: this.group, streamKey: this.streamKey },
      "[RedisStreamsEventBus] Connected as consumer"
    );
  }

  async disconnect(): Promise<void> {
    this.running = false;
    if (this.readLoopPromise) {
      // Wake up the blocking read by pushing a dummy message, then wait a bit
      try {
        await this.publisher.xadd(this.streamKey, "*", "__shutdown__", "1");
      } catch {
        // ignore
      }
      // Give the loop a moment to exit gracefully
      await Promise.race([
        this.readLoopPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
    this.subscriber.disconnect();
    this.publisher.disconnect();
    logger.info("[RedisStreamsEventBus] Disconnected");
  }

  private async readLoop(): Promise<void> {
    while (this.running) {
      try {
        const results = (await this.subscriber.xreadgroup(
          "GROUP",
          this.group,
          this.consumerId,
          "BLOCK",
          5000,
          "STREAMS",
          this.streamKey,
          ">"
        )) as any[] | null;

        if (!results || !results.length) continue;

        for (const [, messages] of results) {
          if (!messages || !messages.length) continue;

          for (const [messageId, fields] of messages) {
            // fields is a flat array: [key1, value1, key2, value2, ...]
            const payloadIndex = (fields as string[]).indexOf("payload");
            if (payloadIndex === -1 || payloadIndex + 1 >= fields.length) {
              logger.warn({ messageId }, "[RedisStreamsEventBus] Malformed stream message");
              continue;
            }
            const payloadJson = (fields as string[])[payloadIndex + 1];

            // Skip internal shutdown sentinel
            if (payloadJson === "1" && (fields as string[]).includes("__shutdown__")) {
              await this.subscriber.xack(this.streamKey, this.group, messageId);
              continue;
            }

            let event: CollabEvent<CollabEventPayload>;
            try {
              event = JSON.parse(payloadJson);
            } catch {
              logger.warn({ messageId }, "[RedisStreamsEventBus] Invalid JSON in stream message");
              await this.subscriber.xack(this.streamKey, this.group, messageId);
              continue;
            }

            await this.dispatchLocal(event);
            await this.subscriber.xack(this.streamKey, this.group, messageId);
          }
        }
      } catch (err) {
        if (!this.running) break;
        logger.error({ err }, "[RedisStreamsEventBus] Read loop error");
        // Brief backoff before retrying
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  private async dispatchLocal(event: CollabEvent<CollabEventPayload>): Promise<void> {
    const specificHandlers = this.handlers.get(event.type) || [];
    const allHandlers = [...specificHandlers, ...this.globalHandlers];

    const traceId = event.traceId || `evt-${event.type}-${Date.now()}`;
    const correlationId = event.correlationId;
    const version = event.version ?? 1;

    await traceStorage.run({ traceId, correlationId }, async () => {
      const results = await Promise.allSettled(
        allHandlers.map((handler) => Promise.resolve(handler(event)))
      );

      const failed = results.filter((r) => r.status === "rejected");
      const conn = getRedisConnection();
      if (conn) {
        if (failed.length > 0) {
          await conn.hincrby("metrics:events:processed_failed", `${event.type}:v${version}`, 1)
            .catch((err) => logger.warn({ err }, "No se pudo incrementar metrica de evento procesado con error en Redis"));
        } else {
          await conn.hincrby("metrics:events:processed", `${event.type}:v${version}`, 1)
            .catch((err) => logger.warn({ err }, "No se pudo incrementar metrica de evento procesado en Redis"));
        }
      }

      logger.info(
        { eventType: event.type, eventVersion: version, topic: "event-metrics", success: failed.length === 0 },
        `Métrica de evento procesado: ${event.type} v${version} (success: ${failed.length === 0})`
      );

      results.forEach((r, idx) => {
        if (r.status === "rejected") {
          logger.error({ err: r.reason, eventType: event.type }, `[RedisStreamsEventBus] Error in handler for ${event.type}`);
        }
      });
    });
  }
}
