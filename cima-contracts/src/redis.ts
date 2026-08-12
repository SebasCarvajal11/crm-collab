import Redis from "ioredis";

let sharedConnection: Redis | undefined;
let subscriberConnection: Redis | undefined;
let configuredUrl: string | undefined;

/**
 * Initializes the Redis connection URL. Must be called once at startup
 * before any getRedisConnection/getRedisSubscriber calls.
 */
export function initRedis(redisUrl: string): void {
  configuredUrl = redisUrl;
}

/** Returns the shared Redis connection, or undefined if not configured. */
export function getRedisConnection(): Redis | undefined {
  if (!configuredUrl) return undefined;
  if (!sharedConnection) {
    sharedConnection = new Redis(configuredUrl, {
      maxRetriesPerRequest: null,
    });
  }
  return sharedConnection;
}

/** Returns a dedicated Redis connection for subscriptions (XREADGROUP, etc). */
export function getRedisSubscriber(): Redis | undefined {
  if (!configuredUrl) return undefined;
  if (!subscriberConnection) {
    subscriberConnection = new Redis(configuredUrl, {
      maxRetriesPerRequest: null,
    });
  }
  return subscriberConnection;
}

/**
 * Creates an isolated connection for a blocking Redis stream consumer.
 *
 * A connection executing XREADGROUP BLOCK cannot safely be shared with another
 * blocking consumer: Redis serializes commands on a single TCP connection.
 * Consumers own and close the connection returned by this factory.
 */
export function createRedisStreamConsumerConnection(): Redis | undefined {
  if (!configuredUrl) return undefined;
  return new Redis(configuredUrl, {
    maxRetriesPerRequest: null,
  });
}

export async function closeRedisConnections(): Promise<void> {
  await Promise.all([
    sharedConnection?.quit().catch(() => undefined),
    subscriberConnection?.quit().catch(() => undefined),
  ]);
  sharedConnection = undefined;
  subscriberConnection = undefined;
}
