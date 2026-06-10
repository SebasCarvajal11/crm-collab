import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { getLogger, traceStorage } from "./logger";
import { ERROR_CATALOG } from "./error-catalog";
import type { NormalizedError } from "./shared-ui-types";

// --- Custom Error Classes ---

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = ERROR_CATALOG.INTERNAL_SERVER_ERROR.code,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class BadRequestError extends AppError {
  constructor(message = ERROR_CATALOG.VALIDATION_ERROR.defaultMessage, details?: Record<string, unknown>) {
    super(ERROR_CATALOG.VALIDATION_ERROR.statusCode, message, ERROR_CATALOG.VALIDATION_ERROR.code, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = ERROR_CATALOG.UNAUTHORIZED.defaultMessage, details?: Record<string, unknown>) {
    super(ERROR_CATALOG.UNAUTHORIZED.statusCode, message, ERROR_CATALOG.UNAUTHORIZED.code, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = ERROR_CATALOG.FORBIDDEN.defaultMessage, details?: Record<string, unknown>) {
    super(ERROR_CATALOG.FORBIDDEN.statusCode, message, ERROR_CATALOG.FORBIDDEN.code, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = ERROR_CATALOG.NOT_FOUND.defaultMessage, details?: Record<string, unknown>) {
    super(ERROR_CATALOG.NOT_FOUND.statusCode, message, ERROR_CATALOG.NOT_FOUND.code, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = ERROR_CATALOG.CONFLICT.defaultMessage, details?: Record<string, unknown>) {
    super(ERROR_CATALOG.CONFLICT.statusCode, message, ERROR_CATALOG.CONFLICT.code, details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = ERROR_CATALOG.RATE_LIMIT_EXCEEDED.defaultMessage, details?: Record<string, unknown>) {
    super(ERROR_CATALOG.RATE_LIMIT_EXCEEDED.statusCode, message, ERROR_CATALOG.RATE_LIMIT_EXCEEDED.code, details);
  }
}

// --- Global Error Handler ---

type HttpStatus = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 503;

function getCodeFromStatus(status: number): string {
  if (status === 400) return ERROR_CATALOG.VALIDATION_ERROR.code;
  if (status === 401) return ERROR_CATALOG.UNAUTHORIZED.code;
  if (status === 403) return ERROR_CATALOG.FORBIDDEN.code;
  if (status === 404) return ERROR_CATALOG.NOT_FOUND.code;
  if (status === 409) return ERROR_CATALOG.CONFLICT.code;
  if (status === 429) return ERROR_CATALOG.RATE_LIMIT_EXCEEDED.code;
  if (status === 502 || status === 503) return ERROR_CATALOG.DEPENDENCY_FAILED.code;
  return ERROR_CATALOG.INTERNAL_SERVER_ERROR.code;
}

export const onError = (err: Error, c: Context): Response => {
  const logger = c.get("requestLogger") ?? getLogger();
  const traceId = c.get("traceId");
  const correlationId = traceStorage.getStore()?.correlationId ?? c.req.header("x-correlation-id");

  let statusCode: HttpStatus = 500;
  let responseBody: NormalizedError = {
    code: ERROR_CATALOG.INTERNAL_SERVER_ERROR.code,
    message: ERROR_CATALOG.INTERNAL_SERVER_ERROR.defaultMessage,
    traceId,
    correlationId,
  };

  if (err instanceof AppError) {
    statusCode = err.statusCode as HttpStatus;
    responseBody = {
      code: err.code,
      message: err.message,
      details: err.details,
      traceId,
      correlationId,
    };
  } else if (err instanceof HTTPException) {
    statusCode = err.status as HttpStatus;
    responseBody = {
      code: getCodeFromStatus(err.status),
      message: err.message || "HTTP Exception",
      traceId,
      correlationId,
    };
  } else if (err instanceof ZodError) {
    statusCode = ERROR_CATALOG.VALIDATION_ERROR.statusCode as HttpStatus;
    const issues = err.issues.map(i => ({
      path: i.path.join("."),
      message: i.message,
    }));
    responseBody = {
      code: ERROR_CATALOG.VALIDATION_ERROR.code,
      message: process.env.NODE_ENV === "development"
        ? (issues[0] ? `${issues[0].path}: ${issues[0].message}` : "Validation failed")
        : "La validación de los datos de entrada falló.",
      details: { issues },
      traceId,
      correlationId,
    };
  } else {
    logger.error({
      err,
      traceId,
      correlationId,
      method: c.req.method,
      path: c.req.path,
      msg: "unhandled error",
    });

    if (process.env.NODE_ENV === "development") {
      responseBody.message = err.message || "Internal Server Error";
    }
  }

  return c.json(responseBody, statusCode);
};
