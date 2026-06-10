import { z } from "zod";
import "dotenv/config";
import { getLogger } from "../shared/logger";
import { STREAM_CONVENTIONS } from "@sebascarvajal11/cima-contracts";

const logger = getLogger();

const pemFromEnv = z
  .string()
  .min(1)
  .transform((s) => s.replace(/\\n/g, "\n").trim());

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
    DB_SCHEMA: z.literal("schema_collab"),
    SERVICE_VERSION: z.string().default("1.0.0"),
    PORT: z.coerce.number().default(3001),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).optional(),
    SERVICE_NAME: z.string().optional(),
    MOD_COLLAB_CORS: z
      .union([z.literal("true"), z.literal("false")])
      .default("false")
      .transform((v) => v === "true"),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    TRUST_GATEWAY_JWT_HEADERS: z
      .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
      .default("false")
      .transform((v) => v === "true" || v === "1"),
    SERVICE_JWT_PRIVATE_KEY: pemFromEnv.refine(
      (pem) => pem.includes("BEGIN PRIVATE KEY"),
      "SERVICE_JWT_PRIVATE_KEY debe ser PKCS#8 PEM (BEGIN PRIVATE KEY)"
    ),
    SERVICE_JWT_PUBLIC_KEY: pemFromEnv.refine(
      (pem) => pem.includes("BEGIN PUBLIC KEY"),
      "SERVICE_JWT_PUBLIC_KEY debe ser SPKI PEM (BEGIN PUBLIC KEY)"
    ),
    SERVICE_JWT_KID: z.string().min(1).default("collab-service-rsa-1"),
    JWT_PUBLIC_KEY: pemFromEnv.optional(),
    JWT_ISS: z.string().optional(),
    /**
     * URI del endpoint JWKS de crm-auth (e.g. http://auth:3000/api/v1/.well-known/jwks.json).
     * Alternativa a JWT_PUBLIC_KEY para validación directa de tokens sin pasar
     * por el gateway. Si ambos están presentes, JWT_PUBLIC_KEY tiene precedencia.
     */
    JWKS_URI: z.string().url().optional(),
    /** TTL del caché de claves JWKS en milisegundos. Por defecto 5 minutos. */
    JWKS_CACHE_TTL_MS: z.coerce.number().int().min(10_000).default(5 * 60 * 1000),
    REDIS_URL: z.string().url().optional(),
    REDIS_STREAMS_KEY: z.string().default(STREAM_CONVENTIONS.streams.collab.events),
    REDIS_CONSUMER_GROUP: z.string().default(STREAM_CONVENTIONS.groups.collab.events),
    HOSTNAME: z.string().default("localhost"),
    MEDIA_COMMANDS_STREAM_KEY: z.string().default(STREAM_CONVENTIONS.streams.collab.mediaCommands),
    MEDIA_RESPONSES_STREAM_KEY: z.string().default(STREAM_CONVENTIONS.streams.media.assetResponses),
    MEDIA_RESPONSES_CONSUMER_GROUP: z.string().default(STREAM_CONVENTIONS.groups.collab.mediaResponses),
    MEDIA_COMMAND_TIMEOUT_MS: z.coerce.number().int().min(500).max(30000).default(8000),
    DOC_PAR_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
    AUTH_EVENTS_STREAM_KEY: z.string().default(STREAM_CONVENTIONS.streams.identity.events),
    AUTH_EVENTS_CONSUMER_GROUP: z.string().default(STREAM_CONVENTIONS.groups.collab.authIdentity),
    AUTH_REQUESTS_STREAM_KEY: z.string().default(STREAM_CONVENTIONS.streams.identity.replayRequests),
    AUDIT_EVENTS_STREAM_KEY: z.string().optional(),
    AUDIT_EVENTS_STREAM_MAXLEN: z.coerce.number().int().optional(),
    AUTH_EVENTS_MAX_RETRIES: z.coerce.number().int().min(1).max(20).default(3),
    AUTH_EVENTS_PENDING_IDLE_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(30_000),
    COLLAB_EVENTS_DLQ_STREAM_KEY: z.string().default(STREAM_CONVENTIONS.streams.collab.identityDlq),
    COLLAB_OUTBOX_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
    COLLAB_OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(50),
    DLQ_AUTO_REPLAY_INTERVAL_MS: z.coerce.number().int().nonnegative().default(60000),
    RATE_LIMIT_COLLAB_CHAT_MAX: z.coerce.number().int().positive().default(40),
    RATE_LIMIT_COLLAB_CHAT_WINDOW_MS: z.coerce.number().int().positive().default(60 * 1000),
    RATE_LIMIT_COLLAB_FILE_UPLOAD_MAX: z.coerce.number().int().positive().default(40),
    RATE_LIMIT_COLLAB_FILE_UPLOAD_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    RATE_LIMIT_COLLAB_PROJECT_MAX: z.coerce.number().int().positive().default(15),
    RATE_LIMIT_COLLAB_PROJECT_WINDOW_MS: z.coerce.number().int().positive().default(60 * 60 * 1000),
    RATE_LIMIT_COLLAB_DEFAULT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_COLLAB_DEFAULT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
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
