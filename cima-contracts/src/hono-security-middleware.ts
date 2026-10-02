import { createMiddleware } from "hono/factory";
import { AppError } from "./hono-error-handler-middleware";
export { AppError };

/**
 * Validates request headers, lengths, and formats to limit the attack surface.
 */
export const securityHeadersMiddleware = createMiddleware(async (c, next) => {
  const headers = c.req.raw.headers;

  let headerCount = 0;
  for (const [key, value] of headers.entries()) {
    headerCount++;
    if (headerCount > 100) {
      throw new AppError(400, "Header limit exceeded");
    }
    if (key.length > 100) {
      throw new AppError(400, "Header name too long");
    }
    if (value.length > 2048) {
      throw new AppError(400, "Header value too long");
    }
    if (value.includes("\r") || value.includes("\n")) {
      throw new AppError(400, "Invalid header characters");
    }
  }

  // Validate user headers format if they are present
  const userId = c.req.header("X-User-Id");
  if (userId) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      throw new AppError(400, "Invalid User ID format");
    }
  }

  const userRole = c.req.header("X-User-Role");
  if (userRole && !["admin", "worker", "client"].includes(userRole)) {
    throw new AppError(400, "Invalid User Role format");
  }

  const userEmail = c.req.header("X-User-Email");
  if (userEmail) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (userEmail.length > 256 || !emailRegex.test(userEmail)) {
      throw new AppError(400, "Invalid User Email format");
    }
  }

  await next();
});

export type HeaderGetter =
  | { req: { header: (name: string) => string | undefined } }
  | ((name: string) => string | undefined | null)
  | Headers;

/**
 * Obtiene de forma confiable la IP del cliente mitigando IP Spoofing.
 * Prioriza X-Real-IP del proxy de borde y toma el ultimo salto de X-Forwarded-For.
 */
export function getTrustedClientIp(source: HeaderGetter): string {
  const get = (name: string): string | undefined => {
    if (typeof source === "function") return source(name) ?? undefined;
    if ("req" in source && typeof source.req.header === "function") {
      return source.req.header(name);
    }
    if (source instanceof Headers) return source.get(name) ?? undefined;
    return undefined;
  };

  const realIp = get("x-real-ip")?.trim();
  if (realIp && realIp.toLowerCase() !== "unknown") return realIp;

  const cfIp = get("cf-connecting-ip")?.trim();
  if (cfIp && cfIp.toLowerCase() !== "unknown") return cfIp;

  const xff = get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    const last = parts.pop();
    if (last && last.toLowerCase() !== "unknown") return last;
  }

  return "unknown";
}

