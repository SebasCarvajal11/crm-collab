import { z } from "zod";
import "dotenv/config";

const pemFromEnv = z
  .string()
  .min(1)
  .transform((s) => s.replace(/\\n/g, "\n").trim());

const PLACEHOLDER_PATTERN = /your[-_]|placeholder|^dummy$|changeme/i;

const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
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
    MOD_AUTH_URL: z.string().url().default("http://localhost:3000"),
    MOD_MEDIA_URL: z.string().url().default("http://localhost:3002"),
    /** Misma configuracion OCI que mod-media (archivo local de OCI + API key). */
    OCI_CONFIG_FILE_PATH: z.string().min(1, "OCI_CONFIG_FILE_PATH es requerida"),
    OCI_CONFIG_PROFILE: z.string().default("DEFAULT"),
    OCI_REGION: z.string().min(1, "OCI_REGION es requerida"),
    /** Bucket privado (p. ej. crm-docs-private); objetos bajo `projects/`. */
    OCI_BUCKET: z.string().min(1, "OCI_BUCKET es requerida"),
    DOC_PAR_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
    OCI_PAR_PRUNE_MAX: z.coerce.number().int().min(0).max(500).default(80),
    OCI_ORPHAN_GRACE_MS: z.coerce.number().int().positive().default(60 * 60 * 1000),
    OCI_ORPHAN_CLEANUP_INTERVAL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60 * 1000),
  })
  .superRefine((data, ctx) => {
    if (!data.TRUST_GATEWAY_JWT_HEADERS && !data.JWT_PUBLIC_KEY) {
      ctx.addIssue({
        code: "custom",
        message: "JWT_PUBLIC_KEY es requerida cuando TRUST_GATEWAY_JWT_HEADERS=false",
        path: ["JWT_PUBLIC_KEY"],
      });
    }

    for (const path of ["OCI_CONFIG_FILE_PATH", "OCI_BUCKET", "OCI_REGION"] as const) {
      const v = data[path];
      if (PLACEHOLDER_PATTERN.test(v)) {
        ctx.addIssue({
          code: "custom",
          message: `${path} no puede ser un valor de ejemplo; usa la configuracion real de OCI y consulta la guia segura en mod-media/Info OCI Oracle/README.md.`,
          path: [path],
        });
      }
    }

    if (data.OCI_CONFIG_FILE_PATH.includes("TODO")) {
      ctx.addIssue({
        code: "custom",
        message: "OCI_CONFIG_FILE_PATH debe apuntar a un archivo OCI config real y local antes de arrancar mod-collab.",
        path: ["OCI_CONFIG_FILE_PATH"],
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variables de entorno invalidas en mod-collab");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
