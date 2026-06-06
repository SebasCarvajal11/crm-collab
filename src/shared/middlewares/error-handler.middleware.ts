import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { env } from "../../config/env";
import { getLogger } from "../logger";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad Request") {
    super(400, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not Found") {
    super(404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(409, message);
  }
}

type HttpStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500;

export const onError = (err: Error, c: Context): Response => {
  if (err instanceof AppError) {
    return c.json({ error: err.message }, err.statusCode as HttpStatus);
  }
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const detail = first ? `${first.path.join(".")}: ${first.message}` : "Datos inválidos";
    return c.json({ error: detail }, 400);
  }

  const logger = c.get("requestLogger") ?? getLogger();
  const traceId = c.get("traceId");

  logger.error({
    err,
    traceId,
    method: c.req.method,
    path: c.req.path,
    msg: "unhandled error",
  });

  const body =
    env.NODE_ENV === "development"
      ? { error: err.message || "Internal Server Error", ...(traceId ? { traceId } : {}) }
      : { error: "Internal Server Error", ...(traceId ? { traceId } : {}) };
  return c.json(body, 500);
};
