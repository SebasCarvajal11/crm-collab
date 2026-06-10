import { z } from "zod";

export const GatewayRateLimitSchema = z.object({
  client_max_rate: z.number().int().positive(),
  client_capacity: z.number().int().positive(),
  every: z.string().min(1),
  strategy: z.enum(["ip", "user"]).optional(),
});

export const GatewayManifestEndpointSchema = z.object({
  endpoint: z.string().startsWith("/api/v1/"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]),
  backend_url: z.string().startsWith("/"),
  public: z.boolean().optional(),
  openapi_ref: z.string().min(1),
  input_query_strings: z.array(z.string().min(1)).optional(),
  extra_headers: z.array(z.string().min(1)).optional(),
  rate_limit: GatewayRateLimitSchema.optional(),
});

export const GatewayManifestSchema = z.object({
  service: z.string().min(1),
  version: z.string().min(1),
  endpoints: z.array(GatewayManifestEndpointSchema).min(1),
});

export type GatewayManifest = z.infer<typeof GatewayManifestSchema>;
export type GatewayManifestEndpoint = z.infer<typeof GatewayManifestEndpointSchema>;
