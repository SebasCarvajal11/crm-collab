import { z } from "zod";

// ── DLQ context ──────────────────────────────────────────────────────────────

export interface DlqContext {
  sourceStream: string;
  sourceGroup: string;
  sourceMessageId: string;
  consumerId: string;
  failedAt: string;
  deliveryCount: number;
  /** Reason code for the failure */
  reason: DlqReason;
  errorName: string;
  errorMessage: string;
  errorStack?: string;
  /** Raw JSON payload string, if available */
  payload?: string;
  /** Raw key-value field map from the stream message */
  rawFields: Record<string, string>;
}

export type DlqReason =
  | "malformed_message"
  | "invalid_json"
  | "unsupported_version"
  | "invalid_schema"
  | "max_retries_exceeded"
  | "invalid_signature"
  | string;

// ── Versioned schema map ──────────────────────────────────────────────────────

/**
 * Map of event version number → Zod schema that validates that version's payload.
 * E.g. `{ 1: authIdentityEventV1Schema, 2: authIdentityEventV2Schema }`
 */
export type VersionedSchemas<T> = Map<number, z.ZodType<T>>;

// ── Consumer configuration ────────────────────────────────────────────────────

export interface RedisStreamConsumerConfig<T> {
  /** Redis stream key to consume from. */
  streamKey: string;
  /** Consumer group name. */
  groupName: string;
  /**
   * Consumer ID. Typically `${hostname}-${pid}` or similar.
   * Must be unique per replica.
   */
  consumerId: string;
  /**
   * Map of event payload version number → Zod schema.
   * Only versions present in this map are accepted; all others go to DLQ.
   */
  versionedSchemas: VersionedSchemas<T>;
  /**
   * Business handler. Called once per successfully parsed and version-validated event.
   * Throw a `NonRetryableStreamError` to immediately route to DLQ without retrying.
   * Any other thrown error is retried up to `maxRetries`.
   */
  handler: (event: T) => Promise<void>;
  /**
   * Called when a message is moved to DLQ. Implement persistence here.
   * If omitted, DLQ events are only logged.
   */
  onDlq?: (ctx: DlqContext) => Promise<void>;
  /** How many messages to pull per XREADGROUP call. Default: 25. */
  batchSize?: number;
  /** BLOCK timeout in ms for XREADGROUP. Default: 5000. */
  blockMs?: number;
  /**
   * How many times to attempt delivery before routing to DLQ.
   * Default: 3.
   */
  maxRetries?: number;
  /**
   * Idle time in ms before XAUTOCLAIM reclaims pending messages from dead consumers.
   * Default: 30_000.
   */
  pendingIdleMs?: number;
  /**
   * Back-off delay in ms on a read-loop error. Default: 1000.
   */
  errorDelayMs?: number;
}

// ── Non-retryable sentinel ────────────────────────────────────────────────────

/**
 * Throw this from your `handler` to bypass the retry policy and immediately
 * route the message to DLQ with the supplied reason code.
 */
export class NonRetryableStreamError extends Error {
  readonly reason: DlqReason;
  constructor(message: string, reason: DlqReason) {
    super(message);
    this.name = "NonRetryableStreamError";
    this.reason = reason;
  }
}

// ── Core consumer class ───────────────────────────────────────────────────────

/**
 * Generic, idempotent Redis Streams consumer.
 *
 * Encapsulates: consumer group creation, XREADGROUP loop, XAUTOCLAIM for
 * pending messages, payload parsing, version validation, retry policy, and
 * DLQ routing — in a single reusable primitive that lives in `cima-contracts`.
 *
 * Usage:
 * ```ts
 * const consumer = new RedisStreamConsumer({
 *   streamKey: env.AUTH_EVENTS_STREAM_KEY,
 *   groupName: env.AUTH_EVENTS_CONSUMER_GROUP,
 *   consumerId: `${env.HOSTNAME}-${process.pid}`,
 *   versionedSchemas: new Map([
 *     [1, authIdentityEventV1Schema],
 *     [2, authIdentityEventV2Schema],
 *   ]),
 *   handler: handleAuthEvent,
 *   onDlq: (ctx) => appendAuthEventToDlq(redis, ctx),
 *   maxRetries: env.AUTH_EVENTS_MAX_RETRIES,
 *   pendingIdleMs: env.AUTH_EVENTS_PENDING_IDLE_MS,
 * });
 *
 * await consumer.start(redisSubscriberClient);
 * // ... later:
 * await consumer.stop(redisPublisherClient);
 * ```
 */
export class RedisStreamConsumer<T> {
  private readonly cfg: Required<RedisStreamConsumerConfig<T>>;
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(config: RedisStreamConsumerConfig<T>) {
    this.cfg = {
      batchSize: 25,
      blockMs: 5000,
      maxRetries: 3,
      pendingIdleMs: 30_000,
      errorDelayMs: 1000,
      onDlq: async () => undefined,
      ...config,
    };
  }

  /**
   * Creates the consumer group (idempotent) and starts the read loop.
   * @param redis – ioredis (or compatible) client to use for reading.
   */
  async start(redis: AnyRedis): Promise<void> {
    try {
      await redis.xgroup(
        "CREATE",
        this.cfg.streamKey,
        this.cfg.groupName,
        "0",
        "MKSTREAM",
      );
    } catch (err: any) {
      if (!String(err?.message).includes("already exists")) throw err;
    }

    this.running = true;
    this.loopPromise = this.readLoop(redis);
  }

  /**
   * Gracefully stops the consumer. Sends a poison-pill shutdown message so the
   * blocking XREADGROUP call wakes up, then waits up to 3 s for the loop to exit.
   * @param publisher – client with write access to push the shutdown signal.
   */
  async stop(publisher: AnyRedis): Promise<void> {
    this.running = false;
    try {
      await publisher.xadd(this.cfg.streamKey, "*", "__shutdown__", "1");
    } catch {
      // ignore — the loop will exit on its own after blockMs
    }
    if (this.loopPromise) {
      await Promise.race([
        this.loopPromise,
        new Promise<void>((r) => setTimeout(r, 3000)),
      ]);
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async readLoop(redis: AnyRedis): Promise<void> {
    const { streamKey, groupName, consumerId, batchSize, blockMs } = this.cfg;

    while (this.running) {
      try {
        await this.reclaimPending(redis);

        const results = (await redis.xreadgroup(
          "GROUP",
          groupName,
          consumerId,
          "COUNT",
          batchSize,
          "BLOCK",
          blockMs,
          "STREAMS",
          streamKey,
          ">",
        )) as [string, [string, string[]][]][] | null;

        if (!results?.length) continue;

        for (const [, messages] of results) {
          if (!messages?.length) continue;
          await this.processMessages(redis, messages);
        }
      } catch (err) {
        if (!this.running) break;
        await sleep(this.cfg.errorDelayMs);
      }
    }
  }

  private async reclaimPending(redis: AnyRedis): Promise<void> {
    const { streamKey, groupName, consumerId, pendingIdleMs, batchSize } = this.cfg;
    try {
      const claimed = (await redis.xautoclaim(
        streamKey,
        groupName,
        consumerId,
        pendingIdleMs,
        "0-0",
        "COUNT",
        batchSize,
      )) as [string, [string, string[]][], string[]?] | null;

      const messages = claimed?.[1];
      if (messages?.length) {
        await this.processMessages(redis, messages);
      }
    } catch {
      // xautoclaim may not be available on older Redis; swallow silently
    }
  }

  private async processMessages(
    redis: AnyRedis,
    messages: [string, string[]][],
  ): Promise<void> {
    for (const [messageId, rawFields] of messages) {
      const fieldMap = parseStreamFields(rawFields);

      if (fieldMap.get("__shutdown__") === "1") {
        await this.ack(redis, messageId);
        continue;
      }

      const payloadJson = fieldMap.get("payload");
      if (!payloadJson) {
        await this.sendToDlq(redis, messageId, rawFields, {
          reason: "malformed_message",
          error: new NonRetryableStreamError("Stream message missing payload field", "malformed_message"),
          payloadJson: undefined,
        });
        await this.ack(redis, messageId);
        continue;
      }

      let rawEvent: unknown;
      try {
        rawEvent = JSON.parse(payloadJson);
      } catch {
        await this.sendToDlq(redis, messageId, rawFields, {
          reason: "invalid_json",
          error: new NonRetryableStreamError("Payload is not valid JSON", "invalid_json"),
          payloadJson,
        });
        await this.ack(redis, messageId);
        continue;
      }

      const version = extractVersion(rawEvent);
      const schema = this.cfg.versionedSchemas.get(version);

      if (!schema) {
        const supported = [...this.cfg.versionedSchemas.keys()].join(", ");
        await this.sendToDlq(redis, messageId, rawFields, {
          reason: "unsupported_version",
          error: new NonRetryableStreamError(
            `Event version ${version} not accepted by this consumer. Supported: [${supported}]`,
            "unsupported_version",
          ),
          payloadJson,
        });
        await this.ack(redis, messageId);
        continue;
      }

      const parsed = schema.safeParse(rawEvent);
      if (!parsed.success) {
        const issues = JSON.stringify(
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
        await this.sendToDlq(redis, messageId, rawFields, {
          reason: "invalid_schema",
          error: new NonRetryableStreamError(`Schema validation failed: ${issues}`, "invalid_schema"),
          payloadJson,
        });
        await this.ack(redis, messageId);
        continue;
      }

      const deliveryCount = await this.getDeliveryCount(redis, messageId);

      try {
        await this.cfg.handler(parsed.data);
        await this.ack(redis, messageId);
      } catch (err) {
        const nonRetryable = err instanceof NonRetryableStreamError;
        const shouldRetry = !nonRetryable && deliveryCount < this.cfg.maxRetries;

        if (shouldRetry) {
          // Leave unacked — XAUTOCLAIM will reclaim after pendingIdleMs
          continue;
        }

        await this.sendToDlq(redis, messageId, rawFields, {
          reason: nonRetryable
            ? (err as NonRetryableStreamError).reason
            : "max_retries_exceeded",
          error: err,
          payloadJson,
        });
        await this.ack(redis, messageId);
      }
    }
  }

  private async ack(redis: AnyRedis, messageId: string): Promise<void> {
    await redis.xack(this.cfg.streamKey, this.cfg.groupName, messageId);
  }

  private async getDeliveryCount(redis: AnyRedis, messageId: string): Promise<number> {
    try {
      const pending = (await redis.xpending(
        this.cfg.streamKey,
        this.cfg.groupName,
        messageId,
        messageId,
        1,
      )) as [string, string, number, number][] | null;
      const count = pending?.[0]?.[3];
      return typeof count === "number" && count > 0 ? count : 1;
    } catch {
      return 1;
    }
  }

  private async sendToDlq(
    redis: AnyRedis,
    messageId: string,
    rawFields: string[],
    opts: { reason: DlqReason; error: unknown; payloadJson?: string },
  ): Promise<void> {
    const err = normalizeError(opts.error);
    const deliveryCount = await this.getDeliveryCount(redis, messageId);
    const ctx: DlqContext = {
      sourceStream: this.cfg.streamKey,
      sourceGroup: this.cfg.groupName,
      sourceMessageId: messageId,
      consumerId: this.cfg.consumerId,
      failedAt: new Date().toISOString(),
      deliveryCount,
      reason: opts.reason,
      errorName: err.name,
      errorMessage: err.message,
      errorStack: err.stack,
      payload: opts.payloadJson,
      rawFields: streamFieldsToRecord(rawFields),
    };
    await this.cfg.onDlq(ctx);
  }
}

// ── Utility helpers ───────────────────────────────────────────────────────────

/** Minimal Redis interface required by the consumer. */
export interface AnyRedis {
  xgroup(cmd: string, key: string, group: string, id: string, mkstream?: string): Promise<unknown>;
  xreadgroup(...args: unknown[]): Promise<unknown>;
  xautoclaim(...args: unknown[]): Promise<unknown>;
  xack(key: string, group: string, id: string): Promise<unknown>;
  xadd(...args: unknown[]): Promise<unknown>;
  xpending(key: string, group: string, ...args: unknown[]): Promise<unknown>;
}

/** Parse flat Redis stream field array `[k,v,k,v,...]` into a Map. */
export function parseStreamFields(fields: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < fields.length - 1; i += 2) {
    map.set(fields[i]!, fields[i + 1]!);
  }
  return map;
}

/** Parse flat Redis stream field array into a plain object. */
export function streamFieldsToRecord(fields: string[]): Record<string, string> {
  return Object.fromEntries(parseStreamFields(fields));
}

function extractVersion(raw: unknown): number {
  if (raw !== null && typeof raw === "object" && "version" in raw) {
    const v = (raw as Record<string, unknown>).version;
    if (typeof v === "number") return v;
  }
  return 1; // default to v1 for backward compat
}

function normalizeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack };
  return { name: "UnknownError", message: String(error) };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
