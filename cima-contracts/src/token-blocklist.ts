import { createHash } from "node:crypto";
import { getRedisConnection } from "./redis";
import { getLogger } from "./logger";

const logger = getLogger();

const BLOCKLIST_PREFIX = "auth:blocklist:";
const USER_REVOKED_PREFIX = "auth:user_revoked_at:";
const DEFAULT_TTL_SECONDS = 900; // 15 minutos

export function computeTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function revokeToken(
  token: string,
  exp?: number
): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;

  const now = Math.floor(Date.now() / 1000);
  const ttl = exp && exp > now ? exp - now : DEFAULT_TTL_SECONDS;
  const hash = computeTokenHash(token);

  try {
    await redis.setex(`${BLOCKLIST_PREFIX}${hash}`, Math.max(1, ttl), "1");
  } catch (err) {
    logger.warn(
      { topic: "auth:blocklist", err },
      "Error guardando token en blocklist de Redis"
    );
  }
}

export async function isTokenRevoked(token: string): Promise<boolean> {
  const redis = getRedisConnection();
  if (!redis) return false;

  const hash = computeTokenHash(token);
  try {
    const exists = await redis.exists(`${BLOCKLIST_PREFIX}${hash}`);
    return exists === 1;
  } catch (err) {
    logger.warn(
      { topic: "auth:blocklist", err },
      "Error verificando token en blocklist de Redis"
    );
    return false;
  }
}

export async function revokeUserSessions(
  userId: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) return;

  const now = Math.floor(Date.now() / 1000);
  try {
    await redis.setex(
      `${USER_REVOKED_PREFIX}${userId}`,
      ttlSeconds,
      String(now)
    );
  } catch (err) {
    logger.warn(
      { topic: "auth:blocklist", err },
      "Error revocando sesiones de usuario en Redis"
    );
  }
}

export async function isUserRevoked(
  userId: string,
  tokenIat?: number
): Promise<boolean> {
  if (!tokenIat) return false;
  const redis = getRedisConnection();
  if (!redis) return false;

  try {
    const revokedAt = await redis.get(`${USER_REVOKED_PREFIX}${userId}`);
    if (!revokedAt) return false;
    return tokenIat < parseInt(revokedAt, 10);
  } catch (err) {
    logger.warn(
      { topic: "auth:blocklist", err },
      "Error verificando revocación de usuario en Redis"
    );
    return false;
  }
}
