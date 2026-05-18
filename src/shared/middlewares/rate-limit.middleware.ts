import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./auth.middleware";
import { AppError } from "./error-handler.middleware";

interface RateRecord {
  count: number;
  resetAt: number;
}

const attempts = new Map<string, RateRecord>();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupExpired(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, record] of attempts) {
    if (record.resetAt <= now) {
      attempts.delete(key);
    }
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

    cleanupExpired(now);

    const record = attempts.get(bucketKey);
    if (record && record.resetAt > now) {
      if (record.count >= opts.maxAttempts) {
        throw new AppError(429, "Demasiadas solicitudes. Intenta más tarde.");
      }
      record.count++;
    } else {
      attempts.set(bucketKey, { count: 1, resetAt: now + opts.windowMs });
    }

    await next();
  });
}
