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
