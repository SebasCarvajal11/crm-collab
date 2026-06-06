import { z } from "zod";
import "dotenv/config";
import { getLogger } from "../shared/logger";

const logger = getLogger();

const pemFromEnv = z
  .string()
  .min(1)
  .transform((s) => s.replace(/\\n/g, "\n").trim());

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
    DB_SCHEMA: z.literal("schema_collab"),
    PORT: z.coerce.number().default(3001),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    MOD_COLLAB_CORS: z
      .union([z.literal("true"), z.literal("false")])
      .default("false")
      .transform((v) => v === "true"),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    TRUST_GATEWAY_JWT_HEADERS: z
      .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
      .default("true")
      .transform((v) => v === "true" || v === "1"),
    GATEWAY_TRUST_SECRET: z.string().min(32),
    JWT_PUBLIC_KEY: pemFromEnv.optional(),
    JWT_ISS: z.string().optional(),
    /**
     * URI del endpoint JWKS de crm-auth (e.g. http://auth:3000/.well-known/jwks.json).
     * Alternativa a JWT_PUBLIC_KEY para validación directa de tokens sin pasar
     * por el gateway. Si ambos están presentes, JWT_PUBLIC_KEY tiene precedencia.
     */
    JWKS_URI: z.string().url().optional(),
    /** TTL del caché de claves JWKS en milisegundos. Por defecto 5 minutos. */
    JWKS_CACHE_TTL_MS: z.coerce.number().int().min(10_000).default(5 * 60 * 1000),
    REDIS_URL: z.string().url().optional(),
    REDIS_STREAMS_KEY: z.string().default("collab:events"),
    REDIS_CONSUMER_GROUP: z.string().default("collab-processors"),
    HOSTNAME: z.string().default("localhost"),
    MEDIA_COMMANDS_STREAM_KEY: z.string().default("media:commands"),
    MEDIA_RESPONSES_STREAM_KEY: z.string().default("media:responses"),
    MEDIA_RESPONSES_CONSUMER_GROUP: z.string().default("collab-media-response-consumers"),
    MEDIA_COMMAND_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(8000),
    DOC_PAR_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
    AUTH_EVENTS_STREAM_KEY: z.string().default("auth:events"),
    AUTH_EVENTS_CONSUMER_GROUP: z.string().default("collab-auth-consumers"),
    AUTH_EVENTS_MAX_RETRIES: z.coerce.number().int().min(1).max(20).default(3),
    AUTH_EVENTS_PENDING_IDLE_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(30_000),
    COLLAB_EVENTS_DLQ_STREAM_KEY: z.string().default("collab:events:dlq"),
  })
  .superRefine((data, ctx) => {
    if (
      !data.TRUST_GATEWAY_JWT_HEADERS &&
      !data.JWT_PUBLIC_KEY &&
      !data.JWKS_URI
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "JWT_PUBLIC_KEY o JWKS_URI es requerida cuando TRUST_GATEWAY_JWT_HEADERS=false",
        path: ["JWT_PUBLIC_KEY"],
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logger.error({ fieldErrors: parsed.error.flatten().fieldErrors }, "Variables de entorno invalidas en mod-collab");
  process.exit(1);
}

export const env = parsed.data;
