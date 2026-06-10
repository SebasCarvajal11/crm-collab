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

export async function closeRedisConnections(): Promise<void> {
  await Promise.all([
    sharedConnection?.quit().catch(() => undefined),
    subscriberConnection?.quit().catch(() => undefined),
  ]);
  sharedConnection = undefined;
  subscriberConnection = undefined;
}
