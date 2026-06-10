import { z } from "zod";

/**
 * Common UI and API states/contracts shared between backend services and the frontend SPA.
 */

// UI loading/request states
export const loadingStateSchema = z.enum(["idle", "loading", "success", "error"]);
export type LoadingState = z.infer<typeof loadingStateSchema>;

// Generic UUID/public identifier
export const publicIdSchema = z.string().uuid();
export type PublicId = z.infer<typeof publicIdSchema>;

// Normalized API error shape
export const normalizedErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  traceId: z.string().optional(),
  correlationId: z.string().uuid().optional(),
});
export type NormalizedError = z.infer<typeof normalizedErrorSchema>;

// Standard API single-item response wrapper
export interface DataResponse<T> {
  data: T;
}

// Standard API paginated response wrapper
export interface PaginatedData<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

// Dynamic schema creators for runtime validation if needed
export function createDataResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema,
  });
}

export function createPaginatedDataSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    page: z.coerce.number().int().nonnegative(),
    limit: z.coerce.number().int().positive(),
    total: z.coerce.number().int().nonnegative(),
    total_pages: z.coerce.number().int().nonnegative(),
  });
}
