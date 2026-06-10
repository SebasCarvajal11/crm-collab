/**
 * Catálogo centralizado de categorías de error y mapeo a códigos HTTP estándar.
 */

export const ErrorCategory = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  DEPENDENCY_FAILED: "DEPENDENCY_FAILED",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
} as const;

export type ErrorCategoryType = typeof ErrorCategory[keyof typeof ErrorCategory];

export interface ErrorMapping {
  statusCode: number;
  code: string;
  defaultMessage: string;
}

export const ERROR_CATALOG: Record<ErrorCategoryType, ErrorMapping> = {
  VALIDATION_ERROR: {
    statusCode: 400,
    code: "VALIDATION_ERROR",
    defaultMessage: "La validación de la solicitud falló.",
  },
  UNAUTHORIZED: {
    statusCode: 401,
    code: "UNAUTHORIZED",
    defaultMessage: "Se requiere autenticación para acceder a este recurso.",
  },
  FORBIDDEN: {
    statusCode: 403,
    code: "FORBIDDEN",
    defaultMessage: "No tiene permisos para acceder a este recurso.",
  },
  NOT_FOUND: {
    statusCode: 404,
    code: "NOT_FOUND",
    defaultMessage: "El recurso solicitado no fue encontrado.",
  },
  CONFLICT: {
    statusCode: 409,
    code: "CONFLICT",
    defaultMessage: "Existe un conflicto con el estado actual del recurso.",
  },
  DEPENDENCY_FAILED: {
    statusCode: 503,
    code: "DEPENDENCY_FAILED",
    defaultMessage: "Un servicio dependiente no respondió o falló.",
  },
  RATE_LIMIT_EXCEEDED: {
    statusCode: 429,
    code: "RATE_LIMIT_EXCEEDED",
    defaultMessage: "Se ha excedido el límite de solicitudes permitidas.",
  },
  INTERNAL_SERVER_ERROR: {
    statusCode: 500,
    code: "INTERNAL_SERVER_ERROR",
    defaultMessage: "Ocurrió un error interno en el servidor.",
  },
};

/**
 * Obtiene el mapeo de error para una categoría específica.
 */
export function getErrorMapping(category: ErrorCategoryType): ErrorMapping {
  return ERROR_CATALOG[category] || ERROR_CATALOG.INTERNAL_SERVER_ERROR;
}
