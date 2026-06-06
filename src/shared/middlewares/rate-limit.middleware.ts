import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./auth.middleware";
import { AppError } from "./error-handler.middleware";
import { getRedisConnection } from "../redis";
import { getLogger } from "../logger";

const logger = getLogger();

interface RateRecord {
  count: number;
  resetAt: number;
}

const memoryAttempts = new Map<string, RateRecord>();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupExpired(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, record] of memoryAttempts) {
    if (record.resetAt <= now) {
      memoryAttempts.delete(key);
    }
  }
}

function checkMemoryLimit(
  bucketKey: string,
  now: number,
  opts: { maxAttempts: number; windowMs: number }
): void {
  cleanupExpired(now);
  const record = memoryAttempts.get(bucketKey);
  if (record && record.resetAt > now) {
    if (record.count >= opts.maxAttempts) {
      throw new AppError(429, "Demasiadas solicitudes. Intenta más tarde.");
    }
    record.count++;
  } else {
    memoryAttempts.set(bucketKey, { count: 1, resetAt: now + opts.windowMs });
  }
}

async function checkRedisLimit(
  bucketKey: string,
  opts: { maxAttempts: number; windowMs: number }
): Promise<boolean> {
  const redis = getRedisConnection();
  if (!redis) return false;

  const key = `collab:ratelimit:${bucketKey}`;
  try {
    const result = await redis.eval(
      `local current = redis.call('incr', KEYS[1])
       if tonumber(current) == 1 then
         redis.call('pexpire', KEYS[1], ARGV[1])
       end
       return current`,
      1,
      key,
      opts.windowMs
    );
    const count = typeof result === "number" ? result : Number(result);

    if (count > opts.maxAttempts) {
      throw new AppError(429, "Demasiadas solicitudes. Intenta más tarde.");
    }
    return true;
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error({ err }, "[rate-limit] Redis no disponible, usando memoria local");
    return false;
  }
}

function collabRelativePath(path: string): string {
  const trimmed = path.replace(/\/+$/, "") || "/";
  if (trimmed.startsWith("/collab")) {
    const rest = trimmed.slice("/collab".length);
    return rest || "/";
  }
  return trimmed;
}

function resolveWriteLimit(path: string, method: string): { maxAttempts: number; windowMs: number } {
  const route = collabRelativePath(path);
  if (method === "POST" && /\/chat\/(internal|external)$/.test(route)) {
    return { maxAttempts: 40, windowMs: 60 * 1000 };
  }
  if (method === "POST" && route.endsWith("/files/upload-url")) {
    return { maxAttempts: 40, windowMs: 15 * 60 * 1000 };
  }
  if (method === "POST" && (route.endsWith("/files/metadata") || route.endsWith("/files"))) {
    return { maxAttempts: 40, windowMs: 15 * 60 * 1000 };
  }
  if (method === "POST" && route === "/projects") {
    return { maxAttempts: 15, windowMs: 60 * 60 * 1000 };
  }
  return { maxAttempts: 100, windowMs: 15 * 60 * 1000 };
}

/** Rate limit en mutaciones (POST/PUT/PATCH/DELETE) por usuario y ruta. */
export function collabWriteRateLimit() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const method = c.req.method;
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      await next();
      return;
    }

    const userKey =
      c.req.header("x-user-id")?.trim() ||
      c.req.header("x-user-sub")?.trim() ||
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";
    const path = c.req.path;
    const opts = resolveWriteLimit(path, method);
    const bucketKey = `${method}:${path}:${userKey}`;
    const now = Date.now();

    const usedRedis = await checkRedisLimit(bucketKey, opts);
    if (!usedRedis) {
      checkMemoryLimit(bucketKey, now, opts);
    }

    await next();
  });
}
